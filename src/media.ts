import type { Instance, Project } from "./model.ts";
/**
 * Projection canvases map one media frame across an ordered chain of panels.
 * Everything here is pure plan-view geometry in centimetres (x/z plane, y up).
 * A canvas is the "developed" (unrolled) wall run: u grows in physical cm along
 * the chain as seen by a viewer standing inside the room. Continuity is checked
 * explicitly; it is never assumed from the chain order.
 */
export type FitMode = "stretch" | "contain" | "cover";
export interface MediaAsset {
  id: string;
  name: string;
  kind: "test-pattern" | "image" | "video";
  widthPx: number;
  heightPx: number;
  bytes?: number;
  durationSec?: number;
  sha256?: string;
}
export interface ProjectionCanvas {
  id: string;
  name: string;
  surfaceIds: string[];
  widthPx: number;
  heightPx: number;
  fit: FitMode;
  mediaId?: string;
  showSeams: boolean;
}
export interface MediaIssue {
  canvasId: string;
  objectId?: string;
  severity: "error" | "warning" | "info";
  message: string;
}
interface Plan {
  x: number;
  z: number;
}
export interface Surface {
  objectId: string;
  name: string;
  widthCm: number;
  bottom: number;
  top: number;
  /** Unit normal pointing into the room (towards the viewer). */
  normal: Plan;
  /** Unit vector pointing to the viewer's right while looking at the face. */
  right: Plan;
  /** Local box face that carries the media. */
  face: "+z" | "-z";
  /** Ends of the visible face plane (thickness included). */
  leftEnd: Plan;
  rightEnd: Plan;
  ambiguous: boolean;
}
export const SEAM_TOLERANCE_CM = 0.5;
export const CHAIN_SEARCH_CM = 15;
export const MAX_TEXTURE_PX = 4096;
const round = (n: number, d = 2) => Number(n.toFixed(d));
const dist = (a: Plan, b: Plan) => Math.hypot(a.x - b.x, a.z - b.z);
export function projectionSurface(
  p: Project,
  o: Instance,
): Surface | undefined {
  const d = p.definitions.find((v) => v.id === o.definitionId);
  if (!d || d.kind !== "panel") return undefined;
  const a = (o.rotation * Math.PI) / 180;
  // Three.js: rotation.y = a maps local +z to (sin a, cos a).
  const local = { x: Math.sin(a), z: Math.cos(a) };
  const toCentre = -(o.position.x * local.x + o.position.z * local.z);
  const ambiguous = Math.abs(toCentre) < 1e-6;
  const sign = toCentre < 0 ? -1 : 1;
  const normal = { x: local.x * sign, z: local.z * sign };
  const right = { x: normal.z, z: -normal.x };
  const half = d.size.x / 2,
    thick = d.size.z / 2;
  const face = {
    x: o.position.x + normal.x * thick,
    z: o.position.z + normal.z * thick,
  };
  return {
    objectId: o.id,
    name: o.name,
    widthCm: d.size.x,
    bottom: o.position.y,
    top: o.position.y + d.size.y,
    normal,
    right,
    face: sign > 0 ? "+z" : "-z",
    leftEnd: { x: face.x - right.x * half, z: face.z - right.z * half },
    rightEnd: { x: face.x + right.x * half, z: face.z + right.z * half },
    ambiguous,
  };
}
export interface LayoutSurface {
  objectId: string;
  name: string;
  face: "+z" | "-z";
  facing: string;
  widthCm: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  uPx0: number;
  uPx1: number;
}
export interface LayoutSeam {
  fromId: string;
  toId: string;
  uPx: number;
  gapCm: number;
  cornerDeg: number;
}
export interface CanvasLayout {
  canvasId: string;
  surfaces: LayoutSurface[];
  seams: LayoutSeam[];
  developedWidthCm: number;
  heightCm: number;
  bottom: number;
  pxPerCmX: number;
  pxPerCmY: number;
  issues: MediaIssue[];
}
function facingLabel(n: Plan) {
  const deg = ((Math.atan2(n.x, n.z) * 180) / Math.PI + 360) % 360;
  const names = ["+Z", "+X", "−Z", "−X"];
  const k = Math.round(deg / 90) % 4;
  return Math.abs(deg - k * 90) < 0.5 || Math.abs(deg - 360) < 0.5
    ? names[k]
    : `${round(deg, 1)}°`;
}
export function canvasLayout(p: Project, c: ProjectionCanvas): CanvasLayout {
  const issues: MediaIssue[] = [],
    surfaces: Surface[] = [];
  const add = (
    severity: MediaIssue["severity"],
    message: string,
    objectId?: string,
  ) => issues.push({ canvasId: c.id, objectId, severity, message });
  for (const id of c.surfaceIds) {
    const o = p.objects.find((v) => v.id === id);
    if (!o) {
      add("error", `Oppervlak ${id} bestaat niet meer.`, id);
      continue;
    }
    const s = projectionSurface(p, o);
    if (!s) {
      add(
        "error",
        `${o.name} is geen projectiepaneel en kan niet in een canvas.`,
        id,
      );
      continue;
    }
    if (s.ambiguous)
      add(
        "warning",
        `${o.name} staat midden in de ruimte: de kijkrichting is onbepaald (standaard +Z).`,
        id,
      );
    surfaces.push(s);
  }
  if (!surfaces.length) {
    add("error", "Canvas heeft geen geldige oppervlakken.");
    return {
      canvasId: c.id,
      surfaces: [],
      seams: [],
      developedWidthCm: 0,
      heightCm: 0,
      bottom: 0,
      pxPerCmX: 0,
      pxPerCmY: 0,
      issues,
    };
  }
  const total = surfaces.reduce((s, v) => s + v.widthCm, 0);
  const bottom = Math.min(...surfaces.map((s) => s.bottom)),
    top = Math.max(...surfaces.map((s) => s.top)),
    height = top - bottom;
  if (surfaces.some((s) => Math.abs(s.bottom - bottom) > SEAM_TOLERANCE_CM))
    add(
      "warning",
      "Oppervlakken beginnen op verschillende hoogte; het canvas toont alleen het deel dat een paneel bedekt.",
    );
  if (surfaces.some((s) => Math.abs(s.top - top) > SEAM_TOLERANCE_CM))
    add("warning", "Oppervlakken hebben verschillende hoogte.");
  const layout: LayoutSurface[] = [],
    seams: LayoutSeam[] = [];
  let acc = 0;
  surfaces.forEach((s, i) => {
    const u0 = acc / total,
      u1 = (acc + s.widthCm) / total;
    acc += s.widthCm;
    layout.push({
      objectId: s.objectId,
      name: s.name,
      face: s.face,
      facing: facingLabel(s.normal),
      widthCm: s.widthCm,
      u0,
      u1,
      v0: (s.bottom - bottom) / height,
      v1: (s.top - bottom) / height,
      uPx0: Math.round(u0 * c.widthPx),
      uPx1: Math.round(u1 * c.widthPx),
    });
    const prev = surfaces[i - 1];
    if (!prev) return;
    const gap = dist(prev.rightEnd, s.leftEnd);
    const cross = prev.right.x * s.right.z - prev.right.z * s.right.x,
      dot = prev.right.x * s.right.x + prev.right.z * s.right.z;
    const corner = Math.abs((Math.atan2(cross, dot) * 180) / Math.PI);
    seams.push({
      fromId: prev.objectId,
      toId: s.objectId,
      uPx: Math.round(u0 * c.widthPx),
      gapCm: round(gap),
      cornerDeg: round(corner, 1),
    });
    if (gap > SEAM_TOLERANCE_CM) {
      const reversed = dist(prev.rightEnd, s.rightEnd) < gap;
      add(
        "warning",
        `Naad ${prev.name} → ${s.name}: ${round(gap)} cm tussenruimte; het beeld loopt hier niet fysiek door.` +
          (reversed
            ? " Het volgende paneel sluit aan met de andere rand; controleer de volgorde."
            : ""),
        s.objectId,
      );
    }
    if (corner > 0.5)
      add(
        "info",
        `Hoek van ${round(corner, 1)}° bij ${prev.name} → ${s.name}: ontvouwen betekent dat het beeld in de hoek knikt. Ook bij gelijke pixels is dit geen perceptueel naadloze projectie.`,
        s.objectId,
      );
  });
  const pxX = c.widthPx / total,
    pxY = c.heightPx / height;
  if (Math.abs(pxX / pxY - 1) > 0.02)
    add(
      "warning",
      `Pixels zijn niet vierkant op de wand: ${round(pxX, 2)} px/cm horizontaal tegen ${round(pxY, 2)} px/cm verticaal. Beeld wordt vervormd.`,
    );
  if (Math.max(c.widthPx, c.heightPx) > MAX_TEXTURE_PX)
    add(
      "info",
      `Browserpreview schaalt het canvas naar maximaal ${MAX_TEXTURE_PX} px; de opgegeven pixelmaat blijft behouden voor export.`,
    );
  return {
    canvasId: c.id,
    surfaces: layout,
    seams,
    developedWidthCm: total,
    heightCm: height,
    bottom,
    pxPerCmX: pxX,
    pxPerCmY: pxY,
    issues,
  };
}
/** Orders panels left to right along the walls by matching visible face ends. */
export function chainSurfaces(
  p: Project,
  ids: string[],
): { order: string[]; unlinked: string[] } {
  const items = ids
    .map((id) => p.objects.find((o) => o.id === id))
    .map((o) => (o ? projectionSurface(p, o) : undefined))
    .filter((s): s is Surface => !!s);
  const next = new Map<string, string>(),
    hasPrev = new Set<string>();
  for (const a of items) {
    let best: { id: string; gap: number } | undefined;
    for (const b of items) {
      if (a === b || hasPrev.has(b.objectId)) continue;
      const gap = dist(a.rightEnd, b.leftEnd);
      if (gap <= CHAIN_SEARCH_CM && (!best || gap < best.gap))
        best = { id: b.objectId, gap };
    }
    if (best) {
      next.set(a.objectId, best.id);
      hasPrev.add(best.id);
    }
  }
  const chains: string[][] = [],
    seen = new Set<string>();
  const walk = (id?: string) => {
    const chain: string[] = [];
    while (id && !seen.has(id)) {
      seen.add(id);
      chain.push(id);
      id = next.get(id);
    }
    if (chain.length) chains.push(chain);
  };
  for (const s of items) if (!hasPrev.has(s.objectId)) walk(s.objectId);
  for (const s of items) walk(s.objectId);
  // The longest connected run is the canvas; stray panels follow and are flagged.
  const main = chains.reduce((m, c) => (c.length > m.length ? c : m), []);
  const rest = chains.filter((c) => c !== main).flat();
  return { order: [...main, ...rest], unlinked: rest };
}
export function defaultCanvasPixels(
  widthCm: number,
  heightCm: number,
  pxPerCm = 3,
) {
  const scale = Math.min(pxPerCm, MAX_TEXTURE_PX / Math.max(widthCm, heightCm));
  return {
    widthPx: Math.max(1, Math.round(widthCm * scale)),
    heightPx: Math.max(1, Math.round(heightCm * scale)),
  };
}
export interface FitRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  dx: number;
  dy: number;
  dw: number;
  dh: number;
}
export function fitRect(
  media: { w: number; h: number },
  canvas: { w: number; h: number },
  mode: FitMode,
): FitRect {
  if (mode === "stretch")
    return {
      sx: 0,
      sy: 0,
      sw: media.w,
      sh: media.h,
      dx: 0,
      dy: 0,
      dw: canvas.w,
      dh: canvas.h,
    };
  const scale =
    mode === "contain"
      ? Math.min(canvas.w / media.w, canvas.h / media.h)
      : Math.max(canvas.w / media.w, canvas.h / media.h);
  if (mode === "contain") {
    const dw = media.w * scale,
      dh = media.h * scale;
    return {
      sx: 0,
      sy: 0,
      sw: media.w,
      sh: media.h,
      dx: (canvas.w - dw) / 2,
      dy: (canvas.h - dh) / 2,
      dw,
      dh,
    };
  }
  const sw = canvas.w / scale,
    sh = canvas.h / scale;
  return {
    sx: (media.w - sw) / 2,
    sy: (media.h - sh) / 2,
    sw,
    sh,
    dx: 0,
    dy: 0,
    dw: canvas.w,
    dh: canvas.h,
  };
}
/** Maps the [0..1] UVs of a box face onto the panel's slice of the canvas. */
export function sliceUv(
  s: Pick<LayoutSurface, "u0" | "u1" | "v0" | "v1">,
  u: number,
  v: number,
) {
  return { u: s.u0 + u * (s.u1 - s.u0), v: s.v0 + v * (s.v1 - s.v0) };
}
export function pruneCanvases(
  canvases: ProjectionCanvas[] | undefined,
  removed: string[],
) {
  if (!canvases) return canvases;
  return canvases.map((c) =>
    c.surfaceIds.some((id) => removed.includes(id))
      ? { ...c, surfaceIds: c.surfaceIds.filter((id) => !removed.includes(id)) }
      : c,
  );
}
const finitePositive = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v > 0;
const ID = /^[\w.:-]{1,80}$/;
export function validateMedia(
  media: unknown,
  canvases: unknown,
  objectIds: Set<string>,
): { media: MediaAsset[]; canvases: ProjectionCanvas[] } {
  if (media !== undefined && (!Array.isArray(media) || media.length > 200))
    throw Error("Ongeldige media.");
  if (
    canvases !== undefined &&
    (!Array.isArray(canvases) || canvases.length > 50)
  )
    throw Error("Ongeldige canvassen.");
  const ids = new Set<string>();
  for (const m of media ?? []) {
    if (
      !m ||
      typeof m.id !== "string" ||
      !ID.test(m.id) ||
      ids.has(m.id) ||
      typeof m.name !== "string" ||
      !m.name.trim() ||
      !["test-pattern", "image", "video"].includes(m.kind) ||
      !finitePositive(m.widthPx) ||
      !finitePositive(m.heightPx) ||
      m.widthPx > 65536 ||
      m.heightPx > 65536
    )
      throw Error("Ongeldig media-item.");
    ids.add(m.id);
  }
  const canvasIds = new Set<string>();
  for (const c of canvases ?? []) {
    if (
      !c ||
      typeof c.id !== "string" ||
      !ID.test(c.id) ||
      canvasIds.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim() ||
      !Array.isArray(c.surfaceIds) ||
      c.surfaceIds.length > 500 ||
      new Set(c.surfaceIds).size !== c.surfaceIds.length ||
      c.surfaceIds.some(
        (id: unknown) => typeof id !== "string" || !objectIds.has(id),
      ) ||
      !Number.isInteger(c.widthPx) ||
      !Number.isInteger(c.heightPx) ||
      !finitePositive(c.widthPx) ||
      !finitePositive(c.heightPx) ||
      c.widthPx > 65536 ||
      c.heightPx > 65536 ||
      !["stretch", "contain", "cover"].includes(c.fit) ||
      typeof c.showSeams !== "boolean" ||
      (c.mediaId !== undefined && !ids.has(c.mediaId))
    )
      throw Error("Ongeldig projectiecanvas of ontbrekende verwijzing.");
    canvasIds.add(c.id);
  }
  return { media: media ?? [], canvases: canvases ?? [] };
}
