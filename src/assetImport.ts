import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { Definition, Vec3 } from "./model.ts";
/**
 * GLB import adapter. Imported models are *not* catalog parts: they carry explicit provenance, an explicit unit
 * choice and the status "geïmporteerd, niet geverifieerd". Nothing is inferred silently: the user picks the
 * units, and the resulting size in centimetres is shown before the definition is created.
 */
export type ImportUnits = "m" | "cm" | "mm";
export const UNIT_TO_CM: Record<ImportUnits, number> = {
  m: 100,
  cm: 1,
  mm: 0.1,
};
export const MAX_ASSET_BYTES = 25_000_000;
export const MAX_TRIANGLES = 500_000;
export interface ImportedAsset {
  sha256: string;
  bytes: number;
  fileName: string;
  units: ImportUnits;
  provenance: string;
  license?: string;
  triangles: number;
}
export interface GlbContainer {
  json: any;
  warnings: string[];
}
const UNSUPPORTED = [
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_texture_basisu",
  "EXT_texture_webp",
];
/** Reads and checks the GLB container before any geometry is parsed. */
export function readGlbContainer(bytes: ArrayBuffer): GlbContainer {
  const bad = (m: string): never => {
    throw Error("Ongeldig GLB-bestand: " + m);
  };
  if (bytes.byteLength < 20) bad("te klein.");
  if (bytes.byteLength > MAX_ASSET_BYTES)
    bad(`groter dan ${MAX_ASSET_BYTES / 1e6} MB.`);
  const v = new DataView(bytes);
  if (v.getUint32(0, true) !== 0x46546c67)
    bad("geen binair GLB (magic ontbreekt).");
  if (v.getUint32(4, true) !== 2)
    bad("alleen glTF-versie 2 wordt ondersteund.");
  if (v.getUint32(8, true) !== bytes.byteLength)
    bad("lengte in de header klopt niet met het bestand.");
  const jsonLength = v.getUint32(12, true);
  if (v.getUint32(16, true) !== 0x4e4f534a) bad("eerste blok is geen JSON.");
  if (20 + jsonLength > bytes.byteLength)
    bad("JSON-blok loopt buiten het bestand.");
  let json: any;
  try {
    json = JSON.parse(
      new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength)),
    );
  } catch {
    return bad("JSON-blok is niet leesbaar.");
  }
  if (
    !json ||
    typeof json !== "object" ||
    !String(json.asset?.version ?? "").startsWith("2")
  )
    bad("asset.version ontbreekt of is niet 2.x.");
  const used = [
    ...(json.extensionsRequired ?? []),
    ...(json.extensionsUsed ?? []),
  ];
  const unsupported = UNSUPPORTED.filter((e) => used.includes(e));
  if (unsupported.length)
    bad(`niet-ondersteunde compressie/extensie: ${unsupported.join(", ")}.`);
  for (const b of json.buffers ?? [])
    if (typeof b.uri === "string" && !b.uri.startsWith("data:"))
      bad("verwijst naar een extern bestand (buffers).");
  for (const i of json.images ?? [])
    if (typeof i.uri === "string" && !i.uri.startsWith("data:"))
      bad("verwijst naar een externe afbeelding.");
  if ((json.nodes?.length ?? 0) > 20000 || (json.meshes?.length ?? 0) > 5000)
    bad("te veel knopen of meshes.");
  const warnings: string[] = [];
  if (!json.meshes?.length) bad("bevat geen meshes.");
  if (json.cameras?.length || json.animations?.length)
    warnings.push("Camera's en animaties worden genegeerd.");
  if (
    (json.lights ?? json.extensions?.KHR_lights_punctual?.lights ?? []).length
  )
    warnings.push("Lampen in het bestand worden genegeerd.");
  if (json.skins?.length)
    warnings.push(
      "Skeletanimatie (skins) wordt niet ondersteund; alleen de rustpose telt.",
    );
  return { json, warnings };
}
export interface GlbInspection {
  scene: THREE.Group;
  /** Size in the file's own units (glTF is metres by specification). */
  size: Vec3;
  triangles: number;
  meshes: number;
  materials: number;
  warnings: string[];
}
export async function inspectGlb(bytes: ArrayBuffer): Promise<GlbInspection> {
  const { warnings } = readGlbContainer(bytes);
  let gltf;
  try {
    gltf = await new GLTFLoader().parseAsync(bytes.slice(0), "");
  } catch (e) {
    throw Error(
      "GLB kon niet worden gelezen: " +
        (e instanceof Error ? e.message : "onbekende fout"),
    );
  }
  const scene = gltf.scene as THREE.Group;
  scene.updateMatrixWorld(true);
  let triangles = 0,
    meshes = 0;
  const materials = new Set<THREE.Material>();
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry;
    triangles += Math.floor(
      (g.index ? g.index.count : (g.getAttribute("position")?.count ?? 0)) / 3,
    );
    (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) =>
      materials.add(x),
    );
  });
  if (!meshes)
    throw Error("Ongeldig GLB-bestand: bevat geen zichtbare meshes.");
  if (triangles > MAX_TRIANGLES)
    throw Error(
      `Model heeft ${triangles.toLocaleString("nl-NL")} driehoeken; de grens is ${MAX_TRIANGLES.toLocaleString("nl-NL")}.`,
    );
  const box = new THREE.Box3().setFromObject(scene, true);
  const size = box.getSize(new THREE.Vector3());
  if (
    ![size.x, size.y, size.z].every((n) => Number.isFinite(n)) ||
    size.x <= 0 ||
    size.y <= 0 ||
    size.z <= 0
  )
    throw Error(
      "Ongeldig GLB-bestand: afmetingen zijn nul of onbepaald (platte of lege geometrie).",
    );
  return {
    scene,
    size: { x: size.x, y: size.y, z: size.z },
    triangles,
    meshes,
    materials: materials.size,
    warnings,
  };
}
export const sizeInCm = (size: Vec3, units: ImportUnits): Vec3 => ({
  x: size.x * UNIT_TO_CM[units],
  y: size.y * UNIT_TO_CM[units],
  z: size.z * UNIT_TO_CM[units],
});
/**
 * Wraps a parsed scene so that, in studio centimetres, its bounding box is centred on x/z with the bottom at y = 0
 * (the editor's "bottom centre" position convention). The clone shares geometry and materials with the source.
 */
export function normalizeAsset(
  source: THREE.Object3D,
  units: ImportUnits,
): THREE.Group {
  const inner = source.clone(true);
  inner.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(inner, true),
    c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const wrapper = new THREE.Group();
  wrapper.add(inner);
  wrapper.scale.setScalar(UNIT_TO_CM[units]);
  wrapper.updateMatrixWorld(true);
  return wrapper;
}
export interface ImportChoice {
  name: string;
  units: ImportUnits;
  role: "decorative" | "custom";
  provenance: string;
  license?: string;
}
export function importedDefinition(
  id: string,
  choice: ImportChoice,
  inspection: Pick<GlbInspection, "size" | "triangles">,
  file: { sha256: string; bytes: number; fileName: string },
): Definition {
  const name = choice.name.trim(),
    provenance = choice.provenance.trim();
  if (!name || name.length > 120)
    throw Error("Geef een naam van 1–120 tekens.");
  if (provenance.length < 3 || provenance.length > 500)
    throw Error(
      "Geef de herkomst (3–500 tekens), bijvoorbeeld 'Eigen model' of de bronnaam.",
    );
  if (!(choice.units in UNIT_TO_CM)) throw Error("Kies eenheden: m, cm of mm.");
  const size = sizeInCm(inspection.size, choice.units);
  if (Math.max(size.x, size.y, size.z) > 100_000)
    throw Error(
      "Het model is groter dan 1 km in de gekozen eenheden; controleer de eenheden.",
    );
  const round = (n: number) => Math.max(0.01, Number(n.toFixed(2)));
  return {
    id,
    name,
    kind: "asset",
    size: { x: round(size.x), y: round(size.y), z: round(size.z) },
    material: "white",
    source: "imported",
    catalogId: `IMP-${file.sha256.slice(0, 8).toUpperCase()}`,
    decorative: choice.role === "decorative",
    asset: {
      sha256: file.sha256,
      bytes: file.bytes,
      fileName: file.fileName.slice(0, 120),
      units: choice.units,
      provenance,
      ...(choice.license?.trim()
        ? { license: choice.license.trim().slice(0, 300) }
        : {}),
      triangles: inspection.triangles,
    },
  };
}
