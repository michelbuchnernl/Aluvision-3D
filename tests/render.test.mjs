import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProjectStore } from "../server/store.ts";
import { createStudioServer } from "../server/http.ts";
import { RenderQueue, RenderService, MAX_ATTEMPTS } from "../server/renders.ts";
import { StudioClient } from "../src/serverClient.ts";
import { buildRenderSpec, validateRenderSpec } from "../src/renderSpec.ts";
import { demoProject } from "../src/model.ts";

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const glb = Buffer.concat([Buffer.from("glTF"), Buffer.alloc(60, 7)]);
const sha = (b) => createHash("sha256").update(b).digest("hex");
const specFor = (p, revision = 1, options = { preset: "presentation" }) =>
  buildRenderSpec(p, revision, options, {
    sha256: sha(glb),
    bytes: glb.length,
  });
const tmp = () => mkdtempSync(join(tmpdir(), "render-test-"));
/** A runner that writes real PNG-headed files exactly like the worker would report them. */
const goodRunner =
  (overrides = {}) =>
  async ({ dir }) => {
    const spec = JSON.parse(readFileSync(join(dir, "job.json"), "utf8"));
    assert.equal(sha(readFileSync(join(dir, "scene.glb"))), spec.glb.sha256);
    mkdirSync(join(dir, "out"), { recursive: true });
    const outputs = spec.outputs.map((o) => {
      const bytes = Buffer.concat([PNG_HEADER, Buffer.from(o.file)]);
      writeFileSync(join(dir, "out", o.file), bytes);
      return {
        camera: o.camera,
        file: o.file,
        bytes: bytes.length,
        sha256: sha(bytes),
        ...overrides,
      };
    });
    return { outputs, log: "" };
  };

test("spec converts centimetres to metres with the glTF→Blender axis mapping", () => {
  const p = demoProject();
  p.cameras.push({
    id: "c1",
    name: "Ooghoogte hoek",
    position: { x: -300, y: 165, z: 100 },
    target: { x: 300, y: 150, z: -100 },
    orthographic: false,
  });
  const s = specFor(p);
  validateRenderSpec(s);
  assert.deepEqual(s.cameras[0].position, [-3, -1, 1.65]);
  assert.deepEqual(s.cameras[0].target, [3, 1, 1.5]);
  assert.deepEqual(s.room, { length: 8, depth: 4, height: 3 });
  assert.equal(s.outputs[0].file, "01-ooghoogte-hoek.png");
  assert.equal(s.lighting.hazeDensity, 0);
  assert.ok(specFor(p, 1, { preset: "immersive" }).lighting.hazeDensity > 0);
});

test("without saved cameras a default overview camera is used; names stay unique", () => {
  const p = demoProject();
  const s = specFor(p);
  assert.equal(s.cameras.length, 1);
  assert.equal(s.cameras[0].name, "Overzicht");
  p.cameras.push(
    {
      id: "a",
      name: "Zicht",
      position: { x: 1, y: 100, z: 1 },
      target: { x: 0, y: 100, z: 0 },
      orthographic: false,
    },
    {
      id: "b",
      name: "Zicht!",
      position: { x: 2, y: 100, z: 1 },
      target: { x: 0, y: 100, z: 0 },
      orthographic: false,
    },
  );
  const files = specFor(p).outputs.map((o) => o.file);
  assert.equal(new Set(files).size, 2);
});

test("validation refuses unsafe or impossible jobs", () => {
  const good = () => JSON.parse(JSON.stringify(specFor(demoProject())));
  const mutate = (fn) => {
    const s = good();
    fn(s);
    return () => validateRenderSpec(s);
  };
  assert.doesNotThrow(() => validateRenderSpec(good()));
  assert.throws(
    mutate((s) => (s.outputs[0].file = "../../etc/passwd.png")),
    /uitvoerbestand/,
  );
  assert.throws(
    mutate((s) => (s.outputs[0].file = "a.exe")),
    /uitvoerbestand/,
  );
  assert.throws(
    mutate((s) => (s.resolution.width = 100000)),
    /resolutie/,
  );
  assert.throws(
    mutate((s) => ((s.resolution.width = 8192), (s.resolution.height = 8192))),
    /resolutie/,
  );
  assert.throws(
    mutate((s) => (s.samples = 0)),
    /samples/,
  );
  assert.throws(
    mutate((s) => (s.glb.sha256 = "xyz")),
    /GLB/,
  );
  assert.throws(
    mutate((s) => (s.cameras[0].position[0] = NaN)),
    /camera/,
  );
  assert.throws(
    mutate((s) => (s.cameras[0].target = [...s.cameras[0].position])),
    /zichzelf/,
  );
  assert.throws(
    mutate((s) => s.outputs.push({ camera: "Overzicht", file: "extra.png" })),
    /één bestand per camera/,
  );
  assert.throws(
    mutate((s) => (s.engine = "octane")),
    /engine/,
  );
  assert.throws(
    mutate((s) => (s.preset = "neon")),
    /voorinstelling/,
  );
  assert.throws(() => validateRenderSpec(null), /schema/);
});

function queueWith(project = demoProject()) {
  const store = new ProjectStore();
  store.create(project);
  const dir = tmp();
  return {
    store,
    dir,
    queue: new RenderQueue(store.db, dir),
    project,
    done: () => (store.close(), rmSync(dir, { recursive: true, force: true })),
  };
}

test("enqueue checks checksum, size and GLB magic before accepting a job", () => {
  const t = queueWith();
  const spec = specFor(t.project);
  assert.equal(t.queue.enqueue(spec, glb).status, "queued");
  assert.throws(
    () => t.queue.enqueue(spec, Buffer.concat([glb, Buffer.from("x")])),
    /checksum|GLB/,
  );
  const fake = Buffer.concat([Buffer.from("PNG!"), Buffer.alloc(60, 7)]);
  const bad = buildRenderSpec(
    t.project,
    1,
    { preset: "technical" },
    { sha256: sha(fake), bytes: fake.length },
  );
  assert.throws(() => t.queue.enqueue(bad, fake), /GLB/);
  assert.throws(
    () => t.queue.enqueue(spec, Buffer.alloc(0)),
    /leeg|checksum|GLB/,
  );
  t.done();
});

test("a successful job is verified against the files on disk and ends up done", async () => {
  const t = queueWith();
  const job = t.queue.enqueue(specFor(t.project), glb);
  const service = new RenderService(t.queue, goodRunner());
  const finished = await service.processNext();
  assert.equal(finished.id, job.id);
  assert.equal(finished.status, "done");
  assert.equal(finished.attempts, 1);
  assert.equal(finished.outputs.length, 1);
  assert.ok(
    t.queue.outputPath(job.id, finished.outputs[0].file).endsWith(".png"),
  );
  assert.equal(await service.processNext(), undefined, "nothing left to do");
  t.done();
});

test("a worker report that disagrees with the disk is not trusted", async () => {
  const t = queueWith();
  t.queue.enqueue(specFor(t.project), glb);
  const service = new RenderService(
    t.queue,
    goodRunner({ sha256: "0".repeat(64) }),
  );
  const r = await service.processNext();
  assert.equal(r.status, "queued", "first failure retries");
  assert.match(r.message, /Checksum/);
  t.done();
});

test("three failed attempts end the job with evidence instead of looping", async () => {
  const t = queueWith();
  const job = t.queue.enqueue(specFor(t.project), glb);
  let calls = 0;
  const service = new RenderService(t.queue, async () => {
    calls++;
    throw Error("Blender stopte met code 1. STUDIO_ERROR RuntimeError: boom");
  });
  const states = [];
  for (let i = 0; i < 5; i++)
    states.push((await service.processNext())?.status);
  assert.deepEqual(states, [
    "queued",
    "queued",
    "failed",
    undefined,
    undefined,
  ]);
  assert.equal(calls, MAX_ATTEMPTS);
  const j = t.queue.get(job.id);
  assert.equal(j.attempts, 3);
  assert.match(j.message, /Mislukt na 3 pogingen.*boom/);
  t.done();
});

test("a restart requeues running jobs but respects the attempt cap; cancel only affects queued jobs", () => {
  const t = queueWith();
  const a = t.queue.enqueue(specFor(t.project), glb),
    b = t.queue.enqueue(specFor(t.project), glb);
  assert.equal(t.queue.claim().id, a.id);
  t.store.db.prepare("UPDATE render_jobs SET attempts=3 WHERE id=?").run(a.id);
  assert.equal(t.queue.claim().id, b.id);
  const restarted = new RenderQueue(t.store.db, t.dir);
  assert.equal(restarted.get(a.id).status, "failed");
  assert.equal(restarted.get(b.id).status, "queued");
  assert.throws(() => restarted.cancel(a.id), /geannuleerd/i);
  assert.equal(restarted.cancel(b.id).status, "cancelled");
  t.done();
});

test("only files reported for a job can be downloaded; job ids cannot traverse paths", async () => {
  const t = queueWith();
  const job = t.queue.enqueue(specFor(t.project), glb);
  await new RenderService(t.queue, goodRunner()).processNext();
  assert.throws(
    () => t.queue.outputPath(job.id, "../job.json"),
    /niet gevonden/,
  );
  assert.throws(() => t.queue.outputPath(job.id, "scene.glb"), /niet gevonden/);
  assert.throws(() => t.queue.jobDir("../../etc"), /Ongeldige/);
  t.done();
});

test("HTTP: enqueue needs the edit lease and the current revision; files download as PNG", async () => {
  const store = new ProjectStore(),
    dir = tmp(),
    queue = new RenderQueue(store.db, dir),
    renders = new RenderService(queue, goodRunner());
  const app = createStudioServer({ store, renders });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  const p = demoProject();
  const saved = await client.request("/projects", "POST", { project: p });
  const spec = specFor(p, saved.revision);
  const body = { spec, glbBase64: glb.toString("base64") };
  await assert.rejects(
    client.request(`/projects/${p.id}/renders`, "POST", body),
    (e) => e.status === 423,
  );
  const lease = await client.request(`/projects/${p.id}/lease`, "POST", {});
  const stale = { ...body, spec: { ...spec, revision: saved.revision + 1 } };
  await assert.rejects(
    client.request(`/projects/${p.id}/renders`, "POST", stale, lease.token),
    (e) => e.status === 409,
  );
  const status = await client.request("/render/status");
  assert.deepEqual([status.available, status.blenderConfigured], [true, true]);
  const queued = await client.request(
    `/projects/${p.id}/renders`,
    "POST",
    body,
    lease.token,
  );
  assert.equal(queued.status, "queued");
  await renders.processNext();
  const list = await client.request(`/projects/${p.id}/renders`);
  assert.equal(list.jobs[0].status, "done");
  const file = list.jobs[0].outputs[0].file;
  const r = await fetch(`${base}/api/renders/${queued.id}/${file}`, {
    headers: { cookie, "x-studio-client": client.clientId },
  });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.ok(
    Buffer.from(await r.arrayBuffer())
      .subarray(0, 8)
      .equals(PNG_HEADER),
  );
  const missing = await fetch(`${base}/api/renders/${queued.id}/nope.png`, {
    headers: { cookie, "x-studio-client": client.clientId },
  });
  assert.equal(missing.status, 404);
  await new Promise((r) => app.server.close(r));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("HTTP without a render service says so instead of failing obscurely", async () => {
  const store = new ProjectStore(),
    app = createStudioServer({ store });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  assert.deepEqual(await client.request("/render/status"), {
    available: false,
    blenderConfigured: false,
    maxAttempts: 3,
  });
  await new Promise((r) => app.server.close(r));
  store.close();
});
