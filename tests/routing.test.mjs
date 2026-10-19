import { test } from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../server/store.ts";
import { ClaudeProvider, ClaudeService } from "../server/claude.ts";
import {
  routeModel,
  routeSignals,
  scoreTask,
  tierForScore,
} from "../server/routing.ts";
import { demoProject } from "../src/model.ts";

const all = [
  "claude-haiku-5-5",
  "claude-sonnet-5-5",
  "claude-opus-5-5",
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
];
const scene = demoProject();

test("a small, bounded edit goes to the cheapest tier", () => {
  const r = routeModel("Verplaats de tafel 20 cm naar links.", scene, all);
  assert.deepEqual([r.tier, r.model], ["haiku", "claude-haiku-5-5"]);
  assert.match(r.reason, /kleine, afgebakende/);
});

test("room-level or long, multi-part requests escalate to the strongest tier", () => {
  const prompt =
    "Maak de ruimte 2 meter langer en verplaats de projectoren naar 150 cm hoogte, daarna de tafel 40 cm links en de deuren 30 cm naar binnen, ook de panelen opnieuw indelen.";
  const r = routeModel(prompt, scene, all);
  assert.equal(r.tier, "opus");
  assert.ok(r.score >= 4);
  assert.match(r.reason, /ruimte of indeling/);
});

test("medium complexity lands on sonnet; tier thresholds are exact", () => {
  assert.equal(tierForScore(1), "haiku");
  assert.equal(tierForScore(2), "sonnet");
  assert.equal(tierForScore(3), "sonnet");
  assert.equal(tierForScore(4), "opus");
  const s = routeSignals("Maak de kamer 50 cm breder.", scene);
  assert.equal(s.roomWords, true);
  assert.equal(scoreTask(s).score, 2);
  assert.equal(
    routeModel("Maak de kamer 50 cm breder.", scene, all).tier,
    "sonnet",
  );
});

test("newest version of the tier wins; unavailable tiers fall back upward first and say so", () => {
  assert.equal(
    routeModel("tafel 20 cm links", scene, [
      "claude-haiku-4-5",
      "claude-haiku-5-5",
    ]).model,
    "claude-haiku-5-5",
  );
  const up = routeModel("tafel 20 cm links", scene, [
    "claude-sonnet-5-5",
    "claude-opus-5-5",
  ]);
  assert.equal(up.model, "claude-sonnet-5-5");
  assert.match(up.reason, /haiku is niet beschikbaar.*terugval naar sonnet/);
  const down = routeModel(
    "Maak de ruimte 2 meter langer en daarna ook alles opnieuw indelen, plus de tafel 40 cm en de deur 30 cm en het paneel 20 cm.",
    scene,
    ["claude-sonnet-5-5"],
  );
  assert.equal(down.model, "claude-sonnet-5-5");
  assert.match(down.reason, /opus is niet beschikbaar/);
  assert.throws(
    () => routeModel("x", scene, ["gpt-x", "claude-instant"]),
    /Geen haiku/,
  );
});

test("unknown or malformed ids are never chosen", () => {
  const r = routeModel("tafel 20 cm links", scene, [
    "claude-haiku-5-5-evil",
    "claude-haiku-x-y",
    "claude-sonnet-5-5",
  ]);
  assert.equal(r.model, "claude-sonnet-5-5");
});

function service(models) {
  const clock = () => Date.parse("2026-10-18T15:00:00Z");
  const store = new ProjectStore(":memory:", { clock });
  store.create(scene);
  const lease = store.lease(scene.id, "a");
  store.setBudget(scene.id, 5_000_000, "a", lease.token);
  const provider = new ClaudeProvider({
    apiKey: "TEST-PRIVATE-KEY",
    enabled: true,
    clock,
    fetcher: async (url) => {
      if (url.includes("/models?"))
        return Response.json({ data: models.map((id) => ({ id })) });
      if (url.endsWith("/count_tokens"))
        return Response.json({ input_tokens: 1000 });
      throw Error("no paid call expected");
    },
  });
  return { svc: new ClaudeService(store, provider), lease };
}

test("quote with model 'auto' routes, bills at the chosen model's price and records the reason", async () => {
  const { svc, lease } = service(all);
  const small = await svc.quote(
    scene.id,
    "a",
    lease.token,
    "Verplaats de tafel 20 cm naar links.",
    "auto",
  );
  assert.equal(small.model, "claude-haiku-5-5");
  assert.equal(small.routing.tier, "haiku");
  assert.match(small.message, /Automatisch gekozen: claude-haiku-5-5/);
  const big = await svc.quote(
    scene.id,
    "a",
    lease.token,
    "Maak de ruimte 2 meter langer en verplaats de projectoren naar 150 cm hoogte, daarna de tafel 40 cm links en de deuren 30 cm naar binnen, ook alles opnieuw indelen.",
    "auto",
  );
  assert.equal(big.model, "claude-opus-5-5");
  assert.ok(
    big.quotedMicros > small.quotedMicros,
    "stronger model costs more for the same tokens",
  );
});

test("auto never selects a model the key cannot use", async () => {
  const { svc, lease } = service(["claude-sonnet-5-5"]);
  const q = await svc.quote(
    scene.id,
    "a",
    lease.token,
    "Verplaats de tafel 20 cm naar links.",
    "auto",
  );
  assert.equal(q.model, "claude-sonnet-5-5");
  assert.match(q.routing.reason, /terugval/);
});

test("auto with Claude disabled fails clearly instead of guessing a model", async () => {
  const store = new ProjectStore();
  store.create(scene);
  const lease = store.lease(scene.id, "a");
  const svc = new ClaudeService(store, new ClaudeProvider({ enabled: false }));
  await assert.rejects(
    svc.quote(scene.id, "a", lease.token, "tafel 20 cm links", "auto"),
    /niet ingeschakeld/,
  );
});
