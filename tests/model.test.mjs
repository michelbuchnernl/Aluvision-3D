import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProject,
  demoProject,
  definition,
  newInstance,
  bounds,
  validate,
  duplicate,
  makeUnique,
  group,
  removeObjects,
  editObjects,
  isLocked,
  isVisible,
  bom,
  bomCsv,
  parseProject,
  serialize,
  commit,
  undo,
  redo,
  cmToMetres,
  metresToCm,
  effectiveMaterial,
} from "../src/model.ts";
function fixture() {
  const p = emptyProject();
  const a = newInstance(p, "frame-100", { x: 0, y: 0, z: 0 }),
    b = newInstance(p, "frame-100", { x: 150, y: 0, z: 0 });
  p.objects = [a, b];
  return { p, a, b };
}
test("Canonical centimetres convert explicitly at interchange boundaries", () => {
  assert.equal(cmToMetres(800), 8);
  assert.equal(metresToCm(4), 400);
  assert.ok(Math.abs(metresToCm(cmToMetres(123.45)) - 123.45) < 1e-10);
});
test("Reference 8 x 4 x 3m scene fits and leaves both short-side entrances open", () => {
  const p = demoProject();
  assert.equal(p.objects.length, 36);
  assert.deepEqual(validate(p), []);
  const doors = p.objects.filter((o) => definition(p, o).kind === "door");
  assert.equal(doors.length, 2);
  assert.ok(doors.every((o) => o.rotation === 90));
  assert.ok(
    p.objects.find((o) => definition(p, o).kind === "projector").position.y > 0,
  );
});
test("Containment accepts exact boundaries and reports violations without mutating positions", () => {
  const { p, a } = fixture();
  a.position.x = 350;
  assert.deepEqual(validate(p), []);
  a.position.x = 351;
  const before = serialize(p);
  const issues = validate(p);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /rechts 1.0 cm/);
  assert.equal(
    serialize(p).replace(/"updatedAt": "[^"]+"/, ""),
    before.replace(/"updatedAt": "[^"]+"/, ""),
  );
});
test("Rotated containment includes transformed width and depth", () => {
  const { p, a } = fixture();
  a.rotation = 90;
  a.position.z = 160;
  const b = bounds(p, a);
  assert.ok(Math.abs(b.max.z - 210) < 0.001);
  assert.match(validate(p)[0].message, /voor 10.0 cm/);
  a.rotation = 45;
  const bb = bounds(p, a);
  assert.ok(Math.abs(bb.max.x - (100 + 5) / Math.sqrt(2) / 2) < 0.001);
});
test("Floor and ceiling are hard constraints on physical bottom/height", () => {
  const { p, a } = fixture();
  a.position.y = -1;
  assert.match(validate(p)[0].message, /onder vloer/);
  a.position.y = 51;
  assert.match(validate(p)[0].message, /boven plafond 1.0 cm/);
  a.position.y = 50;
  assert.deepEqual(validate(p), []);
});
test("Duplicating preserves shared definition but generates fresh instance IDs", () => {
  const { p, a } = fixture();
  const d = duplicate(p, [a.id]);
  assert.equal(p.objects.length, 2);
  assert.equal(d.project.objects.length, 3);
  const copy = d.project.objects.find((o) => d.ids.includes(o.id));
  assert.notEqual(copy.id, a.id);
  assert.equal(copy.definitionId, a.definitionId);
  assert.equal(copy.position.x, a.position.x + 20);
  assert.equal(new Set(d.project.objects.map((o) => o.id)).size, 3);
});
test("Shared edits propagate, make-unique isolates later definition edits", () => {
  const { p, a, b } = fixture();
  definition(p, a).size.x = 120;
  assert.equal(definition(p, b).size.x, 120);
  const next = makeUnique(p, [a.id]);
  const aa = next.objects.find((o) => o.id === a.id),
    bb = next.objects.find((o) => o.id === b.id);
  assert.notEqual(aa.definitionId, bb.definitionId);
  definition(next, aa).size.x = 80;
  assert.equal(definition(next, bb).size.x, 120);
  assert.equal(definition(p, a).size.x, 120);
  assert.equal(definition(next, aa).unique, true);
});
test("Instance material overrides do not change shared definition", () => {
  const { p, a, b } = fixture();
  a.material = "wood";
  definition(p, a).material = "black";
  assert.equal(effectiveMaterial(p, a), "wood");
  assert.equal(effectiveMaterial(p, b), "black");
});
test("Locked objects and locked tags reject transforms, duplicate, delete and make-unique", () => {
  const { p, a, b } = fixture();
  a.locked = true;
  p.tags.find((t) => t.id === b.tag).locked = true;
  assert.ok(isLocked(p, b));
  const q = editObjects(p, [a.id, b.id], (o) => (o.position.x = 999));
  assert.equal(q.objects[0].position.x, 0);
  assert.equal(q.objects[1].position.x, 150);
  assert.equal(duplicate(p, [a.id, b.id]).ids.length, 0);
  assert.equal(removeObjects(p, [a.id, b.id]).objects.length, 2);
  assert.equal(
    makeUnique(p, [a.id, b.id]).definitions.length,
    p.definitions.length,
  );
});
test("Groups preserve instance counts and disappear after their last member is removed", () => {
  const { p, a, b } = fixture();
  const q = group(p, [a.id, b.id]);
  assert.equal(q.groups.length, 1);
  assert.equal(q.objects[0].groupId, q.objects[1].groupId);
  assert.equal(q.objects.length, 2);
  const next = removeObjects(q, [a.id, b.id]);
  assert.equal(next.objects.length, 0);
  assert.equal(next.groups.length, 0);
});
test("Hidden layers hide drawing but preserve BOM quantities", () => {
  const { p, a } = fixture();
  p.tags.find((t) => t.id === a.tag).visible = false;
  assert.equal(isVisible(p, a), false);
  assert.equal(
    bom(p).reduce((n, r) => n + r.quantity, 0),
    p.objects.length,
  );
});
test("BOM groups identical instances and separates material/unique definitions", () => {
  const { p, a, b } = fixture();
  assert.equal(bom(p).length, 1);
  assert.equal(bom(p)[0].quantity, 2);
  b.material = "black";
  assert.equal(bom(p).length, 2);
  const unique = makeUnique(p, [a.id]);
  assert.equal(
    bom(unique).reduce((n, r) => n + r.quantity, 0),
    2,
  );
  assert.match(bomCsv(p), /"DEMO-F100"/);
  assert.match(bomCsv(p), /Lengte cm/);
});
test("Portable JSON roundtrip preserves all exact transforms, IDs and component relationships", () => {
  const p = demoProject();
  p.objects[0].rotation = 43.25;
  p.objects[0].position.y = 11.5;
  const q = parseProject(serialize(p));
  assert.deepEqual(q.objects, p.objects);
  assert.deepEqual(q.definitions, p.definitions);
  assert.equal(q.room.length, 800);
  assert.equal(q.units, "cm");
});
test("Import rejects missing definitions, duplicate instance IDs and non-finite dimensions", () => {
  const { p } = fixture();
  let q = structuredClone(p);
  q.objects[0].definitionId = "missing";
  assert.throws(() => parseProject(JSON.stringify(q)), /verwijzing/);
  q = structuredClone(p);
  q.objects[1].id = q.objects[0].id;
  assert.throws(() => parseProject(JSON.stringify(q)), /dubbele/);
  q = structuredClone(p);
  q.definitions[0].size.x = null;
  assert.throws(() => parseProject(JSON.stringify(q)), /definitie/);
  q = structuredClone(p);
  q.room.length = -1;
  assert.throws(() => parseProject(JSON.stringify(q)), /ruimte/);
});
test("Import rejects invalid camera, tag, group and prototype material names", () => {
  const { p } = fixture();
  let q = structuredClone(p);
  q.cameras = [
    {
      id: "c",
      name: "Cam",
      position: { x: 0, y: 1, z: 2 },
      target: null,
      orthographic: false,
    },
  ];
  assert.throws(() => parseProject(JSON.stringify(q)), /camera/);
  q = structuredClone(p);
  q.objects[0].groupId = "absent";
  assert.throws(() => parseProject(JSON.stringify(q)), /verwijzing/);
  q = structuredClone(p);
  q.definitions[0].material = "__proto__";
  assert.throws(() => parseProject(JSON.stringify(q)), /definitie/);
});
test("Undo/redo preserves the exact scene and invalidates redo after a new edit", () => {
  const { p, a } = fixture();
  let h = { past: [], present: p, future: [] };
  const q = editObjects(p, [a.id], (o) => (o.position.x = 50));
  h = commit(h, q);
  assert.equal(h.present.objects[0].position.x, 50);
  h = undo(h);
  assert.equal(h.present.objects[0].position.x, 0);
  h = redo(h);
  assert.equal(h.present.objects[0].position.x, 50);
  h = undo(h);
  h = commit(
    h,
    editObjects(p, [a.id], (o) => (o.position.x = -20)),
  );
  assert.equal(h.future.length, 0);
  assert.equal(h.present.objects[0].position.x, -20);
});
test("History is bounded to 100 reversible checkpoints", () => {
  const { p } = fixture();
  let h = { past: [], present: p, future: [] };
  for (let i = 0; i < 120; i++)
    h = commit(h, { ...h.present, name: `Revision ${i}` });
  assert.equal(h.past.length, 100);
});
test("CSV escapes user text that spreadsheet software could interpret as a formula", () => {
  const { p, a } = fixture();
  definition(p, a).name = "=1+1";
  const csv = bomCsv(p);
  assert.match(csv, /"'=1\+1"/);
});
test("Import tolerates no malformed null records and preserves explicit saved-camera zoom", () => {
  const { p } = fixture();
  const q = structuredClone(p);
  q.objects.push(null);
  assert.throws(() => parseProject(JSON.stringify(q)), /Ongeldige/);
  p.cameras = [
    {
      id: "camera-1",
      name: "View",
      position: { x: 1, y: 200, z: 3 },
      target: { x: 0, y: 100, z: 0 },
      orthographic: true,
      zoom: 2.5,
      frustumHeight: 800,
    },
  ];
  const restored = parseProject(serialize(p));
  assert.equal(restored.cameras[0].zoom, 2.5);
  assert.equal(restored.cameras[0].frustumHeight, 800);
});
