import type { Preset, Project } from "./model.ts";
/**
 * Render job specification handed to the Blender worker (blender/render_worker.py).
 * Studio data is in centimetres; Blender and glTF use metres, so the conversion happens exactly once, here.
 */
export interface RenderCamera {
  name: string;
  position: [number, number, number];
  target: [number, number, number];
  orthographic: boolean;
  fovDegrees: number;
  orthoScale: number;
}
export interface RenderSpec {
  schema: 1;
  projectId: string;
  revision: number;
  preset: Preset;
  engine: "eevee" | "cycles";
  samples: number;
  resolution: { width: number; height: number };
  glb: { sha256: string; bytes: number };
  room: { length: number; depth: number; height: number };
  lighting: {
    worldColor: [number, number, number];
    worldStrength: number;
    sunStrength: number;
    hazeDensity: number;
    panelEmission: number;
  };
  cameras: RenderCamera[];
  outputs: { camera: string; file: string }[];
}
export interface RenderOptions {
  preset: Preset;
  engine?: "eevee" | "cycles";
  samples?: number;
  width?: number;
  height?: number;
  /** Names of saved camera bookmarks; empty means a default overview camera. */
  cameraNames?: string[];
}
export const MAX_GLB_BYTES = 8_000_000;
const M = 100;
const LIGHTING: Record<Preset, RenderSpec["lighting"]> = {
  technical: {
    worldColor: [0.9, 0.92, 0.94],
    worldStrength: 1,
    sunStrength: 3,
    hazeDensity: 0,
    panelEmission: 0,
  },
  presentation: {
    worldColor: [0.12, 0.16, 0.2],
    worldStrength: 0.6,
    sunStrength: 1.2,
    hazeDensity: 0,
    panelEmission: 0.4,
  },
  immersive: {
    worldColor: [0.01, 0.02, 0.03],
    worldStrength: 0.15,
    sunStrength: 0,
    hazeDensity: 0.004,
    panelEmission: 1,
  },
};
const m = (v: { x: number; y: number; z: number }): [number, number, number] =>
  // Studio: x length, y up, z depth. Blender: X, Y depth (−studio z), Z up. glTF import already converts the
  // model to Z-up, so cameras use the same mapping to stay aligned with it.
  [v.x / M, -v.z / M, v.y / M];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "view";
export function buildRenderSpec(
  p: Project,
  revision: number,
  options: RenderOptions,
  glb: { sha256: string; bytes: number },
): RenderSpec {
  const cameras: RenderCamera[] = [];
  const names = options.cameraNames?.length
    ? options.cameraNames
    : p.cameras.map((c) => c.name);
  for (const c of p.cameras) {
    if (!names.includes(c.name)) continue;
    cameras.push({
      name: c.name,
      position: m(c.position),
      target: m(c.target),
      orthographic: c.orthographic,
      fovDegrees: 42,
      orthoScale: (c.frustumHeight ?? p.room.length * 0.6) / M,
    });
  }
  if (!cameras.length) {
    const r = p.room;
    cameras.push({
      name: "Overzicht",
      position: m({ x: r.length * 0.7, y: r.height * 2.2, z: r.depth * 1.6 }),
      target: m({ x: 0, y: r.height / 2, z: 0 }),
      orthographic: false,
      fovDegrees: 42,
      orthoScale: r.length / M,
    });
  }
  const used = new Set<string>();
  const outputs = cameras.map((c, i) => {
    let file = `${String(i + 1).padStart(2, "0")}-${slug(c.name)}.png`;
    while (used.has(file)) file = "x" + file;
    used.add(file);
    return { camera: c.name, file };
  });
  return {
    schema: 1,
    projectId: p.id,
    revision,
    preset: options.preset,
    engine: options.engine ?? "eevee",
    samples: options.samples ?? 64,
    resolution: {
      width: options.width ?? 1920,
      height: options.height ?? 1080,
    },
    glb,
    room: {
      length: p.room.length / M,
      depth: p.room.depth / M,
      height: p.room.height / M,
    },
    lighting: LIGHTING[options.preset],
    cameras,
    outputs,
  };
}
const num = (v: unknown, lo: number, hi: number) =>
  typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
const vec = (v: unknown): v is [number, number, number] =>
  Array.isArray(v) && v.length === 3 && v.every((n) => num(n, -1000, 1000));
const FILE = /^[A-Za-z0-9][\w.-]{0,60}\.png$/;
export function validateRenderSpec(raw: any): RenderSpec {
  const bad = (msg: string): never => {
    throw Error("Ongeldige renderopdracht: " + msg);
  };
  if (!raw || raw.schema !== 1) bad("schema.");
  if (typeof raw.projectId !== "string" || !raw.projectId) bad("project.");
  if (!Number.isSafeInteger(raw.revision) || raw.revision < 1) bad("revisie.");
  if (!["technical", "presentation", "immersive"].includes(raw.preset))
    bad("voorinstelling.");
  if (!["eevee", "cycles"].includes(raw.engine)) bad("renderengine.");
  if (!Number.isInteger(raw.samples) || !num(raw.samples, 1, 4096))
    bad("samples (1–4096).");
  const r = raw.resolution;
  if (
    !r ||
    !Number.isInteger(r.width) ||
    !Number.isInteger(r.height) ||
    !num(r.width, 64, 8192) ||
    !num(r.height, 64, 8192) ||
    r.width * r.height > 33_177_600
  )
    bad("resolutie (64–8192 px, hoogstens 8K).");
  if (
    !raw.glb ||
    !/^[0-9a-f]{64}$/.test(raw.glb.sha256) ||
    !Number.isInteger(raw.glb.bytes) ||
    !num(raw.glb.bytes, 1, MAX_GLB_BYTES)
  )
    bad("GLB-gegevens.");
  const room = raw.room;
  if (
    !room ||
    !["length", "depth", "height"].every((k) => num(room[k], 0.1, 1000))
  )
    bad("ruimte (meters).");
  const l = raw.lighting;
  if (
    !l ||
    !Array.isArray(l.worldColor) ||
    l.worldColor.length !== 3 ||
    !l.worldColor.every((n: unknown) => num(n, 0, 1)) ||
    !["worldStrength", "sunStrength", "hazeDensity", "panelEmission"].every(
      (k) => num(l[k], 0, 100),
    )
  )
    bad("belichting.");
  if (
    !Array.isArray(raw.cameras) ||
    !raw.cameras.length ||
    raw.cameras.length > 50
  )
    bad("camera's (1–50).");
  const names = new Set<string>();
  for (const c of raw.cameras) {
    if (
      !c ||
      typeof c.name !== "string" ||
      !c.name ||
      c.name.length > 120 ||
      names.has(c.name) ||
      !vec(c.position) ||
      !vec(c.target) ||
      typeof c.orthographic !== "boolean" ||
      !num(c.fovDegrees, 5, 150) ||
      !num(c.orthoScale, 0.01, 1000)
    )
      bad("camera.");
    if (
      c.position[0] === c.target[0] &&
      c.position[1] === c.target[1] &&
      c.position[2] === c.target[2]
    )
      bad(`camera ${c.name} kijkt naar zichzelf.`);
    names.add(c.name);
  }
  if (!Array.isArray(raw.outputs) || raw.outputs.length !== raw.cameras.length)
    bad("uitvoer moet één bestand per camera hebben.");
  const files = new Set<string>();
  for (const o of raw.outputs) {
    if (
      !o ||
      !names.has(o.camera) ||
      typeof o.file !== "string" ||
      !FILE.test(o.file) ||
      o.file.includes("..") ||
      files.has(o.file)
    )
      bad("uitvoerbestand.");
    files.add(o.file);
  }
  return raw as RenderSpec;
}
