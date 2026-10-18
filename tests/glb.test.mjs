import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { glbBytes } from "../src/glb.ts";
import {
  demoProject,
  emptyProject,
  newInstance,
  group,
  bounds,
  makeUnique,
} from "../src/model.ts";
// The exporter uses the browser FileReader for Blob bytes. No canvas, WebGL or UI is simulated.
class BlobReader {
  result = null;
  onloadend = null;
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
}
globalThis.FileReader ??= BlobReader;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);
async function load(p, hidden = false) {
  const bytes = await glbBytes(p, hidden);
  const view = new DataView(bytes);
  assert.equal(view.getUint32(0, true), 0x46546c67);
  assert.equal(view.getUint32(4, true), 2);
  assert.equal(view.getUint32(8, true), bytes.byteLength);
  return new GLTFLoader().parseAsync(bytes, "");
}
function parts(scene) {
  const nodes = [];
  scene.traverse((n) => {
    if (n.userData.studioInstanceId) nodes.push(n);
  });
  return nodes;
}
test("Real binary GLB roundtrip preserves all 36 demo instances with exact metre-scale world bounds", async () => {
  const p = demoProject(),
    before = JSON.stringify(p),
    result = await load(p),
    nodes = parts(result.scene);
  assert.equal(nodes.length, 36);
  for (const o of p.objects) {
    const node = nodes.find((n) => n.userData.studioInstanceId === o.id);
    assert.ok(node);
    const b = new THREE.Box3().setFromObject(node),
      expected = bounds(p, o);
    for (const axis of ["x", "y", "z"]) {
      near(b.min[axis], expected.min[axis] / 100);
      near(b.max[axis], expected.max[axis] / 100);
    }
  }
  assert.equal(result.scene.userData.exportedUnits, "m");
  assert.equal(JSON.stringify(p), before);
});
test("GLB retains nested group and unique-definition identities, materials and rotated transforms", async () => {
  let p = emptyProject(),
    a = newInstance(p, "frame-100", { x: 10, y: 15, z: 20 }),
    b = newInstance(p, "panel-100", { x: 100, y: 0, z: 0 });
  a.rotation = 37;
  a.material = "black";
  p.objects = [a, b];
  p = group(p, [a.id, b.id]);
  p = makeUnique(p, [a.id]);
  const r = await load(p),
    node = parts(r.scene).find((n) => n.userData.studioInstanceId === a.id);
  assert.equal(node.parent.userData.studioGroupId, p.groups[0].id);
  assert.equal(node.userData.materialId, "black");
  assert.equal(node.userData.definitionId, p.objects[0].definitionId);
  const position = new THREE.Vector3();
  node.getWorldPosition(position);
  near(position.x, 0.1);
  near(position.y, 0.15);
  near(position.z, 0.2);
  const box = new THREE.Box3().setFromObject(node),
    expected = bounds(p, p.objects[0]);
  near(box.max.x, expected.max.x / 100);
});
test("Visible-only GLB respects inherited visibility; including hidden is an explicit separate export", async () => {
  let p = emptyProject();
  const a = newInstance(p, "frame-100"),
    b = newInstance(p, "panel-100");
  p.objects = [a, b];
  p = group(p, [a.id, b.id]);
  p.groups[0].visible = false;
  const visible = await load(p),
    all = await load(p, true);
  assert.equal(parts(visible.scene).length, 0);
  assert.equal(parts(all.scene).length, 2);
  assert.ok(
    parts(all.scene).every((n) => n.userData.originalVisible === false),
  );
  assert.equal(all.scene.userData.instanceCount, 2);
});
test("An empty project is a valid geometry-free GLB and invalid model data is rejected before export", async () => {
  const p = emptyProject();
  assert.equal(parts((await load(p)).scene).length, 0);
  p.room.length = NaN;
  await assert.rejects(glbBytes(p), /ruimte/);
});
