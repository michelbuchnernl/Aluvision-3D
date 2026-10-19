import { test } from "node:test";
import { ProjectStore } from "../server/store.ts";
import assert from "node:assert/strict";
import {
  emptyProject,
  newInstance,
  group,
  ungroup,
  duplicate,
  parseProject,
  serialize,
  removeObjects,
  bom,
} from "../src/model.ts";
import {
  saveAssembly,
  placeAssembly,
  assemblyStatus,
  resetInstance,
  applyInstance,
  makeAssemblyUnique,
  removeAssembly,
  assemblyUsers,
} from "../src/assemblies.ts";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);
const nearPos = (p, x, y, z) => (near(p.x, x), near(p.y, y), near(p.z, z));

/** Table at (100,0,50) with a projector on it at (130,75,50), grouped and saved as an assembly. */
function fixture() {
  let p = emptyProject();
  const table = newInstance(p, "table-140", { x: 100, y: 0, z: 50 }),
    proj = newInstance(p, "projector-40", { x: 130, y: 75, z: 50 });
  proj.name = "Beamer";
  p.objects.push(table, proj);
  p = group(p, [table.id, proj.id]);
  const gid = p.groups[0].id;
  const saved = saveAssembly(p, gid, "Presentatietafel");
  return { p: saved.project, gid, aid: saved.assemblyId, table, proj };
}
const members = (p, gid) => p.objects.filter((o) => o.groupId === gid);
const byName = (p, gid, name) => members(p, gid).find((o) => o.name === name);

test("saving a group stores members relative to the footprint centre and floor", () => {
  const { p, gid, aid } = fixture();
  const def = p.assemblies.find((a) => a.id === aid);
  assert.equal(def.name, "Presentatietafel");
  assert.equal(def.members.length, 2);
  const proj = def.members.find((m) => m.name === "Beamer");
  nearPos(proj.position, 30, 75, 0);
  const table = def.members.find((m) => m.name !== "Beamer");
  nearPos(table.position, 0, 0, 0);
  const g = p.groups.find((v) => v.id === gid);
  assert.equal(g.assemblyId, aid);
  assert.equal(g.name, "Presentatietafel");
  assert.ok(members(p, gid).every((o) => o.assemblyKey));
  assert.equal(assemblyStatus(p, gid).state, "in-sync");
});

test("placing at a position and yaw puts every member where the closed-form transform says", () => {
  const { p, aid } = fixture();
  const placed = placeAssembly(p, aid, { x: 200, z: 100 }, 90);
  const beamer = byName(placed.project, placed.groupId, "Beamer");
  // local (30, 75, 0) turned 90° about Y: x' = 0, z' = -30
  nearPos(beamer.position, 200, 75, 70);
  near(beamer.rotation, 90);
  assert.equal(assemblyStatus(placed.project, placed.groupId).state, "in-sync");
  assert.equal(assemblyUsers(placed.project, aid).length, 2);
  assert.equal(placed.project.groups.at(-1).name, "Presentatietafel 2");
});

test("moving or rotating a whole instance rigidly is not a deviation", () => {
  const { p, gid } = fixture();
  const moved = structuredClone(p);
  for (const o of members(moved, gid))
    ((o.position.x += 50), (o.position.z -= 30));
  assert.equal(assemblyStatus(moved, gid).state, "in-sync");
  const rotated = structuredClone(p);
  const a = (37 * Math.PI) / 180;
  for (const o of members(rotated, gid)) {
    const dx = o.position.x - 10,
      dz = o.position.z - 20;
    o.position.x = 10 + dx * Math.cos(a) + dz * Math.sin(a);
    o.position.z = 20 - dx * Math.sin(a) + dz * Math.cos(a);
    o.rotation += 37;
  }
  const st = assemblyStatus(rotated, gid);
  assert.equal(st.state, "in-sync", JSON.stringify(st.diffs));
  near(st.frame.rotation, 37, 1e-9);
});

test("deviations are measured and named: moved, material, extra, missing", () => {
  const { p, gid } = fixture();
  const q = structuredClone(p);
  byName(q, gid, "Beamer").position.x += 10;
  const d1 = assemblyStatus(q, gid);
  assert.equal(d1.state, "drift");
  assert.match(d1.diffs[0].message, /Beamer staat 10\.0 cm anders/);
  const m = structuredClone(p);
  byName(m, gid, "Beamer").material = "black";
  assert.equal(assemblyStatus(m, gid).diffs[0].kind, "material");
  const x = structuredClone(p);
  x.objects.push({
    ...newInstance(x, "truss-200"),
    groupId: gid,
    name: "Extra truss",
  });
  const dx = assemblyStatus(x, gid);
  assert.equal(dx.diffs[0].kind, "extra");
  const g = removeObjects(p, [byName(p, gid, "Beamer").id]);
  assert.equal(assemblyStatus(g, gid).diffs[0].kind, "missing");
});

test("reset restores the definition: moves back, recreates missing, removes extras; locks block it", () => {
  const { p, gid } = fixture();
  const q = structuredClone(p);
  byName(q, gid, "Beamer").position.x += 10;
  q.objects.push({
    ...newInstance(q, "truss-200"),
    groupId: gid,
    name: "Extra",
  });
  const gone = byName(q, gid, "Beamer");
  const fixed = resetInstance(q, gid);
  assert.equal(assemblyStatus(fixed, gid).state, "in-sync");
  assert.equal(members(fixed, gid).length, 2);
  assert.ok(!members(fixed, gid).some((o) => o.name === "Extra"));
  nearPos(byName(fixed, gid, "Beamer").position, 130, 75, 50);
  // missing member comes back with a new id
  const m = removeObjects(p, [byName(p, gid, "Beamer").id]);
  const back = resetInstance(m, gid);
  assert.equal(members(back, gid).length, 2);
  assert.ok(byName(back, gid, "Beamer"));
  // a locked member refuses the reset
  const l = structuredClone(q);
  byName(l, gid, "Beamer").locked = true;
  assert.throws(() => resetInstance(l, gid), /Ontgrendel/);
  assert.ok(gone);
});

test("apply makes the instance the new definition; in-sync instances follow, deviating ones are reported", () => {
  const f = fixture();
  let p = f.p;
  const b = placeAssembly(p, f.aid, { x: 200, z: 100 }, 90);
  p = b.project;
  const c = placeAssembly(p, f.aid, { x: -200, z: -100 }, 0);
  p = c.project;
  // C deviates on its own
  byName(p, c.groupId, "Beamer").position.z += 5;
  // A changes: beamer moves 10 cm along local x, and a new member is added
  const a = structuredClone(p);
  byName(a, f.gid, "Beamer").position.x += 10;
  a.objects.push({
    ...newInstance(a, "truss-200", { x: 100, y: 0, z: 120 }),
    groupId: f.gid,
    name: "Nieuwe truss",
  });
  const r = applyInstance(a, f.gid);
  assert.deepEqual(r.updated.sort(), [f.gid, b.groupId].sort());
  assert.deepEqual(r.skipped, [
    { groupId: c.groupId, reason: "wijkt zelf af van de definitie" },
  ]);
  const def = r.project.assemblies.find((x) => x.id === f.aid);
  assert.equal(def.members.length, 3);
  nearPos(def.members.find((m) => m.name === "Beamer").position, 40, 75, 0);
  // B (rotated 90°) followed: local x = 40 → world z = 100 - 40 = 60
  const beamerB = byName(r.project, b.groupId, "Beamer");
  nearPos(beamerB.position, 200, 75, 60);
  assert.ok(
    byName(r.project, b.groupId, "Nieuwe truss"),
    "new member appeared in B",
  );
  assert.equal(assemblyStatus(r.project, b.groupId).state, "in-sync");
  assert.equal(assemblyStatus(r.project, f.gid).state, "in-sync");
  // C kept its own deviation and was not touched
  assert.equal(assemblyStatus(r.project, c.groupId).state, "drift");
  assert.equal(members(r.project, c.groupId).length, 2);
  assert.doesNotThrow(() => parseProject(serialize(r.project)));
});

test("apply also propagates a deleted member", () => {
  const f = fixture();
  const b = placeAssembly(f.p, f.aid, { x: 200, z: 100 }, 0);
  let p = removeObjects(b.project, [byName(b.project, f.gid, "Beamer").id]);
  const r = applyInstance(p, f.gid);
  assert.equal(r.project.assemblies[0].members.length, 1);
  assert.equal(members(r.project, b.groupId).length, 1);
  assert.ok(!byName(r.project, b.groupId, "Beamer"));
});

test("make unique forks the definition: later changes to one instance no longer reach the other", () => {
  const f = fixture();
  const b = placeAssembly(f.p, f.aid, { x: 200, z: 100 }, 0);
  let p = makeAssemblyUnique(b.project, b.groupId);
  const gB = p.groups.find((g) => g.id === b.groupId);
  assert.notEqual(gB.assemblyId, f.aid);
  const unique = p.assemblies.find((x) => x.id === gB.assemblyId);
  assert.equal(unique.unique, true);
  assert.match(unique.name, /uniek$/);
  const q = structuredClone(p);
  byName(q, f.gid, "Beamer").position.x += 10;
  const r = applyInstance(q, f.gid);
  assert.deepEqual(r.updated, [f.gid]);
  nearPos(byName(r.project, b.groupId, "Beamer").position, 230, 75, 100);
  assert.equal(assemblyStatus(r.project, b.groupId).state, "in-sync");
});

test("saving is refused for locked, nested, empty, already-saved groups and bad names", () => {
  const f = fixture();
  assert.throws(() => saveAssembly(f.p, f.gid, "Nog een"), /al een assembly/);
  let p = emptyProject();
  const a = newInstance(p, "table-140", { x: 0, y: 0, z: 0 }),
    b = newInstance(p, "table-140", { x: 300, y: 0, z: 0 }),
    c = newInstance(p, "table-140", { x: -300, y: 0, z: 0 });
  p.objects.push(a, b, c);
  p = group(p, [a.id, b.id]);
  const g1 = p.groups[0].id;
  assert.throws(() => saveAssembly(p, g1, "  "), /naam/);
  assert.throws(() => saveAssembly(p, g1, "x".repeat(81)), /naam/);
  const locked = structuredClone(p);
  locked.objects.find((o) => o.id === a.id).locked = true;
  assert.throws(() => saveAssembly(locked, g1, "Vast"), /Ontgrendel/);
  // nested: group the group with another object
  let nested = group(p, [a.id, b.id, c.id]);
  const outer = nested.groups.find((g) => !g.parentId);
  assert.throws(() => saveAssembly(nested, outer.id, "Buiten"), /subgroepen/);
  assert.throws(
    () => saveAssembly(p, "bestaat-niet", "X"),
    /Groep bestaat niet/,
  );
});

test("project validation: references must resolve and keys must be unique per group", () => {
  const f = fixture();
  assert.doesNotThrow(() => parseProject(serialize(f.p)));
  const mutate = (fn) => {
    const q = JSON.parse(serialize(f.p));
    fn(q);
    return () => parseProject(JSON.stringify(q));
  };
  assert.throws(
    mutate((q) => (q.groups[0].assemblyId = "nope")),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => (q.objects[0].assemblyKey = "onbekend")),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => (q.objects[1].assemblyKey = q.objects[0].assemblyKey)),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => delete q.objects[0].groupId),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => (q.assemblies[0].members[0].definitionId = "weg")),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => (q.assemblies[0].members = [])),
    /assembly/i,
  );
  assert.throws(
    mutate((q) => q.assemblies.push(structuredClone(q.assemblies[0]))),
    /assembly/i,
  );
});

test("ungroup, regrouping a member and duplicating keep references valid", () => {
  const f = fixture();
  const un = ungroup(
    f.p,
    f.p.objects.map((o) => o.id),
  );
  assert.ok(
    un.objects.every(
      (o) => o.assemblyKey === undefined && o.groupId === undefined,
    ),
  );
  assert.doesNotThrow(() => parseProject(serialize(un)));
  // Duplicating the whole instance gives a second, in-sync instance of the same assembly.
  const d = duplicate(
    f.p,
    f.p.objects.map((o) => o.id),
  );
  assert.equal(assemblyUsers(d.project, f.aid).length, 2);
  const copyGroup = assemblyUsers(d.project, f.aid).find((g) => g.id !== f.gid);
  assert.equal(assemblyStatus(d.project, copyGroup.id).state, "in-sync");
  assert.doesNotThrow(() => parseProject(serialize(d.project)));
  // Duplicating a single member inside the context is a plain object, not a second member with the same key.
  const one = duplicate(f.p, [byName(f.p, f.gid, "Beamer").id], f.gid);
  const copy = one.project.objects.find((o) => o.id === one.ids[0]);
  assert.equal(copy.assemblyKey, undefined);
  assert.doesNotThrow(() => parseProject(serialize(one.project)));
  assert.equal(assemblyStatus(one.project, f.gid).diffs[0].kind, "extra");
});

test("an assembly in use cannot be removed; an unused one can", () => {
  const f = fixture();
  assert.throws(() => removeAssembly(f.p, f.aid), /nog gebruikt/);
  const gone = removeObjects(
    f.p,
    f.p.objects.map((o) => o.id),
  );
  assert.equal(gone.groups.length, 0);
  assert.equal(removeAssembly(gone, f.aid).assemblies.length, 0);
});

test("BOM keeps instances apart by group name so each placement is traceable", () => {
  const f = fixture();
  const b = placeAssembly(f.p, f.aid, { x: 200, z: 100 }, 0);
  const rows = bom(b.project);
  const groups = new Set(rows.map((r) => r.group));
  assert.deepEqual([...groups].sort(), [
    "Presentatietafel",
    "Presentatietafel 2",
  ]);
  assert.equal(
    rows.reduce((n, r) => n + r.quantity, 0),
    4,
  );
});

test("grouping members inside the assembly detaches them; reset refuses to rebuild from nothing", () => {
  const f = fixture();
  const inner = group(
    f.p,
    f.p.objects.map((o) => o.id),
    f.gid,
  );
  assert.ok(inner.objects.every((o) => o.assemblyKey === undefined));
  assert.doesNotThrow(() => parseProject(serialize(inner)));
  assert.equal(assemblyStatus(inner, f.gid).state, "empty");
  assert.throws(
    () => resetInstance(inner, f.gid),
    /geen herkenbare onderdelen/,
  );
  assert.throws(() => applyInstance(inner, f.gid), /geen onderdelen meer/);
  assert.equal(inner.objects.length, 2, "nothing was deleted");
});

test("the server store keeps assemblies through create, save and revision restore", () => {
  const f = fixture();
  const store = new ProjectStore();
  const saved = store.create(f.p);
  assert.equal(saved.project.assemblies.length, 1);
  const lease = store.lease(f.p.id, "a");
  const placed = placeAssembly(
    saved.project,
    f.aid,
    { x: 200, z: 100 },
    90,
  ).project;
  const v2 = store.save(
    f.p.id,
    placed,
    saved.revision,
    "a",
    lease.token,
    "tweede exemplaar",
  );
  assert.equal(
    v2.project.groups.filter((g) => g.assemblyId === f.aid).length,
    2,
  );
  const back = store.revision(f.p.id, 1);
  assert.equal(back.groups.filter((g) => g.assemblyId === f.aid).length, 1);
  store.close();
});
