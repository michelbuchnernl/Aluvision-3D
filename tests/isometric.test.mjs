import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyProject, newInstance, demoProject } from "../src/model.ts";
import {
  isoPoint,
  orientedBox,
  isometricSegments,
  fitScale,
} from "../src/isometric.ts";

const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test("axes keep full length at 30°: x and z edges foreshorten only on screen, y stays vertical", () => {
  const o = isoPoint(0, 0, 0),
    x = isoPoint(100, 0, 0),
    y = isoPoint(0, 100, 0),
    z = isoPoint(0, 0, 100);
  near(Math.hypot(x.u - o.u, x.v - o.v), 100);
  near(Math.hypot(z.u - o.u, z.v - o.v), 100);
  near(y.u - o.u, 0);
  near(y.v - o.v, 100);
  assert.ok(
    x.u > 0 && z.u < 0,
    "x goes right, z (towards the viewer) goes left",
  );
  assert.ok(x.v < 0 && z.v < 0, "nearer points sit lower on the page");
});

test("an oriented box has 8 corners and honours the editor's rotation convention", () => {
  const c = orientedBox({ x: 10, y: 0, z: 20 }, { x: 100, y: 50, z: 10 }, 90);
  assert.equal(c.length, 8);
  const xs = c.map((p) => p[0]),
    zs = c.map((p) => p[2]);
  near(Math.max(...xs) - Math.min(...xs), 10);
  near(Math.max(...zs) - Math.min(...zs), 100);
  near(Math.min(...c.map((p) => p[1])), 0);
  near(Math.max(...c.map((p) => p[1])), 50);
});

test("segments: room box plus 12 edges per visible object; hidden objects are not drawn", () => {
  const p = emptyProject();
  const a = newInstance(p, "table-140", { x: 0, y: 0, z: 0 }),
    b = newInstance(p, "table-140", { x: 100, y: 0, z: 0 });
  b.visible = false;
  p.objects.push(a, b);
  const { segments, min, max } = isometricSegments(p);
  assert.equal(segments.filter((s) => s.kind === "room").length, 12);
  assert.equal(segments.filter((s) => s.kind === "object").length, 12);
  assert.ok(segments.every((s) => s.objectId !== b.id));
  assert.ok(max.u > min.u && max.v > min.v);
});

test("room extents match the closed-form isometric bounds", () => {
  const p = emptyProject(),
    r = p.room;
  const { min, max } = isometricSegments(p);
  const c = Math.cos(Math.PI / 6),
    s = Math.sin(Math.PI / 6);
  near(max.u - min.u, (r.length + r.depth) * c, 1e-6);
  near(max.v - min.v, r.height + (r.length + r.depth) * s, 1e-6);
});

test("fit scale picks the smallest standard 1:n that fits the paper area", () => {
  assert.equal(fitScale(100, 100, { w: 236, h: 112 }), 10);
  assert.equal(fitScale(1200, 300, { w: 236, h: 112 }), 100);
  const demo = isometricSegments(demoProject());
  const scale = fitScale(demo.max.u - demo.min.u, demo.max.v - demo.min.v, {
    w: 236,
    h: 112,
  });
  assert.ok([100, 200].includes(scale), `got ${scale}`);
});
