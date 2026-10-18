import * as THREE from "three";
import type { Definition } from "./model.ts";
/** Procedural demo geometry. Every visible primitive stays inside the declared physical envelope. */
export function createPart(
  d: Definition,
  material: THREE.Material,
): THREE.Group {
  const s = d.size,
    g = new THREE.Group();
  const cube = (
    w: number,
    h: number,
    depth: number,
    x: number,
    y: number,
    z: number,
    mat: THREE.Material = material,
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  if (d.kind === "frame" || d.kind === "door") {
    const t = Math.min(d.kind === "frame" ? 4 : 7, s.x / 4, s.y / 4, s.z);
    cube(t, s.y, s.z, -s.x / 2 + t / 2, s.y / 2, 0);
    cube(t, s.y, s.z, s.x / 2 - t / 2, s.y / 2, 0);
    cube(s.x, t, s.z, 0, s.y - t / 2, 0);
    if (d.kind === "frame") cube(s.x, t, s.z, 0, t / 2, 0);
  } else if (d.kind === "table") {
    const top = Math.min(5, s.y / 4),
      t = Math.min(5, s.x / 10, s.z / 10),
      inset = Math.min(8, s.x / 4, s.z / 4);
    cube(s.x, top, s.z, 0, s.y - top / 2, 0);
    const leg = new THREE.MeshStandardMaterial({
      color: "#3c4650",
      metalness: 0.5,
      roughness: 0.5,
    });
    for (const x of [-1, 1])
      for (const z of [-1, 1])
        cube(
          t,
          s.y - top,
          t,
          x * (s.x / 2 - inset),
          (s.y - top) / 2,
          z * (s.z / 2 - inset),
          leg,
        );
  } else if (d.kind === "truss") {
    const t = Math.min(4, s.x / 5, s.y / 5, s.z / 5);
    for (const y of [t / 2, s.y - t / 2])
      for (const z of [-s.z / 2 + t / 2, s.z / 2 - t / 2])
        cube(s.x, t, t, 0, y, z);
    for (let x = -s.x / 2 + t / 2; x < s.x / 2; x += 25) {
      cube(t, s.y, t, x, s.y / 2, -s.z / 2 + t / 2);
      cube(t, s.y, t, x, s.y / 2, s.z / 2 - t / 2);
    }
    cube(t, s.y, s.z, s.x / 2 - t / 2, s.y / 2, 0);
  } else {
    cube(s.x, s.y, s.z, 0, s.y / 2, 0);
    if (d.kind === "projector") {
      const radius = Math.min(6, s.y * 0.3, s.x * 0.15),
        length = Math.min(5, s.z / 2);
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, 24),
        new THREE.MeshStandardMaterial({
          color: "#183944",
          metalness: 0.5,
          roughness: 0.1,
        }),
      );
      lens.rotation.x = Math.PI / 2;
      lens.position.set(Math.min(8, s.x * 0.2), s.y / 2, s.z / 2 - length / 2);
      g.add(lens);
    }
  }
  return g;
}
