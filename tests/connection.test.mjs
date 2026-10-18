import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../server/store.ts";
import { createStudioServer } from "../server/http.ts";
import { StudioClient, ProjectConnection } from "../src/serverClient.ts";
import { demoProject, emptyProject } from "../src/model.ts";
async function setup() {
  const store = new ProjectStore(),
    app = createStudioServer({ store });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  function client(intercept) {
    let cookie = "";
    return new StudioClient(async (path, init) => {
      if (intercept) await intercept(path, init);
      const r = await fetch(base + path, {
        ...init,
        headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
      });
      const set = r.headers.get("set-cookie");
      if (set) cookie = set.split(";")[0];
      return r;
    });
  }
  return {
    store,
    client,
    close: () =>
      new Promise((r) =>
        app.server.close(() => {
          store.close();
          r();
        }),
      ),
  };
}
test("The actual editor connection serializes overlapping saves and retains the newest local edit", async () => {
  const s = await setup();
  let release, started;
  const barrier = new Promise((r) => (release = r)),
    began = new Promise((r) => (started = r));
  let puts = 0;
  const expected = [];
  const client = s.client(async (path, init) => {
    if (init.method === "PUT" && path.startsWith("/api/projects/")) {
      puts++;
      expected.push(JSON.parse(init.body).expectedRevision);
      if (puts === 1) {
        started();
        await barrier;
      }
    }
  });
  const p = demoProject(),
    c = new ProjectConnection(p, () => {}, client);
  try {
    await c.createCurrent();
    const a = structuredClone(c.current);
    a.name = "First";
    c.setCurrent(a);
    const first = c.save();
    await began;
    const b = structuredClone(a);
    b.name = "Latest";
    c.setCurrent(b);
    const second = c.save();
    release();
    await Promise.all([first, second]);
    assert.deepEqual(expected, [1, 2]);
    assert.equal(s.store.get(p.id).project.name, "Latest");
    assert.equal(c.state.revision, 3);
    assert.equal(c.state.dirty, false);
  } finally {
    await c.disconnect();
    await s.close();
  }
});
test("A revision conflict preserves unsaved local content and requires explicit recovery", async () => {
  const s = await setup(),
    p = demoProject(),
    c = new ProjectConnection(p, () => {}, s.client());
  try {
    await c.createCurrent();
    const l = s.store.db
      .prepare("SELECT * FROM leases WHERE project_id=?")
      .get(p.id);
    const external = structuredClone(p);
    external.name = "Server change";
    s.store.save(p.id, external, 1, l.holder, l.token);
    const own = structuredClone(p);
    own.name = "Unsaved local";
    c.setCurrent(own);
    await assert.rejects(c.save(), (e) => e.code === "revision_conflict");
    assert.equal(c.state.mode, "conflict");
    assert.equal(c.current.name, "Unsaved local");
    assert.equal(c.state.dirty, true);
    assert.equal(s.store.get(p.id).project.name, "Server change");
  } finally {
    await c.disconnect();
    await s.close();
  }
});
test("Takeover loads the authoritative revision and fences the former editor", async () => {
  const s = await setup(),
    p = demoProject(),
    a = new ProjectConnection(p, () => {}, s.client()),
    b = new ProjectConnection(p, () => {}, s.client());
  try {
    await a.createCurrent();
    await assert.rejects(b.open(p.id), (e) => e.status === 423);
    assert.equal(b.state.mode, "locked");
    await b.open(p.id, true);
    assert.equal(b.state.mode, "connected");
    await a.heartbeat();
    assert.equal(a.state.mode, "locked");
    assert.equal(b.current.id, p.id);
  } finally {
    await a.disconnect();
    await b.disconnect();
    await s.close();
  }
});
test("Changing project while a save is pending never attaches its late response to the new project", async () => {
  const s = await setup();
  let release, started;
  const barrier = new Promise((r) => (release = r)),
    began = new Promise((r) => (started = r));
  const p = demoProject(),
    c = new ProjectConnection(
      p,
      () => {},
      s.client(async (path, init) => {
        if (init.method === "PUT" && path.startsWith("/api/projects/")) {
          started();
          await barrier;
        }
      }),
    );
  try {
    await c.createCurrent();
    const edited = structuredClone(p);
    edited.name = "Old";
    c.setCurrent(edited);
    const saving = c.save().catch(() => {});
    await began;
    const next = emptyProject();
    c.setCurrent(next);
    release();
    await saving;
    assert.equal(c.state.mode, "local");
    assert.equal(c.state.projectId, null);
    assert.equal(c.current.id, next.id);
  } finally {
    await c.disconnect();
    await s.close();
  }
});
test("Restore flushes unsaved work into history before creating a new restored revision", async () => {
  const s = await setup(),
    p = demoProject();
  let loaded;
  const c = new ProjectConnection(p, (q) => (loaded = q), s.client());
  try {
    await c.createCurrent();
    const edited = structuredClone(p);
    edited.name = "Do not lose this";
    c.setCurrent(edited);
    await c.restore(1);
    assert.equal(s.store.revision(p.id, 2).name, "Do not lose this");
    assert.equal(c.state.revision, 3);
    assert.equal(loaded.name, p.name);
  } finally {
    await c.disconnect();
    await s.close();
  }
});
