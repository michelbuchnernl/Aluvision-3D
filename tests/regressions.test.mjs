import { test } from "node:test";
import assert from "node:assert/strict";
import {
  demoProject,
  group,
  groupPath,
  parseProject,
  removeObjects,
  validate,
} from "../src/model.ts";
import { ProjectStore } from "../server/store.ts";
import { ClaudeProvider, ClaudeService } from "../server/claude.ts";
import { ProjectConnection } from "../src/serverClient.ts";

const epoch = Date.parse("2026-10-18T15:00:00Z");

test("Pruning a group its objects left does not throw from groupPath", () => {
  let p = demoProject();
  const ids = p.objects.slice(0, 2).map((o) => o.id);
  p = group(p, ids, null);
  const gid = p.groups.at(-1).id;
  assert.equal(groupPath(p, gid).length, 1);
  p = removeObjects(p, ids);
  // removeObjects drops the now-empty group while the editor may still be
  // inside it for one render; that render must not take the app down.
  assert.equal(
    p.groups.some((g) => g.id === gid),
    false,
  );
  assert.deepEqual(groupPath(p, gid), []);
  // Cycles and runaway depth must still be rejected.
  const cyclic = demoProject();
  cyclic.groups = [
    { id: "a", name: "A", parentId: "b" },
    { id: "b", name: "B", parentId: "a" },
  ];
  assert.throws(() => groupPath(cyclic, "a"), /hiërarchie/);
  const bad = structuredClone(demoProject());
  bad.groups = [{ id: "g", name: "G", parentId: "missing" }];
  assert.throws(() => parseProject(JSON.stringify(bad)), /groep/i);
});

test("validate reports a dangling connection instead of dereferencing undefined", () => {
  const p = demoProject();
  const [a, b] = p.objects;
  p.connections = [
    {
      id: "c1",
      from: { objectId: a.id, socketId: "left" },
      to: { objectId: b.id, socketId: "right" },
    },
  ];
  p.objects = p.objects.filter((o) => o.id !== b.id);
  const issues = validate(p);
  const dangling = issues.find((i) => i.id === "connection-c1");
  assert.equal(dangling.severity, "warning");
  assert.match(dangling.message, /bestaat/);
  // A warning, not an error, so it never silently blocks an AI apply.
  assert.equal(
    issues.some((i) => i.severity === "error" && i.id === "connection-c1"),
    false,
  );
});

test("parseProject replaces an unparseable updatedAt so exports get a real date", () => {
  const p = parseProject(
    JSON.stringify({ ...demoProject(), updatedAt: "niet-een-datum" }),
  );
  assert.ok(Number.isFinite(Date.parse(p.updatedAt)));
  const kept = "2026-05-04T10:00:00.000Z";
  assert.equal(
    parseProject(JSON.stringify({ ...demoProject(), updatedAt: kept }))
      .updatedAt,
    kept,
  );
});

test("Inherited Object.prototype keys are not accepted as model names", () => {
  const provider = new ClaudeProvider({
    apiKey: "TEST-PRIVATE-KEY",
    enabled: true,
    clock: () => epoch,
  });
  for (const name of ["toString", "constructor", "valueOf", "__proto__"])
    assert.throws(
      () => provider.assertReady(name),
      (e) => e.code === "unknown_model",
      `${name} must be rejected`,
    );
  assert.ok(provider.assertReady("claude-sonnet-5-5").input > 0);
});

test("A storage fault while settling is not booked as an invalid proposal", async () => {
  let time = epoch;
  const store = new ProjectStore(":memory:", { clock: () => time }),
    p = demoProject();
  try {
    store.create(p);
    const lease = store.lease(p.id, "a");
    store.setBudget(p.id, 1_000_000, "a", lease.token);
    const proposal = {
      summary: "Verplaats tafel",
      questions: [],
      operations: [
        {
          type: "transform",
          id: p.objects.at(-2).id,
          position: { x: -155, y: 0, z: 0 },
          rotation: 0,
        },
      ],
    };
    const fetcher = async (url) => {
      if (url.includes("/models?"))
        return Response.json({ data: [{ id: "claude-sonnet-5-5" }] });
      if (url.endsWith("/count_tokens"))
        return Response.json({ input_tokens: 1000 });
      return Response.json({
        stop_reason: "tool_use",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "tool_use",
            name: "propose_scene",
            id: "t1",
            input: proposal,
          },
        ],
      });
    };
    const provider = new ClaudeProvider({
        apiKey: "TEST-PRIVATE-KEY",
        enabled: true,
        fetcher,
        clock: () => time,
      }),
      service = new ClaudeService(store, provider);
    const quoted = await service.quote(
      p.id,
      "a",
      lease.token,
      "Verplaats de tafel.",
      "claude-sonnet-5-5",
    );
    // The proposal itself is valid; only writing the result fails.
    const real = store.settle.bind(store);
    let settleCalls = 0;
    store.settle = () => {
      settleCalls++;
      throw Error("disk vol");
    };
    const result = await service.run(quoted.id, "a", lease.token);
    store.settle = real;
    // settle() used to sit inside the proposal-parsing try, so its failure was
    // caught and retried against a job that was no longer 'running'.
    assert.equal(settleCalls, 1, "settle must be attempted exactly once");
    assert.equal(result.status, "uncertain");
    assert.match(result.message, /disk vol/);
    // The reservation survives, because the request was billed by the provider.
    assert.ok(result.reservedMicros > 0);
    assert.equal(store.budget(p.id).reservedMicros, result.reservedMicros);
  } finally {
    store.close();
  }
});

function connection(responder) {
  const client = {
    csrf: "c",
    accessCode: "",
    clientId: "test-client-0000000000",
    session: async () => ({ csrf: "c" }),
    request: responder,
  };
  return new ProjectConnection(demoProject(), () => {}, client);
}

test("A failed background save no longer rejects the next open", async () => {
  const c = connection(async () => {
    throw Error("netwerk weg");
  });
  c.state = {
    ...c.state,
    mode: "connected",
    projectId: c.current.id,
    revision: 1,
  };
  await c.save().catch(() => {});
  // open()/createCurrent() drain the queue without adopting its rejection.
  await c.settled();
  assert.ok(true);
});

test("A successful save or heartbeat brings the session back out of offline", async () => {
  let fail = true;
  const c = connection(async (path) => {
    if (fail) throw Error("netwerk weg");
    if (path.endsWith("/lease")) return { token: "t2", expiresAt: 0 };
    return {
      project: c.current,
      revision: 2,
      createdAt: "",
      updatedAt: "",
    };
  });
  c.state = {
    ...c.state,
    mode: "connected",
    projectId: c.current.id,
    revision: 1,
  };
  c.current = { ...c.current, name: "Gewijzigd" };
  await c.save().catch(() => {});
  assert.equal(c.state.mode, "offline");
  // The heartbeat keeps running in offline and restores the mode itself.
  fail = false;
  await c.heartbeat();
  assert.equal(c.state.mode, "connected");
  assert.equal(c.leaseToken, "t2");
  // And a save attempted while still offline is allowed through.
  fail = true;
  await c.save().catch(() => {});
  assert.equal(c.state.mode, "offline");
  fail = false;
  c.current = { ...c.current, name: "Opnieuw" };
  await c.save();
  assert.equal(c.state.mode, "connected");
  assert.equal(c.state.revision, 2);
});

test("The PDF assumptions page breaks instead of running off the sheet", async () => {
  const { technicalPdf } = await import("../src/exports.ts");
  const p = demoProject();
  const clean = technicalPdf(p).getNumberOfPages();
  // Push every object far outside the room so the page fills with errors.
  const broken = structuredClone(p);
  for (const o of broken.objects) o.position.x = 9000;
  const overflow = technicalPdf(broken);
  assert.ok(
    overflow.getNumberOfPages() > clean,
    "a full error list must add a continuation page",
  );
});
