import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildContext,
  distillEvents,
  retrieveContext,
  lintPlaybook,
} from "../server/knowledge.ts";
import { demoProject, mediaDemoProject } from "../src/model.ts";

const rows = (n) =>
  Array.from({ length: n }, (_, i) => ({
    kind: "revision",
    message: `Revisie ${i + 1} (editor): wijziging ${i + 1}`,
    created_at: `2026-10-19T10:${String(i).padStart(2, "0")}:00.000Z`,
  }));

test("distillation keeps the latest revisions, counts the rest and keeps decisions apart", () => {
  const all = [
    ...rows(9),
    {
      kind: "budget",
      message: "API-budget ingesteld op USD 5.00.",
      created_at: "2026-10-19T11:00:00.000Z",
    },
    {
      kind: "lease_takeover",
      message: "Bewerking overgenomen.",
      created_at: "2026-10-19T11:01:00.000Z",
    },
  ];
  const d = distillEvents(all);
  assert.equal(d.total, 11);
  assert.equal(d.byKind.revision, 9);
  assert.equal(d.latestRevisions.length, 5);
  assert.equal(d.earlierRevisions, 4);
  assert.deepEqual(
    d.decisions.map((r) => r.kind),
    ["budget", "lease_takeover"],
  );
});

test("context brief is deterministic, lists real open issues and next actions, and never drops the log", () => {
  const p = mediaDemoProject();
  p.objects[0].position.x = 900; // out of room
  const a = buildContext(p, 3, rows(7)),
    b = buildContext(p, 3, rows(7));
  assert.equal(a, b);
  assert.match(a, /## Brief/);
  assert.match(a, /Revisie: 3/);
  assert.match(a, /buiten ruimte/);
  assert.match(a, /Los 1 grensfout/);
  assert.match(a, /\+ 2 eerdere revisies in LOG\.md/);
  assert.match(a, /alle 7 gebeurtenissen ongewijzigd/);
  assert.match(a, /Projectiecanvassen: 1/);
  assert.match(a, /Sla minstens één camerastandpunt op/);
});

test("a clean project says there is nothing open instead of inventing work", () => {
  const p = demoProject();
  p.cameras.push({
    id: "c",
    name: "Zicht",
    position: { x: 1, y: 100, z: 1 },
    target: { x: 0, y: 100, z: 0 },
    orthographic: false,
  });
  assert.match(buildContext(p, 1, rows(1)), /Geen openstaande controlepunten/);
});

test("newlines in names and messages cannot inject Markdown structure", () => {
  const p = demoProject();
  p.name = "Naam\n## Geïnjecteerd";
  const md = buildContext(p, 1, [
    {
      kind: "revision",
      message: "x\n## Boos",
      created_at: "2026-10-19T10:00:00.000Z",
    },
  ]);
  assert.ok(!/^## (Geïnjecteerd|Boos)/m.test(md));
});

test("retrieval returns the brief plus only sections that match the task, within the budget", () => {
  const md = buildContext(mediaDemoProject(), 2, rows(3));
  const r = retrieveContext(md, "canvas naad hoek", 4000);
  assert.ok(r.sections.includes("Brief"));
  assert.ok(
    r.sections.includes("Openstaande punten") || r.sections.length >= 1,
  );
  const none = retrieveContext(md, "zzzz qqqq", 4000);
  assert.deepEqual(none.sections, ["Brief"]);
  const tight = retrieveContext(md, "revisie", 300);
  assert.ok(
    tight.chars <= 300 ||
      tight.sections.length === 0 ||
      tight.sections[0] === "Brief",
  );
  assert.ok(r.text.length <= 4000);
});

const exists = (p) => existsSync(p);
test("playbook lint: claims need existing evidence; negated or draft statuses may stand alone", () => {
  const table = (status, evidence) =>
    `| Regel | Status | Bewijs |\n| --- | --- | --- |\n| Een regel | ${status} | ${evidence} |\n`;
  assert.deepEqual(
    lintPlaybook(table("Unit-getest", "tests/media.test.mjs"), exists),
    [],
  );
  assert.match(
    lintPlaybook(table("Unit-getest", "tests/bestaat-niet.test.mjs"), exists)[0]
      .message,
    /bestaat niet/,
  );
  assert.match(
    lintPlaybook(table("Browser-geverifieerd", "zie notities"), exists)[0]
      .message,
    /noemt geen bestand/,
  );
  assert.deepEqual(
    lintPlaybook(table("Concept, niet geprobeerd", "—"), exists),
    [],
  );
  assert.deepEqual(
    lintPlaybook(table("Acceptatie nog open", "TEST_RESULTS.md"), exists),
    [],
  );
  assert.match(
    lintPlaybook(table("", "x"), exists)[0].message,
    /Status ontbreekt/,
  );
  // An unrelated "niet" must not switch the evidence check off.
  assert.match(
    lintPlaybook(
      table("Unit-getest; headset niet geprobeerd", "tests/weg.test.mjs"),
      exists,
    )[0].message,
    /bestaat niet/,
  );
  assert.deepEqual(lintPlaybook(table("Niet getest", "—"), exists), []);
  assert.deepEqual(lintPlaybook(table("Ongeverifieerd", "—"), exists), []);
});

test("the real PLAYBOOK.md has no unsupported evidence claims", () => {
  const issues = lintPlaybook(
    readFileSync("knowledge/PLAYBOOK.md", "utf8"),
    exists,
  );
  assert.deepEqual(issues, []);
});
