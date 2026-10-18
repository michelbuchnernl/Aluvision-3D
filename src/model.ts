/** Canonical units: centimetres. x = length, y = up, z = depth. Positions use bottom centre. */
export type Vec3 = { x: number; y: number; z: number };
export type Kind =
  "frame" | "panel" | "truss" | "connector" | "door" | "table" | "projector";
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
  source: "synthetic";
  catalogId: string;
  unique?: boolean;
}
export interface Instance {
  id: string;
  definitionId: string;
  name: string;
  position: Vec3;
  rotation: number;
  tag: string;
  groupId?: string;
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
export function isLocked(p: Project, o: Instance) {
  return o.locked || !!p.tags.find((t) => t.id === o.tag)?.locked;
}
export function isVisible(p: Project, o: Instance) {
  return o.visible && p.tags.find((t) => t.id === o.tag)?.visible !== false;
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
): { project: Project; ids: string[] } {
  const n = clone(p),
    result: string[] = [];
  for (const o of p.objects.filter(
    (o) => ids.includes(o.id) && !isLocked(p, o),
  )) {
    const c = clone(o);
    c.id = uid();
    c.name = `${o.name} · kopie`;
    c.position.x += 20;
    c.position.z += 20;
    delete c.groupId;
    n.objects.push(c);
    result.push(c.id);
  }
  return { project: n, ids: result };
}
export function makeUnique(p: Project, ids: string[]): Project {
  const n = clone(p);
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
export function group(p: Project, ids: string[]): Project {
  const n = clone(p);
  const eligible = n.objects.filter(
    (o) => ids.includes(o.id) && !isLocked(n, o),
  );
  if (eligible.length < 2) return n;
  const g = { id: uid(), name: `Groep ${n.groups.length + 1}` };
  n.groups.push(g);
  eligible.forEach((o) => (o.groupId = g.id));
  return n;
}
export function removeObjects(p: Project, ids: string[]): Project {
  const n = clone(p);
  n.objects = n.objects.filter((o) => !ids.includes(o.id) || isLocked(n, o));
  n.groups = n.groups.filter((g) => n.objects.some((o) => o.groupId === g.id));
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
export function bom(p: Project): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const o of p.objects) {
    const d = definition(p, o),
      m = effectiveMaterial(p, o),
      g = p.groups.find((g) => g.id === o.groupId)?.name ?? "—";
    const key = JSON.stringify([d.id, m, g]);
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
        status: d.unique ? "Synthetisch · uniek" : "Synthetische demo",
        group: g,
      });
  }
  return [...rows.values()];
}
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
      ].includes(d.kind) ||
      !Object.hasOwn(MATERIALS, d.material) ||
      d.source !== "synthetic" ||
      !text(d.catalogId)
    )
      throw Error("Ongeldige onderdeeldefinitie.");
  for (const t of p.tags)
    if (
      !text(t.name) ||
      typeof t.visible !== "boolean" ||
      typeof t.locked !== "boolean"
    )
      throw Error("Ongeldige laag.");
  for (const g of p.groups) if (!text(g.name)) throw Error("Ongeldige groep.");
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
