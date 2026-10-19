import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import {
  definition,
  effectiveMaterial,
  isVisible,
  MATERIALS,
  parseProject,
} from "./model.ts";
import type { Project } from "./model.ts";
import { createPart } from "./sceneGeometry.ts";
/** Geometry exchange only: GLB is not a lossless Studio project or a fabrication model. */
export function glbScene(input: Project, includeHidden = false) {
  const p = parseProject(JSON.stringify(input));
  const scene = new THREE.Scene();
  scene.name = p.name;
  const selected = p.objects.filter((o) => includeHidden || isVisible(p, o)),
    included = new Set(selected.map((o) => o.id));
  scene.userData = {
    studioProjectId: p.id,
    sourceUnits: "cm",
    exportedUnits: "m",
    synthetic: true,
    roomCm: p.room,
    instanceCount: selected.length,
    includesHidden: includeHidden,
    connections: (p.connections ?? []).filter(
      (c) => included.has(c.from.objectId) && included.has(c.to.objectId),
    ),
  };
  const root = new THREE.Group();
  root.name = "Centimetres to metres";
  root.scale.setScalar(0.01);
  scene.add(root);
  const groups = new Map<string, THREE.Group>();
  for (const g of p.groups) {
    const node = new THREE.Group();
    node.name = g.name;
    node.userData = {
      studioGroupId: g.id,
      locked: g.locked ?? false,
      originalVisible: g.visible !== false,
    };
    groups.set(g.id, node);
  }
  for (const g of p.groups)
    (g.parentId ? groups.get(g.parentId)! : root).add(groups.get(g.id)!);
  const templates = new Map<string, THREE.Group>();
  for (const o of selected) {
    const d = definition(p, o),
      id = effectiveMaterial(p, o),
      key = JSON.stringify([d.id, id]);
    let template = templates.get(key);
    if (!template) {
      const m = MATERIALS[id];
      template = createPart(
        d,
        new THREE.MeshStandardMaterial({
          color: m.color,
          metalness: m.metalness,
          roughness: m.roughness,
          transparent: (m.opacity ?? 1) < 1,
          opacity: m.opacity ?? 1,
          side: THREE.DoubleSide,
        }),
      );
      templates.set(key, template);
    }
    const part = template.clone(true);
    part.name = o.name;
    part.position.set(o.position.x, o.position.y, o.position.z);
    part.rotation.y = (o.rotation * Math.PI) / 180;
    part.userData = {
      studioInstanceId: o.id,
      definitionId: d.id,
      kind: d.kind,
      catalogId: d.catalogId,
      source: d.source,
      materialId: id,
      tag: o.tag,
      locked: o.locked,
      originalVisible: isVisible(p, o),
    };
    (o.groupId ? groups.get(o.groupId)! : root).add(part);
  }
  scene.updateMatrixWorld(true);
  return scene;
}
export async function glbBytes(
  p: Project,
  includeHidden = false,
): Promise<ArrayBuffer> {
  const scene = glbScene(p, includeHidden);
  try {
    const bytes = await new GLTFExporter().parseAsync(scene, {
      binary: true,
      onlyVisible: false,
    });
    if (!(bytes instanceof ArrayBuffer))
      throw Error("GLB-export gaf geen binair bestand.");
    return bytes;
  } finally {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>();
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
  }
}
