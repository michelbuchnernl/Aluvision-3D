import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rectangleSelection,
  transformAroundPivot,
} from "../src/interaction.ts";
const boxes = [
  { id: "inside", left: 20, right: 30, top: 20, bottom: 30 },
  { id: "crossing", left: 5, right: 15, top: 20, bottom: 30 },
  { id: "outside", left: 50, right: 70, top: 50, bottom: 70 },
  { id: "clipped", left: 20, right: 30, top: 20, bottom: 30, clipped: true },
];
test("Left to right selection contains entire projected objects", () =>
  assert.deepEqual(
    rectangleSelection(boxes, { x: 10, y: 10 }, { x: 40, y: 40 }),
    ["inside"],
  ));
test("Right to left selection includes intersecting projected objects", () =>
  assert.deepEqual(
    rectangleSelection(boxes, { x: 40, y: 40 }, { x: 10, y: 10 }),
    ["inside", "crossing"],
  ));
test("Reversed vertical direction preserves the horizontal selection convention", () =>
  assert.deepEqual(
    rectangleSelection(boxes, { x: 10, y: 40 }, { x: 40, y: 10 }),
    ["inside"],
  ));
test("Translation in floor mode preserves an already elevated object", () => {
  const result = transformAroundPivot(
    { x: 10, y: 75, z: 20 },
    0,
    { x: 0, y: 0, z: 0 },
    { x: 25, y: 50, z: -10 },
    0,
    false,
  );
  assert.deepEqual(result.position, { x: 35, y: 75, z: 10 });
});
test("Free-height translation affects the bottom coordinate explicitly", () => {
  const result = transformAroundPivot(
    { x: 10, y: 75, z: 20 },
    0,
    { x: 0, y: 0, z: 0 },
    { x: 25, y: 50, z: -10 },
    0,
    true,
  );
  assert.equal(result.position.y, 125);
});
test("Group rotation preserves radial distance around the pivot and object yaw", () => {
  const result = transformAroundPivot(
    { x: 100, y: 75, z: 0 },
    30,
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0, z: 0 },
    90,
    false,
  );
  assert.ok(Math.abs(result.position.x) < 1e-10);
  assert.ok(Math.abs(result.position.z + 100) < 1e-10);
  assert.equal(result.position.y, 75);
  assert.equal(result.rotation, 120);
});
