import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { CATALOG } from "../src/model.ts";
import { createPart } from "../src/sceneGeometry.ts";
for (const size of [null, { x: 1, y: 1, z: 1 }, { x: 20, y: 300, z: 2 }]) {
  test(`Rendered geometry fits its physical envelope at ${size ? JSON.stringify(size) : "catalog dimensions"}`, () => {
    for (const base of CATALOG) {
      const d = { ...base, size: size ?? base.size },
        material = new THREE.MeshStandardMaterial(),
        g = createPart(d, material);
      const box = new THREE.Box3().setFromObject(g);
      const eps = 0.0001;
      assert.ok(Math.abs(box.min.x + d.size.x / 2) < eps, `${d.kind}: min x`);
      assert.ok(Math.abs(box.max.x - d.size.x / 2) < eps, `${d.kind}: max x`);
      assert.ok(Math.abs(box.min.y) < eps, `${d.kind}: floor`);
      assert.ok(Math.abs(box.max.y - d.size.y) < eps, `${d.kind}: height`);
      assert.ok(Math.abs(box.min.z + d.size.z / 2) < eps, `${d.kind}: min z`);
      assert.ok(Math.abs(box.max.z - d.size.z / 2) < eps, `${d.kind}: max z`);
      g.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) o.material.dispose();
      });
    }
  });
}
