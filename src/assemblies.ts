import {
  bounds,
  clone,
  groupObjectIds,
  isLocked,
  removeObjects,
  uid,
} from "./model.ts";
import type {
  AssemblyDefinition,
  AssemblyMember,
  Group,
  Instance,
  Project,
  Vec3,
} from "./model.ts";
/**
 * Shared assembly definitions. A group can be saved as an assembly; every instance group then follows the
 * definition. Members are ordinary objects in the scene (so BOM, bounds, export and selection keep working),
 * linked to the definition by `assemblyKey`. An instance's origin and rotation are derived from its members,
 * so moving or rotating the whole group rigidly is not a deviation. Deviations are never overwritten silently.
 */
const POS_TOL = 0.01,
  ROT_TOL = 0.01;
const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
const turn = (x: number, z: number, deg: number) => {
  const a = (deg * Math.PI) / 180;
  return {
    x: x * Math.cos(a) + z * Math.sin(a),
    z: -x * Math.sin(a) + z * Math.cos(a),
  };
};
const fail = (msg: string): never => {
  throw Error(msg);
};
const assemblyOf = (p: Project, id: string) =>
  (p.assemblies ?? []).find((a) => a.id === id);
const groupOf = (p: Project, id: string) =>
  p.groups.find((g) => g.id === id) ?? fail("Groep bestaat niet.");
const directMembers = (p: Project, groupId: string) =>
  p.objects.filter((o) => o.groupId === groupId && o.assemblyKey !== undefined);
export interface Frame {
  origin: Vec3;
  rotation: number;
}
/** Origin and yaw of an instance, taken from the first definition member that is still present. */
export function deriveFrame(
  p: Project,
  g: Group,
  def: AssemblyDefinition,
): Frame | undefined {
  const present = directMembers(p, g.id);
  for (const m of def.members) {
    const o = present.find((v) => v.assemblyKey === m.key);
    if (!o) continue;
    const rotation = wrap(o.rotation - m.rotation),
      r = turn(m.position.x, m.position.z, rotation);
    return {
      origin: {
        x: o.position.x - r.x,
        y: o.position.y - m.position.y,
        z: o.position.z - r.z,
      },
      rotation,
    };
  }
  return undefined;
}
const expected = (m: AssemblyMember, f: Frame) => {
  const r = turn(m.position.x, m.position.z, f.rotation);
  return {
    position: {
      x: f.origin.x + r.x,
      y: f.origin.y + m.position.y,
      z: f.origin.z + r.z,
    },
    rotation: wrap(m.rotation + f.rotation),
  };
};
export interface AssemblyDiff {
  key?: string;
  objectId?: string;
  kind:
    | "missing"
    | "extra"
    | "moved"
    | "rotated"
    | "definition"
    | "material"
    | "tag";
  message: string;
}
export interface AssemblyStatus {
  state: "in-sync" | "drift" | "empty";
  frame?: Frame;
  diffs: AssemblyDiff[];
  assembly: AssemblyDefinition;
}
export function assemblyStatus(p: Project, groupId: string): AssemblyStatus {
  const g = groupOf(p, groupId),
    def =
      assemblyOf(p, g.assemblyId ?? "") ??
      fail("Deze groep is geen assembly-exemplaar.");
  const frame = deriveFrame(p, g, def),
    diffs: AssemblyDiff[] = [],
    direct = directMembers(p, g.id);
  if (!frame)
    return {
      state: "empty",
      diffs: [{ kind: "missing", message: "Alle onderdelen ontbreken." }],
      assembly: def,
    };
  for (const m of def.members) {
    const o = direct.find((v) => v.assemblyKey === m.key);
    if (!o) {
      diffs.push({
        key: m.key,
        kind: "missing",
        message: `${m.name} ontbreekt.`,
      });
      continue;
    }
    const e = expected(m, frame);
    const d = Math.max(
      Math.abs(o.position.x - e.position.x),
      Math.abs(o.position.y - e.position.y),
      Math.abs(o.position.z - e.position.z),
    );
    if (d > POS_TOL)
      diffs.push({
        key: m.key,
        objectId: o.id,
        kind: "moved",
        message: `${o.name} staat ${d.toFixed(1)} cm anders dan de definitie.`,
      });
    if (Math.abs(wrap(o.rotation - e.rotation)) > ROT_TOL)
      diffs.push({
        key: m.key,
        objectId: o.id,
        kind: "rotated",
        message: `${o.name} is anders gedraaid dan de definitie.`,
      });
    if (o.definitionId !== m.definitionId)
      diffs.push({
        key: m.key,
        objectId: o.id,
        kind: "definition",
        message: `${o.name} gebruikt een andere onderdeeldefinitie.`,
      });
    if (o.material !== m.material)
      diffs.push({
        key: m.key,
        objectId: o.id,
        kind: "material",
        message: `${o.name} heeft een ander materiaal.`,
      });
    if (o.tag !== m.tag)
      diffs.push({
        key: m.key,
        objectId: o.id,
        kind: "tag",
        message: `${o.name} staat op een andere laag.`,
      });
  }
  const known = new Set(direct.map((o) => o.id));
  for (const id of groupObjectIds(p, g.id))
    if (!known.has(id)) {
      const o = p.objects.find((v) => v.id === id)!;
      diffs.push({
        objectId: id,
        kind: "extra",
        message: `${o.name} hoort niet bij de definitie.`,
      });
    }
  return {
    state: diffs.length ? "drift" : "in-sync",
    frame,
    diffs,
    assembly: def,
  };
}
export function assemblyUsers(p: Project, assemblyId: string) {
  return p.groups.filter((g) => g.assemblyId === assemblyId);
}
const name80 = (name: string) => {
  const t = name.trim();
  if (!t || t.length > 80) fail("Geef een naam van 1–80 tekens.");
  return t;
};
export function saveAssembly(
  p: Project,
  groupId: string,
  name: string,
): { project: Project; assemblyId: string } {
  const n = clone(p),
    g = groupOf(n, groupId),
    title = name80(name);
  if (g.assemblyId)
    fail(
      "Deze groep is al een assembly-exemplaar. Gebruik 'Toepassen op definitie'.",
    );
  if (n.groups.some((c) => c.parentId === g.id))
    fail(
      "Groepen met subgroepen kunnen niet worden opgeslagen. Haal de subgroepen eerst uit de groep.",
    );
  const members = n.objects.filter((o) => o.groupId === g.id);
  if (!members.length) fail("De groep is leeg.");
  if (members.some((o) => isLocked(n, o)))
    fail("Ontgrendel de onderdelen voordat je een assembly opslaat.");
  const boxes = members.map((o) => bounds(n, o)),
    cx =
      (Math.min(...boxes.map((b) => b.min.x)) +
        Math.max(...boxes.map((b) => b.max.x))) /
      2,
    cz =
      (Math.min(...boxes.map((b) => b.min.z)) +
        Math.max(...boxes.map((b) => b.max.z))) /
      2,
    y0 = Math.min(...boxes.map((b) => b.min.y));
  const def: AssemblyDefinition = {
    id: uid(),
    name: title,
    members: members.map((o) => {
      const key = uid();
      o.assemblyKey = key;
      return {
        key,
        definitionId: o.definitionId,
        name: o.name,
        position: {
          x: o.position.x - cx,
          y: o.position.y - y0,
          z: o.position.z - cz,
        },
        rotation: o.rotation,
        tag: o.tag,
        ...(o.material ? { material: o.material } : {}),
      };
    }),
  };
  g.assemblyId = def.id;
  g.name = title;
  n.assemblies = [...(n.assemblies ?? []), def];
  return { project: n, assemblyId: def.id };
}
function memberObject(
  p: Project,
  m: AssemblyMember,
  f: Frame,
  groupId: string,
): Instance {
  const e = expected(m, f);
  return {
    id: uid(),
    definitionId: m.definitionId,
    name: m.name,
    position: e.position,
    rotation: e.rotation,
    tag: m.tag,
    groupId,
    assemblyKey: m.key,
    ...(m.material ? { material: m.material } : {}),
    visible: true,
    locked: false,
  };
}
export function placeAssembly(
  p: Project,
  assemblyId: string,
  at: { x: number; z: number } = { x: 0, z: 0 },
  rotation = 0,
): { project: Project; groupId: string; objectIds: string[] } {
  const n = clone(p),
    def = assemblyOf(n, assemblyId) ?? fail("Assembly bestaat niet.");
  const used = n.groups.filter((g) => g.assemblyId === def.id).length;
  const g: Group = {
    id: uid(),
    name: used ? `${def.name} ${used + 1}` : def.name,
    assemblyId: def.id,
  };
  n.groups.push(g);
  const frame: Frame = {
    origin: { x: at.x, y: 0, z: at.z },
    rotation: wrap(rotation),
  };
  const created = def.members.map((m) => memberObject(n, m, frame, g.id));
  n.objects.push(...created);
  return { project: n, groupId: g.id, objectIds: created.map((o) => o.id) };
}
/** Brings an instance back to the definition: fixes members, restores missing ones, removes extras. */
function rebuild(n: Project, g: Group, def: AssemblyDefinition, frame: Frame) {
  const direct = directMembers(n, g.id),
    keys = new Set(def.members.map((m) => m.key));
  const drop = [
    ...direct.filter((o) => !keys.has(o.assemblyKey!)).map((o) => o.id),
    ...groupObjectIds(n, g.id).filter((id) => !direct.some((o) => o.id === id)),
  ];
  for (const m of def.members) {
    const o = direct.find((v) => v.assemblyKey === m.key);
    if (!o) {
      n.objects.push(memberObject(n, m, frame, g.id));
      continue;
    }
    const e = expected(m, frame);
    o.definitionId = m.definitionId;
    o.position = e.position;
    o.rotation = e.rotation;
    o.tag = m.tag;
    if (m.material) o.material = m.material;
    else delete o.material;
  }
  return drop;
}
const lockedIn = (p: Project, g: Group) =>
  groupObjectIds(p, g.id).some((id) =>
    isLocked(
      p,
      p.objects.find((o) => o.id === id)!,
    ),
  );
function finish(n: Project, drop: string[]) {
  return drop.length ? removeObjects(n, drop) : n;
}
export function resetInstance(p: Project, groupId: string): Project {
  const st = assemblyStatus(p, groupId),
    n = clone(p),
    g = groupOf(n, groupId);
  if (st.state === "in-sync") return n;
  if (lockedIn(n, g))
    fail("Ontgrendel de onderdelen van dit exemplaar voordat je het terugzet.");
  // Without any recognisable member there is no anchor; rebuilding would delete whatever else is in the group.
  if (!st.frame)
    throw Error(
      "Dit exemplaar heeft geen herkenbare onderdelen meer. Haal het uit de groep of verwijder het.",
    );
  return finish(n, rebuild(n, g, st.assembly, st.frame));
}
export interface ApplyResult {
  project: Project;
  updated: string[];
  skipped: { groupId: string; reason: string }[];
}
/**
 * Makes this instance's current state the new definition. Other instances that were in sync follow it;
 * instances with their own deviations or locked members are left alone and reported.
 */
export function applyInstance(p: Project, groupId: string): ApplyResult {
  const st = assemblyStatus(p, groupId),
    n = clone(p),
    g = groupOf(n, groupId),
    def = assemblyOf(n, st.assembly.id)!;
  if (!st.frame)
    fail(
      "Dit exemplaar heeft geen onderdelen meer; zet het eerst terug of verwijder het.",
    );
  const frame = st.frame!;
  if (n.groups.some((c) => c.parentId === g.id))
    fail(
      "Subgroepen binnen een assembly worden niet ondersteund. Haal ze uit de groep.",
    );
  // Decide, before anything changes, which other instances follow the old definition exactly.
  const followers: { g: Group; frame: Frame }[] = [],
    skipped: ApplyResult["skipped"] = [];
  for (const other of assemblyUsers(n, def.id)) {
    if (other.id === g.id) continue;
    const os = assemblyStatus(n, other.id);
    if (os.state !== "in-sync" || !os.frame)
      skipped.push({
        groupId: other.id,
        reason: "wijkt zelf af van de definitie",
      });
    else if (lockedIn(n, other))
      skipped.push({
        groupId: other.id,
        reason: "heeft vergrendelde onderdelen",
      });
    else followers.push({ g: other, frame: os.frame });
  }
  const objects = n.objects.filter((o) => o.groupId === g.id);
  const members: AssemblyMember[] = [];
  const byKey = new Map(def.members.map((m) => [m.key, m]));
  const order = [...objects].sort(
    (a, b) =>
      (def.members.findIndex((m) => m.key === a.assemblyKey) + 1 || 1e6) -
      (def.members.findIndex((m) => m.key === b.assemblyKey) + 1 || 1e6),
  );
  for (const o of order) {
    const key =
      o.assemblyKey && byKey.has(o.assemblyKey) ? o.assemblyKey : uid();
    o.assemblyKey = key;
    const back = turn(
      o.position.x - frame.origin.x,
      o.position.z - frame.origin.z,
      -frame.rotation,
    );
    members.push({
      key,
      definitionId: o.definitionId,
      name: o.name,
      position: { x: back.x, y: o.position.y - frame.origin.y, z: back.z },
      rotation: wrap(o.rotation - frame.rotation),
      tag: o.tag,
      ...(o.material ? { material: o.material } : {}),
    });
  }
  def.members = members;
  const updated = [g.id];
  let drop: string[] = [];
  for (const f of followers) {
    drop = drop.concat(rebuild(n, f.g, def, f.frame));
    updated.push(f.g.id);
  }
  return { project: finish(n, drop), updated, skipped };
}
export function makeAssemblyUnique(p: Project, groupId: string): Project {
  const n = clone(p),
    g = groupOf(n, groupId),
    def =
      assemblyOf(n, g.assemblyId ?? "") ??
      fail("Deze groep is geen assembly-exemplaar.");
  if (assemblyUsers(n, def.id).length < 2 && def.unique) return n;
  const copy: AssemblyDefinition = clone(def);
  copy.id = uid();
  copy.name = `${def.name} · uniek`;
  copy.unique = true;
  n.assemblies = [...(n.assemblies ?? []), copy];
  g.assemblyId = copy.id;
  return n;
}
/** A definition without instances may be removed; one that is in use is refused. */
export function removeAssembly(p: Project, assemblyId: string): Project {
  if (assemblyUsers(p, assemblyId).length)
    fail("Deze assembly wordt nog gebruikt door exemplaren in de scène.");
  const n = clone(p);
  n.assemblies = (n.assemblies ?? []).filter((a) => a.id !== assemblyId);
  return n;
}
