import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../server/store.ts";
import {
  ClaudeProvider,
  ClaudeService,
  MODEL_PRICES,
  usageCost,
} from "../server/claude.ts";
import { demoProject } from "../src/model.ts";
import { previewProposal } from "../src/operations.ts";
const epoch = Date.parse("2026-10-18T15:00:00Z");
function setup(options = {}) {
  let time = epoch,
    calls = 0;
  const seen = [];
  const store = new ProjectStore(":memory:", { clock: () => time }),
    p = demoProject();
  store.create(p);
  const lease = store.lease(p.id, "a");
  store.setBudget(p.id, 1_000_000, "a", lease.token);
  const proposal = {
    summary: "Verplaats tafel precies 25 cm",
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
  const fetcher = async (url, init) => {
    seen.push({ url, init });
    if (url.includes("/models?"))
      return Response.json({ data: [{ id: "claude-sonnet-5-5" }] });
    if (url.endsWith("/count_tokens"))
      return Response.json({ input_tokens: 1000 });
    calls++;
    if (options.generate) return options.generate(proposal);
    return Response.json(
      {
        stop_reason: "tool_use",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          {
            type: "tool_use",
            name: "propose_scene",
            id: "tool-1",
            input: proposal,
          },
        ],
      },
      { headers: { "request-id": "req-test" } },
    );
  };
  const provider = new ClaudeProvider({
      apiKey: "TEST-PRIVATE-KEY",
      enabled: true,
      fetcher,
      clock: () => time,
    }),
    service = new ClaudeService(store, provider);
  const quote = () =>
    service.quote(
      p.id,
      "a",
      lease.token,
      "Verplaats de tafel 25 centimeter naar rechts.",
      "claude-sonnet-5-5",
    );
  return {
    store,
    p,
    lease,
    proposal,
    provider,
    service,
    seen,
    quote,
    calls: () => calls,
    advance: (n) => (time += n),
  };
}
test("Claude quote sends compact centimetre data, uses verified availability and never exposes the key", async () => {
  const s = setup();
  try {
    const q = await s.quote();
    assert.equal(q.status, "quoted");
    assert.equal(s.calls(), 0);
    assert.ok(q.quotedMicros > 0);
    assert.ok(!JSON.stringify(q).includes("TEST-PRIVATE-KEY"));
    const body = JSON.parse(
      s.seen.find((v) => v.url.endsWith("/count_tokens")).init.body,
    );
    const input = JSON.parse(body.messages[0].content);
    assert.equal(input.scene.units, "cm");
    assert.equal(input.scene.instances.length, 36);
    assert.equal(Object.hasOwn(input.scene, "geometry"), false);
    assert.equal(body.tools[0].name, "propose_scene");
    assert.equal(body.tools[0].strict, true);
  } finally {
    s.store.close();
  }
});
test("One paid message is idempotent, costs are reconciled and proposal applies atomically", async () => {
  const s = setup();
  try {
    const q = await s.quote();
    const result = await s.service.run(q.id, "a", s.lease.token);
    assert.equal(result.status, "proposed");
    assert.equal(s.calls(), 1);
    assert.equal(s.store.get(s.p.id).revision, 1);
    assert.equal(s.store.budget(s.p.id).reservedMicros, 0);
    assert.equal(s.store.budget(s.p.id).spentMicros, 3000);
    await s.service.run(q.id, "a", s.lease.token);
    assert.equal(s.calls(), 1);
    const applied = s.store.applyJob(q.id, 1, "a", s.lease.token, false);
    assert.equal(applied.revision, 2);
    assert.equal(applied.project.objects.at(-2).position.x, -155);
    assert.equal(s.store.job(q.id).status, "applied");
  } finally {
    s.store.close();
  }
});
test("Budget reservation is atomic and blocks a second concurrent request before inference", async () => {
  let resolve;
  const waiting = new Promise((r) => (resolve = r));
  const s = setup({ generate: () => waiting });
  try {
    const a = await s.quote(),
      b = await s.quote();
    s.store.setBudget(s.p.id, a.quotedMicros + 100, "a", s.lease.token);
    const first = s.service.run(a.id, "a", s.lease.token);
    await Promise.resolve();
    await assert.rejects(
      s.service.run(b.id, "a", s.lease.token),
      (e) => e.code === "budget_exceeded",
    );
    assert.equal(s.calls(), 1);
    assert.ok(
      s.store.budget(s.p.id).reservedMicros <=
        s.store.budget(s.p.id).limitMicros,
    );
    resolve(
      Response.json({
        stop_reason: "tool_use",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [
          { type: "tool_use", name: "propose_scene", input: s.proposal },
        ],
      }),
    );
    await first;
  } finally {
    s.store.close();
  }
});
test("Stale proposals cannot overwrite later manual edits", async () => {
  const s = setup();
  try {
    const q = await s.quote();
    await s.service.run(q.id, "a", s.lease.token);
    const p = structuredClone(s.p);
    p.name = "Manual revision";
    s.store.save(p.id, p, 1, "a", s.lease.token);
    assert.throws(
      () => s.store.applyJob(q.id, 2, "a", s.lease.token, false),
      (e) => e.code === "proposal_stale",
    );
    assert.equal(s.store.get(p.id).project.name, "Manual revision");
  } finally {
    s.store.close();
  }
});
test("Room-dimension changes need explicit approval even when geometry is valid", async () => {
  const s = setup();
  try {
    s.proposal.operations = [
      { type: "room", length: 1000, depth: 500, height: 300 },
    ];
    const q = await s.quote();
    await s.service.run(q.id, "a", s.lease.token);
    assert.throws(
      () => s.store.applyJob(q.id, 1, "a", s.lease.token, false),
      (e) => e.code === "room_approval_required",
    );
    const changed = s.store.applyJob(q.id, 1, "a", s.lease.token, true);
    assert.equal(changed.project.room.length, 1000);
  } finally {
    s.store.close();
  }
});
test("Network uncertainty retains reserved budget and never retries automatically", async () => {
  const s = setup({
    generate: () => {
      throw Error("network");
    },
  });
  try {
    const q = await s.quote();
    const result = await s.service.run(q.id, "a", s.lease.token);
    assert.equal(result.status, "uncertain");
    assert.equal(s.store.budget(s.p.id).reservedMicros, q.quotedMicros);
    await s.service.run(q.id, "a", s.lease.token);
    assert.equal(s.calls(), 1);
    assert.ok(!JSON.stringify(result).includes("TEST-PRIVATE-KEY"));
  } finally {
    s.store.close();
  }
});
test("Malformed tool output still records measured usage without changing geometry", async () => {
  const s = setup({
    generate: () =>
      Response.json({
        stop_reason: "max_tokens",
        usage: { input_tokens: 1000, output_tokens: 100 },
        content: [{ type: "text", text: "partial" }],
      }),
  });
  try {
    const q = await s.quote(),
      j = await s.service.run(q.id, "a", s.lease.token);
    assert.equal(j.status, "failed");
    assert.equal(s.store.get(s.p.id).revision, 1);
    assert.equal(s.store.budget(s.p.id).spentMicros, 3000);
    assert.equal(s.store.budget(s.p.id).reservedMicros, 0);
  } finally {
    s.store.close();
  }
});
test("Three failed attempts stop the same request branch", async () => {
  const s = setup({
    generate: () => Response.json({ error: {} }, { status: 400 }),
  });
  try {
    for (let i = 0; i < 3; i++) {
      const q = await s.quote();
      await s.service.run(q.id, "a", s.lease.token);
    }
    await assert.rejects(s.quote(), (e) => e.code === "attempt_limit");
    assert.equal(s.calls(), 3);
  } finally {
    s.store.close();
  }
});
test("Expired quotes and outdated prices stop before a paid provider request", async () => {
  const s = setup();
  try {
    const q = await s.quote();
    s.advance(300001);
    s.lease = s.store.lease(s.p.id, "a");
    await assert.rejects(
      s.service.run(q.id, "a", s.lease.token),
      (e) => e.code === "quote_expired",
    );
    assert.equal(s.calls(), 0);
    s.advance(31 * 86400000);
    assert.throws(
      () => s.provider.assertReady("claude-sonnet-5-5"),
      (e) => e.code === "pricing_stale",
    );
  } finally {
    s.store.close();
  }
});
test("Cache and output tokens are accounted separately at the snapshotted rates", () => {
  const price = MODEL_PRICES["claude-sonnet-5-5"];
  assert.equal(
    usageCost(
      {
        input_tokens: 1000,
        output_tokens: 100,
        cache_read_input_tokens: 4000,
        cache_creation_input_tokens: 1000,
        cache_creation: {
          ephemeral_5m_input_tokens: 1000,
          ephemeral_1h_input_tokens: 0,
        },
      },
      price,
    ),
    5900,
  );
  assert.throws(() =>
    usageCost({ input_tokens: -1, output_tokens: 10 }, price),
  );
});
test("Unknown, locked, outside-boundary and executable-looking operations cannot bypass validation", () => {
  const p = demoProject(),
    base = JSON.stringify(p);
  assert.throws(() =>
    previewProposal(p, {
      summary: "bad",
      questions: [],
      operations: [{ type: "shell", command: "anything" }],
    }),
  );
  p.objects[0].locked = true;
  assert.throws(() =>
    previewProposal(p, {
      summary: "bad",
      questions: [],
      operations: [{ type: "remove", ids: [p.objects[0].id] }],
    }),
  );
  p.objects[0].locked = false;
  const v = previewProposal(p, {
    summary: "bad",
    questions: [],
    operations: [
      {
        type: "transform",
        id: p.objects[0].id,
        position: { x: 999, y: 0, z: 0 },
        rotation: 0,
      },
    ],
  });
  assert.equal(v.canApply, false);
  assert.ok(v.issues.some((i) => i.severity === "error"));
  assert.equal(JSON.stringify(p), base);
});
test("Unknown cost can only be released by an explicit documented reconciliation", async () => {
  const s = setup({
    generate: () => {
      throw Error("network");
    },
  });
  try {
    const q = await s.quote();
    await s.service.run(q.id, "a", s.lease.token);
    assert.throws(
      () => s.store.reconcileJob(q.id, 1000, "", "a", s.lease.token),
      (e) => e.code === "invalid_reconciliation",
    );
    const result = s.store.reconcileJob(
      q.id,
      1000,
      "Provider usage report checked.",
      "a",
      s.lease.token,
    );
    assert.equal(result.status, "reconciled");
    assert.equal(s.store.budget(s.p.id).reservedMicros, 0);
    assert.equal(s.store.budget(s.p.id).spentMicros, 1000);
    assert.equal(s.calls(), 1);
  } finally {
    s.store.close();
  }
});
test("Follow-up questions carry compact prior dialogue, not old scene geometry", async () => {
  const s = setup();
  try {
    s.proposal.summary = "Welke hoogte?";
    s.proposal.questions = ["Wat is de hoogte?"];
    s.proposal.operations = [];
    const first = await s.quote();
    await s.service.run(first.id, "a", s.lease.token);
    await s.service.quote(
      s.p.id,
      "a",
      s.lease.token,
      "De hoogte is 300 cm.",
      "claude-sonnet-5-5",
    );
    const bodies = s.seen
      .filter((v) => v.url.endsWith("/count_tokens"))
      .map((v) => JSON.parse(v.init.body));
    assert.equal(bodies[1].messages.length, 3);
    assert.match(bodies[1].messages[1].content, /Wat is de hoogte/);
    assert.equal(JSON.parse(bodies[1].messages[1].content).applied, false);
    assert.equal(
      JSON.parse(bodies[1].messages[2].content).scene.instances.length,
      36,
    );
  } finally {
    s.store.close();
  }
});
