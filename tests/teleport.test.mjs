import test from "node:test";
import assert from "node:assert/strict";
import { demoProject, mediaDemoProject, newInstance } from "../src/model.ts";
import {
  checkFloorPoint,
  teleportTarget,
  rigPositionFor,
  thumbstickStep,
  obstacles,
  startPoint,
} from "../src/teleport.ts";

test("open floor is valid; wall margin and table footprint are not", () => {
  const p = demoProject();
  assert.equal(checkFloorPoint(p, 0, 0).valid, true);
  const wall = checkFloorPoint(p, 390, 0);
  assert.deepEqual([wall.valid, wall.reason], [false, "outside"]);
  assert.equal(checkFloorPoint(p, 374, 100).valid, true);
  assert.equal(checkFloorPoint(p, 374, 0).reason, "blocked", "door frame");
  const table = checkFloorPoint(p, -180, 0);
  assert.deepEqual([table.valid, table.reason], [false, "blocked"]);
  assert.match(table.message, /tafel/i);
  assert.equal(checkFloorPoint(p, -180, 120).valid, true, "clear of the table");
});

test("rotated footprints block along their real orientation", () => {
  const p = mediaDemoProject();
  assert.equal(checkFloorPoint(p, 372, -140).reason, "blocked");
  assert.equal(checkFloorPoint(p, 350, -140).valid, true);
});

test("hidden objects and suspended objects do not block", () => {
  const p = demoProject();
  // The projector stands on the table, so it blocks too; hide both.
  for (const o of p.objects.filter((o) => /afel/.test(o.name)))
    o.visible = false;
  assert.equal(checkFloorPoint(p, -180, 0).valid, true);
  const truss = newInstance(p, "truss-200", { x: 0, y: 200, z: 0 });
  p.objects.push(truss);
  assert.equal(checkFloorPoint(p, 0, 0).valid, true);
  assert.ok(!obstacles(p).some((o) => o.id === truss.id));
});

test("controller ray hits the floor at the geometric point", () => {
  const p = demoProject();
  const t = teleportTarget(p, { x: 0, y: 150, z: 0 }, { x: 1, y: -1, z: 0 });
  assert.equal(t.valid, true);
  assert.ok(Math.abs(t.point.x - 150) < 1e-9 && Math.abs(t.point.z) < 1e-9);
  const miss = teleportTarget(
    p,
    { x: 0, y: 150, z: 0 },
    { x: 1, y: 0.2, z: 0 },
  );
  assert.equal(miss, undefined, "pointing upwards has no target");
  assert.equal(
    teleportTarget(p, { x: 0, y: 150, z: 0 }, { x: 0, y: 0, z: 0 }),
    undefined,
  );
  const far = teleportTarget(p, { x: 0, y: 150, z: 0 }, { x: 40, y: -1, z: 0 });
  assert.equal(far.reason, "too-far");
  assert.equal(far.valid, false);
  const out = teleportTarget(
    p,
    { x: 300, y: 150, z: 0 },
    { x: 1, y: -1, z: 0 },
  );
  assert.equal(out.reason, "outside");
});

test("rig placement keeps the head over the target regardless of room-scale offset", () => {
  assert.deepEqual(rigPositionFor({ x: 100, z: -50 }, { x: 30, z: 10 }), {
    x: 70,
    y: 0,
    z: -60,
  });
});

test("thumbstick: push forward aims, release commits once, small drift is ignored", () => {
  let s = { aiming: false };
  const events = [];
  for (const y of [0, -0.2, -0.7, -0.9, -0.5, -0.35, 0, 0, -0.1]) {
    const r = thumbstickStep(s.aiming, y);
    s = r;
    events.push(r.event);
  }
  assert.deepEqual(events, [
    "none",
    "none",
    "start",
    "aim",
    "aim",
    "aim",
    "commit",
    "none",
    "none",
  ]);
});

test("VR spawn is the valid floor point nearest the centre, or none when the room is full", () => {
  const p = demoProject();
  const s = startPoint(p);
  assert.ok(s && checkFloorPoint(p, s.x, s.z).valid);
  assert.ok(Math.hypot(s.x, s.z) <= 25);
  const tiny = demoProject();
  tiny.room = { length: 40, depth: 40, height: 300 };
  assert.equal(startPoint(tiny), undefined);
});
