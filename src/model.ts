import {
  socketsFor,
  validSocket,
  worldSocket,
  distance,
  dot,
} from "./connectionMetadata.ts";
import type {
  ConnectionSocket,
  SceneConnection,
} from "./connectionMetadata.ts";
import { pruneCanvases, validateMedia } from "./media.ts";
import type { MediaAsset, ProjectionCanvas } from "./media.ts";
import type { ImportedAsset } from "./assetImport.ts";
/** Canonical units: centimetres. x = length, y = up, z = depth. Positions use bottom centre. */
export type Vec3 = { x: number; y: number; z: number };
export type Kind =
  | "frame"
  | "panel"
  | "truss"
  | "connector"
  | "door"
  | "table"
  | "projector"
  | "asset";
export type Preset = "technical" | "presentation" | "immersive";
export type View =
  | "perspective"
  | "top"
  | "front"
  | "back"
  | "left"
  | "right"
  | "bottom"
  | "eye";
export type MaterialId =
  "aluminium" | "black" | "fabric" | "wood" | "glass" | "white";
export interface Definition {
  id: string;
  name: string;
  kind: Kind;
  size: Vec3;
  material: MaterialId;
  source: "synthetic" | "imported";
  catalogId: string;
  /** Decorative objects stay out of the structural BOM and are listed separately. */
  decorative?: boolean;
  /** Present for imported GLB models; the bytes live in the asset store, not in the project. */
  asset?: ImportedAsset;
  unique?: boolean;
  sockets?: ConnectionSocket[];
}
export interface Instance {
  id: string;
  definitionId: string;
  name: string;
  position: Vec3;
  rotation: number;
  tag: string;
  groupId?: string;
  /** Links this object to a member of its group's assembly definition. */
  assemblyKey?: string;
  material?: MaterialId;
  visible: boolean;
  locked: boolean;
}
export interface Tag {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
}
export interface Group {
  id: string;
  name: string;
  parentId?: string;
  visible?: boolean;
  locked?: boolean;
  /** Set when this group is an instance of a shared assembly definition. */
  assemblyId?: string;
}
/** One part of an assembly, positioned relative to the assembly origin (x/z centre, y = lowest point). */
export interface AssemblyMember {
  key: string;
  definitionId: string;
  name: string;
  position: Vec3;
  rotation: number;
  tag: string;
  material?: MaterialId;
}
/** Shared definition: every instance group follows it until it is made unique or deliberately deviates. */
export interface AssemblyDefinition {
  id: string;
  name: string;
  unique?: boolean;
  members: AssemblyMember[];
}
export interface CameraBookmark {
  id: string;
  name: string;
  position: Vec3;
  target: Vec3;
  orthographic: boolean;
  zoom?: number;
  frustumHeight?: number;
}
export interface Project {
  schemaVersion: 1;
  id: string;
  name: string;
  units: "cm";
  room: { length: number; depth: number; height: number };
  definitions: Definition[];
  objects: Instance[];
  tags: Tag[];
  groups: Group[];
  cameras: CameraBookmark[];
  connections?: SceneConnection[];
  media?: MediaAsset[];
  canvases?: ProjectionCanvas[];
  assemblies?: AssemblyDefinition[];
  updatedAt: string;
}
export interface Issue {
  id: string;
  objectId?: string;
  severity: "error" | "warning";
  message: string;
}
export const MATERIALS: Record<
  MaterialId,
  {
    name: string;
    color: string;
    metalness: number;
    roughness: number;
    opacity?: number;
  }
> = {
  aluminium: {
    name: "Aluminium",
    color: "#b8c5d0",
    metalness: 0.85,
    roughness: 0.28,
  },
  black: { name: "Zwart", color: "#252b35", metalness: 0.3, roughness: 0.55 },
  fabric: {
    name: "Projectiedoek",
    color: "#d9e4e9",
    metalness: 0,
    roughness: 0.9,
  },
  wood: { name: "Eiken", color: "#a67d50", metalness: 0, roughness: 0.65 },
  glass: {
    name: "Glas",
    color: "#a8d4d5",
    metalness: 0.1,
    roughness: 0.15,
    opacity: 0.3,
  },
  white: { name: "Wit", color: "#f1f1e9", metalness: 0, roughness: 0.6 },
};
export const CATALOG: Definition[] = [
  {
    id: "frame-100",
    name: "Frame 100 × 250",
    kind: "frame",
    size: { x: 100, y: 250, z: 5 },
    material: "aluminium",
    source: "synthetic",
    catalogId: "DEMO-F100",
  },
  {
    id: "panel-100",
    name: "Projectiepaneel 100 × 250",
    kind: "panel",
    size: { x: 100, y: 250, z: 4 },
    material: "fabric",
    source: "synthetic",
    catalogId: "DEMO-P100",
  },
  {
    id: "truss-200",
    name: "Truss 200",
    kind: "truss",
    size: { x: 200, y: 25, z: 25 },
    material: "aluminium",
    source: "synthetic",
    catalogId: "DEMO-T200",
  },
  {
    id: "connector-25",
    name: "Verbindingsblok 25",
    kind: "connector",
    size: { x: 25, y: 25, z: 25 },
    material: "aluminium",
    source: "synthetic",
    catalogId: "DEMO-C25",
  },
  {
    id: "door-100",
    name: "Open doorgang 100 × 250",
    kind: "door",
    size: { x: 100, y: 250, z: 8 },
    material: "black",
    source: "synthetic",
    catalogId: "DEMO-D100",
  },
  {
    id: "table-140",
    name: "Tafel 140 × 80",
    kind: "table",
    size: { x: 140, y: 75, z: 80 },
    material: "wood",
    source: "synthetic",
    catalogId: "DEMO-TABLE",
  },
  {
    id: "projector-40",
    name: "Projector proxy 40",
    kind: "projector",
    size: { x: 40, y: 18, z: 30 },
    material: "white",
    source: "synthetic",
    catalogId: "DEMO-PROJ",
  },
];
export const uid = () => {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
export const clone = <T>(value: T): T => structuredClone(value);
const now = () => new Date().toISOString();
export function emptyProject(): Project {
  return {
    schemaVersion: 1,
    id: uid(),
    name: "Nieuw ruimtelijk ontwerp",
    units: "cm",
    room: { length: 800, depth: 400, height: 300 },
    definitions: clone(CATALOG),
    objects: [],
    tags: [
      { id: "frames", name: "Constructie", visible: true, locked: false },
      {
        id: "surfaces",
        name: "Projectievlakken",
        visible: true,
        locked: false,
      },
      { id: "furniture", name: "Inrichting", visible: true, locked: false },
    ],
    groups: [],
    cameras: [],
    updatedAt: now(),
  };
}
export function definition(p: Project, o: Instance): Definition {
  const d = p.definitions.find((d) => d.id === o.definitionId);
  if (!d) throw Error("Onderdeeldefinitie ontbreekt");
  return d;
}
export function effectiveMaterial(p: Project, o: Instance): MaterialId {
  return o.material ?? definition(p, o).material;
}
/** Root-to-leaf group path, bounded to keep malformed hierarchies from looping. */
export function groupPath(p: Project, groupId?: string): Group[] {
  const result: Group[] = [];
  const seen = new Set<string>();
  let id = groupId;
  while (id) {
    if (seen.has(id) || result.length >= 32)
      throw Error("Ongeldige of te diepe groepshiërarchie.");
    seen.add(id);
    const g = p.groups.find((v) => v.id === id);
    if (!g) throw Error("Groepsverwijzing ontbreekt.");
    result.push(g);
    id = g.parentId;
  }
  return result.reverse();
}
export function groupObjectIds(p: Project, id: string) {
  return p.objects
    .filter((o) => groupPath(p, o.groupId).some((g) => g.id === id))
    .map((o) => o.id);
}
export function inEditContext(
  p: Project,
  o: Instance,
  contextId: string | null,
) {
  return (
    contextId === null ||
    groupPath(p, o.groupId).some((g) => g.id === contextId)
  );
}
export function selectionUnits(p: Project, contextId: string | null) {
  const units = new Map<string, { id: string; objectIds: string[] }>();
  for (const o of p.objects) {
    if (!inEditContext(p, o, contextId)) continue;
    const path = groupPath(p, o.groupId),
      index = contextId ? path.findIndex((g) => g.id === contextId) : -1,
      child = path[index + 1];
    const id = child ? "group:" + child.id : o.id;
    let unit = units.get(id);
    if (!unit) {
      unit = { id, objectIds: [] };
      units.set(id, unit);
    }
    unit.objectIds.push(o.id);
  }
  return [...units.values()];
}
export function selectionAtLevel(
  p: Project,
  ids: string[],
  contextId: string | null,
) {
  return selectionUnits(p, contextId)
    .filter((unit) => unit.objectIds.some((id) => ids.includes(id)))
    .flatMap((unit) => unit.objectIds);
}
export function childGroupForObject(
  p: Project,
  id: string,
  contextId: string | null,
) {
  const o = p.objects.find((v) => v.id === id);
  if (!o || !inEditContext(p, o, contextId)) return null;
  const path = groupPath(p, o.groupId),
    index = contextId ? path.findIndex((g) => g.id === contextId) : -1;
  return path[index + 1]?.id ?? null;
}
export function isLocked(p: Project, o: Instance) {
  return (
    o.locked ||
    !!p.tags.find((t) => t.id === o.tag)?.locked ||
    groupPath(p, o.groupId).some((g) => g.locked)
  );
}
export function isVisible(p: Project, o: Instance) {
  return (
    o.visible &&
    p.tags.find((t) => t.id === o.tag)?.visible !== false &&
    groupPath(p, o.groupId).every((g) => g.visible !== false)
  );
}
export function newInstance(
  p: Project,
  definitionId: string,
  position?: Vec3,
): Instance {
  const d = p.definitions.find((d) => d.id === definitionId);
  if (!d) throw Error("Onbekend onderdeel");
  return {
    id: uid(),
    definitionId,
    name: d.name,
    position: position ?? { x: 0, y: 0, z: 0 },
    rotation: 0,
    tag:
      d.kind === "panel"
        ? "surfaces"
        : ["table", "projector"].includes(d.kind)
          ? "furniture"
          : "frames",
    visible: true,
    locked: false,
  };
}
export function demoProject(): Project {
  const p = emptyProject();
  p.name = "Immersive room · 4 × 8 m";
  // Room length 800 cm along x; both long-side projection strips leave end entries open.
  for (const z of [-195, 195])
    for (let x = -350; x <= 350; x += 100) {
      p.objects.push(newInstance(p, "frame-100", { x, y: 0, z }));
      p.objects.push(
        newInstance(p, "panel-100", { x, y: 0, z: z < 0 ? z + 3 : z - 3 }),
      );
    }
  for (const x of [-395, 395]) {
    const o = newInstance(p, "door-100", { x, y: 0, z: 0 });
    o.rotation = 90;
    p.objects.push(o);
  }
  const t = newInstance(p, "table-140", { x: -180, y: 0, z: 0 });
  p.objects.push(t);
  const pr = newInstance(p, "projector-40", { x: -180, y: 75, z: 0 });
  pr.name = "Projector op tafel";
  p.objects.push(pr);
  return p;
}
/** Demo with one projection canvas that turns a 90° corner (7 long-wall panels + 1 short-wall panel). */
export function mediaDemoProject(): Project {
  const p = demoProject();
  p.name = "Hoekcanvas · 4 × 8 m";
  const longWall = p.objects.filter(
    (o) => o.definitionId === "panel-100" && o.position.z < 0,
  );
  const first = longWall.sort((a, b) => a.position.x - b.position.x)[0];
  p.objects = p.objects.filter((o) => o.id !== first.id);
  for (const o of longWall) if (o.id !== first.id) o.position.x -= 6;
  const corner = newInstance(p, "panel-100", { x: 396, y: 0, z: -140 });
  corner.rotation = 90;
  p.objects.push(corner);
  const run = [...longWall.filter((o) => o.id !== first.id), corner];
  p.media = [
    {
      id: "test-pattern",
      name: "Kalibratiepatroon",
      kind: "test-pattern",
      widthPx: 2400,
      heightPx: 750,
    },
  ];
  p.canvases = [
    {
      id: "canvas-corner",
      name: "Hoekcanvas",
      surfaceIds: run.map((o) => o.id),
      widthPx: 2400,
      heightPx: 750,
      fit: "stretch",
      mediaId: "test-pattern",
      showSeams: true,
    },
  ];
  return p;
}
export function bounds(p: Project, o: Instance) {
  const s = definition(p, o).size,
    a = (o.rotation * Math.PI) / 180;
  const hx = (Math.abs(s.x * Math.cos(a)) + Math.abs(s.z * Math.sin(a))) / 2;
  const hz = (Math.abs(s.x * Math.sin(a)) + Math.abs(s.z * Math.cos(a))) / 2;
  return {
    min: { x: o.position.x - hx, y: o.position.y, z: o.position.z - hz },
    max: { x: o.position.x + hx, y: o.position.y + s.y, z: o.position.z + hz },
  };
}
export function validate(p: Project): Issue[] {
  const issues: Issue[] = [];
  const eps = 0.001;
  for (const o of p.objects) {
    const b = bounds(p, o);
    const r = p.room;
    const sides: string[] = [];
    if (b.min.x < -r.length / 2 - eps)
      sides.push(`links ${(-r.length / 2 - b.min.x).toFixed(1)} cm`);
    if (b.max.x > r.length / 2 + eps)
      sides.push(`rechts ${(b.max.x - r.length / 2).toFixed(1)} cm`);
    if (b.min.z < -r.depth / 2 - eps)
      sides.push(`achter ${(-r.depth / 2 - b.min.z).toFixed(1)} cm`);
    if (b.max.z > r.depth / 2 + eps)
      sides.push(`voor ${(b.max.z - r.depth / 2).toFixed(1)} cm`);
    if (b.min.y < -eps) sides.push(`onder vloer ${(-b.min.y).toFixed(1)} cm`);
    if (b.max.y > r.height + eps)
      sides.push(`boven plafond ${(b.max.y - r.height).toFixed(1)} cm`);
    if (sides.length)
      issues.push({
        id: `bounds-${o.id}`,
        objectId: o.id,
        severity: "error",
        message: `${o.name}: buiten ruimte — ${sides.join(", ")}.`,
      });
    if (definition(p, o).kind === "truss" && o.position.y > 1)
      issues.push({
        id: `support-${o.id}`,
        objectId: o.id,
        severity: "warning",
        message: `${o.name}: ophanging/ondersteuning niet gecontroleerd.`,
      });
  }
  for (const connection of p.connections ?? []) {
    const from = p.objects.find((o) => o.id === connection.from.objectId)!;
    const to = p.objects.find((o) => o.id === connection.to.objectId)!;
    const a = worldSocket(definition(p, from), from, connection.from.socketId);
    const b = worldSocket(definition(p, to), to, connection.to.socketId);
    if (
      a.socket.profile !== b.socket.profile ||
      distance(a.position, b.position) > 0.1 ||
      dot(a.normal, b.normal) > -0.999
    )
      issues.push({
        id: `connection-${connection.id}`,
        objectId: from.id,
        severity: "warning",
        message: `Uitlijning gewijzigd: ${from.name} / ${to.name}. Controleer de demo-verbinding.`,
      });
  }
  return issues;
}
export function collisionWarnings(p: Project): Issue[] {
  const issues: Issue[] = [];
  const objects = p.objects.filter(
    (o) =>
      isVisible(p, o) && !["frame", "door"].includes(definition(p, o).kind),
  );
  // Conservative rotated AABBs only, not an engineering or exact mesh intersection test.
  for (let i = 0; i < objects.length; i++)
    for (let j = i + 1; j < objects.length; j++) {
      const a = bounds(p, objects[i]),
        b = bounds(p, objects[j]);
      if (
        ["x", "y", "z"].every(
          (k) =>
            Math.min(a.max[k as keyof Vec3], b.max[k as keyof Vec3]) -
              Math.max(a.min[k as keyof Vec3], b.min[k as keyof Vec3]) >
            0.5,
        )
      )
        issues.push({
          id: `collision-${objects[i].id}-${objects[j].id}`,
          objectId: objects[i].id,
          severity: "warning",
          message: `Mogelijke overlap: ${objects[i].name} / ${objects[j].name} (omhullende dozen).`,
        });
    }
  return issues;
}
export function editObjects(
  p: Project,
  ids: string[],
  edit: (o: Instance) => void,
): Project {
  const n = clone(p);
  n.objects.filter((o) => ids.includes(o.id) && !isLocked(n, o)).forEach(edit);
  return n;
}
export function duplicate(
  p: Project,
  ids: string[],
  contextId: string | null = null,
): { project: Project; ids: string[] } {
  const n = clone(p),
    result: string[] = [];
  const instanceMapping = new Map<string, string>();
  if (p.objects.some((o) => ids.includes(o.id) && isLocked(p, o)))
    return { project: n, ids: [] };
  const selected = new Set(ids),
    mapping = new Map<string, string>();
  for (const g of p.groups) {
    const descendants = groupObjectIds(p, g.id);
    if (
      descendants.length &&
      descendants.every((id) => selected.has(id)) &&
      g.id !== contextId
    )
      mapping.set(g.id, uid());
  }
  for (const g of p.groups.filter((g) => mapping.has(g.id))) {
    const copy = clone(g);
    copy.id = mapping.get(g.id)!;
    copy.name += " · kopie";
    if (g.parentId) copy.parentId = mapping.get(g.parentId) ?? g.parentId;
    n.groups.push(copy);
  }
  for (const o of p.objects.filter((o) => selected.has(o.id))) {
    const c = clone(o);
    c.id = uid();
    instanceMapping.set(o.id, c.id);
    c.name = `${o.name} · kopie`;
    c.position.x += 20;
    c.position.z += 20;
    if (o.groupId && mapping.has(o.groupId)) c.groupId = mapping.get(o.groupId);
    else {
      // A copy outside a copied assembly group is a plain object, not a second member with the same key.
      delete c.assemblyKey;
      if (contextId) c.groupId = contextId;
      else delete c.groupId;
    }
    n.objects.push(c);
    result.push(c.id);
  }
  if (n.connections) {
    n.connections.push(
      ...(p.connections ?? [])
        .filter(
          (c) =>
            instanceMapping.has(c.from.objectId) &&
            instanceMapping.has(c.to.objectId),
        )
        .map((c) => ({
          id: uid(),
          from: {
            objectId: instanceMapping.get(c.from.objectId)!,
            socketId: c.from.socketId,
          },
          to: {
            objectId: instanceMapping.get(c.to.objectId)!,
            socketId: c.to.socketId,
          },
        })),
    );
  }
  return { project: n, ids: result };
}
export function makeUnique(p: Project, ids: string[]): Project {
  const n = clone(p);
  if (n.objects.some((o) => ids.includes(o.id) && isLocked(n, o))) return n;
  for (const o of n.objects.filter(
    (o) => ids.includes(o.id) && !isLocked(n, o),
  )) {
    const d = clone(definition(n, o));
    d.id = uid();
    d.name = `${d.name} · uniek`;
    d.unique = true;
    n.definitions.push(d);
    o.definitionId = d.id;
  }
  return n;
}
export function group(
  p: Project,
  ids: string[],
  contextId: string | null = null,
): Project {
  const n = clone(p),
    eligible = n.objects.filter((o) => ids.includes(o.id));
  if (
    eligible.length < 2 ||
    eligible.some(
      (o) =>
        isLocked(n, o) ||
        !inEditContext(n, o, contextId) ||
        groupPath(n, o.groupId).length >= 32,
    )
  )
    return n;
  const selected = new Set(ids),
    children = n.groups.filter((g) => (g.parentId ?? null) === contextId);
  const moved: string[] = [];
  for (const g of children) {
    const members = groupObjectIds(n, g.id);
    if (members.some((id) => selected.has(id))) {
      if (!members.every((id) => selected.has(id))) return n;
      moved.push(g.id);
    }
  }
  const id = uid(),
    newGroup: Group = {
      id,
      name: `Groep ${n.groups.length + 1}`,
      ...(contextId ? { parentId: contextId } : {}),
    };
  for (const child of children.filter((g) => moved.includes(g.id)))
    child.parentId = id;
  for (const o of eligible) {
    if (!o.groupId || o.groupId === contextId) {
      if (o.groupId) delete o.assemblyKey;
      o.groupId = id;
    }
  }
  n.groups.push(newGroup);
  return n;
}
export function ungroup(
  p: Project,
  ids: string[],
  contextId: string | null = null,
): Project {
  const n = clone(p);
  if (n.objects.some((o) => ids.includes(o.id) && isLocked(n, o))) return n;
  const selected = new Set(ids),
    dissolve = n.groups.filter(
      (g) =>
        (g.parentId ?? null) === contextId &&
        groupObjectIds(n, g.id).length > 0 &&
        groupObjectIds(n, g.id).every((id) => selected.has(id)),
    );
  for (const g of dissolve) {
    for (const o of n.objects.filter((o) => o.groupId === g.id)) {
      delete o.assemblyKey;
      if (contextId) o.groupId = contextId;
      else delete o.groupId;
    }
    for (const child of n.groups.filter((c) => c.parentId === g.id)) {
      if (contextId) child.parentId = contextId;
      else delete child.parentId;
    }
  }
  n.groups = n.groups.filter((g) => !dissolve.some((v) => v.id === g.id));
  return n;
}
export function removeObjects(p: Project, ids: string[]): Project {
  const n = clone(p);
  if (n.objects.some((o) => ids.includes(o.id) && isLocked(n, o))) return n;
  n.objects = n.objects.filter((o) => !ids.includes(o.id));
  n.groups = n.groups.filter((g) => groupObjectIds(n, g.id).length > 0);
  if (n.connections)
    n.connections = n.connections.filter(
      (c) => !ids.includes(c.from.objectId) && !ids.includes(c.to.objectId),
    );
  if (n.canvases) n.canvases = pruneCanvases(n.canvases, ids);
  return n;
}
export interface BomRow {
  definitionId: string;
  code: string;
  description: string;
  kind: Kind;
  quantity: number;
  size: Vec3;
  material: MaterialId;
  status: string;
  group: string;
}
export const statusOf = (d: Definition) =>
  d.source === "imported"
    ? d.unique
      ? "Geïmporteerd · niet geverifieerd · uniek"
      : "Geïmporteerd · niet geverifieerd"
    : d.unique
      ? "Synthetisch · uniek"
      : "Synthetische demo";
function bomRows(p: Project, decorative: boolean): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const o of p.objects) {
    const d = definition(p, o);
    if (!!d.decorative !== decorative) continue;
    const m = effectiveMaterial(p, o),
      g =
        groupPath(p, o.groupId)
          .map((g) => g.name)
          .join(" / ") || "—";
    const key = JSON.stringify([d.id, m, o.groupId ?? null]);
    const row = rows.get(key);
    if (row) row.quantity++;
    else
      rows.set(key, {
        definitionId: d.id,
        code: d.catalogId,
        description: d.name,
        kind: d.kind,
        quantity: 1,
        size: d.size,
        material: m,
        status: decorative ? "Decoratief · buiten BOM" : statusOf(d),
        group: g,
      });
  }
  return [...rows.values()];
}
/** Structural bill of materials. Decorative objects are excluded on purpose; see decorativeBom. */
export const bom = (p: Project): BomRow[] => bomRows(p, false);
/** Decorative objects: listed separately so nothing is hidden, but never counted as structural parts. */
export const decorativeBom = (p: Project): BomRow[] => bomRows(p, true);
export const decorativeCount = (p: Project) =>
  p.objects.filter((o) => definition(p, o).decorative).length;
export function bomCsv(p: Project): string {
  const q = (s: unknown) => {
    const text =
      typeof s === "string" && /^[\s]*[=+@-]/.test(s) ? `'${s}` : String(s);
    return `"${text.replaceAll('"', '""')}"`;
  };
  const rows = [
    [
      "Code",
      "Omschrijving",
      "Type",
      "Aantal",
      "Lengte cm",
      "Hoogte cm",
      "Diepte cm",
      "Materiaal",
      "Groep",
      "Status",
    ],
    ...bom(p).map((r) => [
      r.code,
      r.description,
      r.kind,
      r.quantity,
      r.size.x,
      r.size.y,
      r.size.z,
      MATERIALS[r.material].name,
      r.group,
      r.status,
    ]),
  ];
  return "\ufeff" + rows.map((row) => row.map(q).join(";")).join("\r\n");
}
export function serialize(p: Project): string {
  return JSON.stringify({ ...p, updatedAt: now() }, null, 2);
}
const finite = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7;
const vector = (v: any) => v && finite(v.x) && finite(v.y) && finite(v.z);
const text = (v: unknown) =>
  typeof v === "string" && v.length > 0 && v.length <= 300;
const uniqueIds = (a: { id: string }[]) =>
  new Set(a.map((o) => o.id)).size === a.length;
/** Assembly references must be complete and unique, or the project is refused. */
function validAssemblies(p: any): AssemblyDefinition[] | undefined {
  const bad = (): never => {
    throw Error("Ongeldige assembly of assembly-verwijzing.");
  };
  const list = p.assemblies;
  if (list !== undefined && (!Array.isArray(list) || list.length > 200)) bad();
  const defs = new Map<string, Set<string>>();
  for (const a of list ?? []) {
    if (
      !a ||
      !text(a.id) ||
      !text(a.name) ||
      a.name.length > 120 ||
      defs.has(a.id) ||
      !Array.isArray(a.members) ||
      !a.members.length ||
      a.members.length > 500 ||
      (a.unique !== undefined && typeof a.unique !== "boolean")
    )
      bad();
    const keys = new Set<string>();
    for (const m of a.members) {
      if (
        !m ||
        !text(m.key) ||
        keys.has(m.key) ||
        !text(m.name) ||
        !vector(m.position) ||
        !finite(m.rotation) ||
        !p.definitions.some((d: Definition) => d.id === m.definitionId) ||
        !p.tags.some((t: Tag) => t.id === m.tag) ||
        (m.material !== undefined && !Object.hasOwn(MATERIALS, m.material))
      )
        bad();
      keys.add(m.key);
    }
    defs.set(a.id, keys);
  }
  for (const g of p.groups)
    if (g.assemblyId !== undefined && !defs.has(g.assemblyId)) bad();
  const seen = new Set<string>();
  for (const o of p.objects) {
    if (o.assemblyKey === undefined) continue;
    const g = p.groups.find((v: Group) => v.id === o.groupId);
    const unique = JSON.stringify([o.groupId, o.assemblyKey]);
    if (
      !g?.assemblyId ||
      !defs.get(g.assemblyId)?.has(o.assemblyKey) ||
      seen.has(unique)
    )
      bad();
    seen.add(unique);
  }
  return list === undefined ? undefined : list;
}
const UNITS = ["m", "cm", "mm"];
/** Synthetic parts carry no asset; imported parts must carry complete, bounded provenance. */
function validSource(d: any) {
  if (d.decorative !== undefined && typeof d.decorative !== "boolean")
    return false;
  if (d.source === "synthetic")
    return d.kind !== "asset" && d.asset === undefined;
  if (d.source !== "imported" || d.kind !== "asset") return false;
  const a = d.asset;
  return (
    !!a &&
    /^[0-9a-f]{64}$/.test(a.sha256) &&
    Number.isSafeInteger(a.bytes) &&
    a.bytes > 0 &&
    a.bytes <= 25_000_000 &&
    typeof a.fileName === "string" &&
    a.fileName.length <= 120 &&
    UNITS.includes(a.units) &&
    typeof a.provenance === "string" &&
    a.provenance.trim().length >= 3 &&
    a.provenance.length <= 500 &&
    (a.license === undefined ||
      (typeof a.license === "string" && a.license.length <= 300)) &&
    Number.isSafeInteger(a.triangles) &&
    a.triangles >= 0 &&
    Math.max(d.size.x, d.size.y, d.size.z) <= 100000
  );
}
export function parseProject(raw: string): Project {
  if (raw.length > 10_000_000) throw Error("Project is groter dan 10 MB.");
  const p = JSON.parse(raw);
  if (
    !p ||
    p.schemaVersion !== 1 ||
    p.units !== "cm" ||
    !text(p.id) ||
    !text(p.name)
  )
    throw Error("Geen ondersteund project (schema 1, cm).");
  if (
    !p.room ||
    !["length", "depth", "height"].every(
      (k) => finite(p.room[k]) && p.room[k] >= 10 && p.room[k] <= 100000,
    )
  )
    throw Error("Ongeldige ruimteafmetingen.");
  for (const k of ["definitions", "objects", "tags", "groups", "cameras"])
    if (
      !Array.isArray(p[k]) ||
      p[k].length > 10000 ||
      p[k].some((v: any) => !v || !text(v.id)) ||
      !uniqueIds(p[k])
    )
      throw Error(`Ongeldige of dubbele IDs in ${k}.`);
  for (const d of p.definitions)
    if (
      !text(d.name) ||
      !vector(d.size) ||
      !["x", "y", "z"].every((k) => d.size[k] > 0) ||
      ![
        "frame",
        "panel",
        "truss",
        "connector",
        "door",
        "table",
        "projector",
        "asset",
      ].includes(d.kind) ||
      !Object.hasOwn(MATERIALS, d.material) ||
      !validSource(d) ||
      !text(d.catalogId) ||
      (d.sockets !== undefined &&
        (!Array.isArray(d.sockets) ||
          d.sockets.length > 64 ||
          !uniqueIds(d.sockets) ||
          !d.sockets.every(validSocket)))
    )
      throw Error("Ongeldige onderdeeldefinitie.");
  for (const t of p.tags)
    if (
      !text(t.name) ||
      typeof t.visible !== "boolean" ||
      typeof t.locked !== "boolean"
    )
      throw Error("Ongeldige laag.");
  for (const g of p.groups) {
    if (
      !text(g.name) ||
      (g.parentId !== undefined &&
        (!text(g.parentId) ||
          !p.groups.some((v: Group) => v.id === g.parentId))) ||
      (g.visible !== undefined && typeof g.visible !== "boolean") ||
      (g.locked !== undefined && typeof g.locked !== "boolean")
    )
      throw Error("Ongeldige groep.");
    groupPath(p, g.id);
  }

  for (const o of p.objects)
    if (
      !text(o.name) ||
      !p.definitions.some((d: Definition) => d.id === o.definitionId) ||
      !vector(o.position) ||
      !finite(o.rotation) ||
      typeof o.visible !== "boolean" ||
      typeof o.locked !== "boolean" ||
      !p.tags.some((t: Tag) => t.id === o.tag) ||
      (o.groupId && !p.groups.some((g: Group) => g.id === o.groupId)) ||
      (o.material && !Object.hasOwn(MATERIALS, o.material))
    )
      throw Error("Ongeldig object of ontbrekende verwijzing.");
  if (p.connections !== undefined) {
    if (
      !Array.isArray(p.connections) ||
      p.connections.length > 10000 ||
      p.connections.some((c: any) => !c || !text(c.id)) ||
      !uniqueIds(p.connections)
    )
      throw Error("Ongeldige verbindingen.");
    const occupied = new Set<string>();
    for (const c of p.connections) {
      if (!c.from || !c.to || c.from.objectId === c.to.objectId)
        throw Error("Ongeldige verbindingsreferentie.");
      for (const endpoint of [c.from, c.to]) {
        const o = p.objects.find((v: Instance) => v.id === endpoint.objectId);
        const d =
          o && p.definitions.find((v: Definition) => v.id === o.definitionId);
        const key = JSON.stringify([endpoint.objectId, endpoint.socketId]);
        if (
          !d ||
          !socketsFor(d).some((s) => s.id === endpoint.socketId) ||
          occupied.has(key)
        )
          throw Error("Ontbrekend of bezet uitlijnpunt.");
        occupied.add(key);
      }
    }
  }
  const assemblies = validAssemblies(p);
  const mediaParts =
    p.media !== undefined || p.canvases !== undefined
      ? validateMedia(
          p.media,
          p.canvases,
          new Set(p.objects.map((o: Instance) => o.id)),
        )
      : undefined;
  for (const c of p.cameras)
    if (
      !text(c.name) ||
      !vector(c.position) ||
      !vector(c.target) ||
      typeof c.orthographic !== "boolean" ||
      (c.zoom !== undefined && (!finite(c.zoom) || c.zoom <= 0)) ||
      (c.frustumHeight !== undefined &&
        (!finite(c.frustumHeight) || c.frustumHeight <= 0))
    )
      throw Error("Ongeldige camera.");
  // Only keep known fields at the root. All text is rendered as text by React.
  return {
    schemaVersion: 1,
    id: p.id,
    name: p.name,
    units: "cm",
    room: p.room,
    definitions: p.definitions,
    objects: p.objects,
    tags: p.tags,
    groups: p.groups,
    cameras: p.cameras,
    ...(p.connections !== undefined ? { connections: p.connections } : {}),
    ...(assemblies ? { assemblies } : {}),
    ...(mediaParts ? mediaParts : {}),
    updatedAt: typeof p.updatedAt === "string" ? p.updatedAt : now(),
  };
}
export interface History {
  past: Project[];
  present: Project;
  future: Project[];
}
export function commit(h: History, p: Project): History {
  if (JSON.stringify(h.present) === JSON.stringify(p)) return h;
  return {
    past: [...h.past, h.present].slice(-100),
    present: { ...p, updatedAt: now() },
    future: [],
  };
}
export function undo(h: History): History {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past.at(-1)!,
    future: [h.present, ...h.future],
  };
}
export function redo(h: History): History {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
  };
}
export const cmToMetres = (cm: number) => cm / 100;
export const metresToCm = (m: number) => m * 100;
