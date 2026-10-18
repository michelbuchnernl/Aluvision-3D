import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProject,
  newInstance,
  group,
  groupObjectIds,
  parseProject,
  definition,
  validate,
  clone,
  duplicate,
  removeObjects,
  makeUnique,
} from "../src/model.ts";
import {
  worldSocket,
  DEMO_SOCKETS,
  distance,
  dot,
} from "../src/connectionMetadata.ts";
import {
  alignConnections,
  measurement,
  applyAlignmentPreview,
} from "../src/spatial.ts";
function fixture() {
  const p = emptyProject(),
    a = newInstance(p, "frame-100", { x: -200, y: 0, z: 0 }),
    b = newInstance(p, "frame-100", { x: 0, y: 0, z: 0 });
  p.objects = [a, b];
  return {
    p,
    a,
    b,
    request: {
      ids: [a.id],
      from: { objectId: a.id, socketId: "right" },
      to: { objectId: b.id, socketId: "left" },
      rotate: true,
      freeHeight: false,
      remember: true,
    },
  };
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
test("Connection alignment joins envelope faces exactly, records the link and preserves the input", () => {
  const { p, a, b, request } = fixture(),
    before = clone(p),
    preview = alignConnections(p, request);
  assert.equal(preview.canApply, true);
  near(preview.project.objects[0].position.x, -100);
  assert.equal(preview.project.connections.length, 1);
  assert.deepEqual(p, before);
  assert.equal(
    validate(preview.project).some((i) => i.id.startsWith("connection-")),
    false,
  );
  assert.deepEqual(
    parseProject(JSON.stringify(preview.project)),
    preview.project,
  );
});
test("Yaw alignment works against a rotated target and moves a whole nested assembly rigidly", () => {
  let { p, a, b, request } = fixture();
  const child = newInstance(p, "connector-25", { x: -210, y: 30, z: 20 });
  p.objects.push(child);
  p = group(p, [a.id, child.id]);
  p.objects.find((o) => o.id === b.id).rotation = 90;
  request.ids = groupObjectIds(p, p.groups[0].id);
  request.to.socketId = "front";
  const before = distance(a.position, child.position),
    v = alignConnections(p, request),
    from = v.project.objects.find((o) => o.id === a.id),
    moved = v.project.objects.find((o) => o.id === child.id);
  near(distance(from.position, moved.position), before);
  near(moved.position.y, 30);
  const s = worldSocket(definition(v.project, from), from, "right"),
    t = worldSocket(
      definition(p, b),
      p.objects.find((o) => o.id === b.id),
      "front",
    );
  near(distance(s.position, t.position), 0);
  near(dot(s.normal, t.normal), -1);
});
test("Height changes are explicit and locked selections cannot be partly aligned", () => {
  const { p, a, b, request } = fixture();
  b.position.y = 25;
  assert.throws(() => alignConnections(p, request), /hoogte/);
  const v = alignConnections(p, { ...request, freeHeight: true });
  near(v.project.objects[0].position.y, 25);
  a.locked = true;
  assert.throws(
    () => alignConnections(p, { ...request, freeHeight: true }),
    /vergrendeld/,
  );
});
test("Vertical mating preserves yaw and rejects impossible yaw-only or incompatible profile matches", () => {
  const { p, a, b, request } = fixture();
  request.from.socketId = "bottom";
  request.to.socketId = "top";
  a.rotation = 23;
  const result = alignConnections(p, { ...request, freeHeight: true });
  near(result.project.objects[0].rotation, 23);
  near(result.project.objects[0].position.y, 250);
  assert.equal(result.canApply, false);
  assert.throws(
    () =>
      alignConnections(p, {
        ...request,
        to: { objectId: b.id, socketId: "left" },
        freeHeight: true,
      }),
    /kantelen/,
  );
  p.definitions.find((d) => d.id === "frame-100").sockets = clone(DEMO_SOCKETS);
  p.definitions.find((d) => d.id === "frame-100").sockets[4].profile = "other";
  assert.throws(
    () => alignConnections(p, { ...request, freeHeight: true }),
    /profielen/,
  );
});
test("Outside-room candidates cannot apply; a moved or resized connection is reported without auto-correction", () => {
  const { p, a, b, request } = fixture();
  b.position.x = -350;
  const result = alignConnections(p, request);
  assert.equal(result.canApply, false);
  assert.ok(result.issues.some((i) => i.severity === "error"));
  b.position.x = 0;
  const aligned = alignConnections(p, request).project;
  aligned.objects[0].position.x += 1;
  assert.ok(validate(aligned).some((i) => i.id.startsWith("connection-")));
  near(aligned.objects[0].position.x, -99);
});
test("Socket metadata rejects malformed normals, off-face points, dangling and multiply occupied references", () => {
  const { p, a, b, request } = fixture();
  p.definitions[0].sockets = clone(DEMO_SOCKETS);
  p.definitions[0].sockets[0].normal.x = 0.5;
  assert.throws(() => parseProject(JSON.stringify(p)), /definitie/);
  p.definitions[0].sockets = clone(DEMO_SOCKETS);
  p.definitions[0].sockets[0].position.x = 0;
  assert.throws(() => parseProject(JSON.stringify(p)), /definitie/);
  p.definitions[0].sockets = clone(DEMO_SOCKETS);
  const aligned = alignConnections(p, request).project;
  aligned.connections.push({ ...clone(aligned.connections[0]), id: "other" });
  assert.throws(() => parseProject(JSON.stringify(aligned)), /bezet/);
  aligned.connections.pop();
  aligned.connections[0].to.socketId = "missing";
  assert.throws(() => parseProject(JSON.stringify(aligned)), /uitlijnpunt/);
});
test("Duplicating an assembly clones internal connections only; delete prunes links and unique retains socket metadata", () => {
  const { p, a, b, request } = fixture();
  p.definitions[0].sockets = clone(DEMO_SOCKETS);
  const aligned = alignConnections(p, request).project;
  const pair = duplicate(aligned, [a.id, b.id]).project;
  assert.equal(pair.connections.length, 2);
  assert.equal(new Set(pair.connections.map((c) => c.id)).size, 2);
  const one = duplicate(aligned, [a.id]).project;
  assert.equal(one.connections.length, 1);
  const removed = removeObjects(aligned, [a.id]);
  assert.equal(removed.connections.length, 0);
  const unique = makeUnique(aligned, [a.id]);
  assert.deepEqual(definition(unique, unique.objects[0]).sockets, DEMO_SOCKETS);
});
test("Measurement reports 3D distance, horizontal distance and signed axes in centimetres", () => {
  const m = measurement({ x: 0, y: 0, z: 0 }, { x: 300, y: 1200, z: 400 });
  near(m.length, 1300);
  near(m.horizontal, 500);
  assert.deepEqual(m.delta, { x: 300, y: 1200, z: 400 });
  assert.equal(
    measurement({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 }).length,
    0,
  );
  assert.throws(() =>
    measurement({ x: NaN, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }),
  );
});

test("Applying alignment rechecks the exact base, hard limits and current locks", () => {
  const { p, a, b, request } = fixture();
  const preview = alignConnections(p, request);
  const applied = applyAlignmentPreview(p, preview);
  near(applied.objects[0].position.x, -100);
  const changed = clone(p);
  changed.objects[1].position.z = 10;
  assert.throws(() => applyAlignmentPreview(changed, preview), /gewijzigd/);
  b.position.x = -350;
  const outside = alignConnections(p, request);
  assert.throws(() => applyAlignmentPreview(p, outside), /overschrijdt/);
  a.locked = true;
  assert.throws(() => applyAlignmentPreview(p, outside), /gewijzigd/);
});
