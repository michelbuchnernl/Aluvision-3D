import {
  clone,
  definition,
  isLocked,
  parseProject,
  uid,
  validate,
} from "./model.ts";
import type { Project, Vec3 } from "./model.ts";
import { distance, dot, worldSocket } from "./connectionMetadata.ts";
import type { SocketEndpoint } from "./connectionMetadata.ts";
import { transformAroundPivot } from "./interaction.ts";
export interface AlignmentRequest {
  ids: string[];
  from: SocketEndpoint;
  to: SocketEndpoint;
  rotate: boolean;
  freeHeight: boolean;
  remember: boolean;
}
export function alignConnections(p: Project, request: AlignmentRequest) {
  const { ids, from, to } = request;
  const members = p.objects.filter((o) => ids.includes(o.id));
  if (
    !ids.length ||
    new Set(ids).size !== ids.length ||
    members.length !== ids.length ||
    !ids.includes(from.objectId) ||
    ids.includes(to.objectId)
  )
    throw Error(
      "Kies een uitlijnpunt in de selectie en een doel buiten de selectie.",
    );
  if (members.some((o) => isLocked(p, o)))
    throw Error("De selectie bevat vergrendelde onderdelen.");
  const source = p.objects.find((o) => o.id === from.objectId)!,
    target = p.objects.find((o) => o.id === to.objectId);
  if (!target) throw Error("Doelonderdeel ontbreekt.");
  const a = worldSocket(definition(p, source), source, from.socketId),
    b = worldSocket(definition(p, target), target, to.socketId);
  if (a.socket.profile !== b.socket.profile)
    throw Error("Uitlijnprofielen komen niet overeen.");
  let yaw = source.rotation;
  if (request.rotate) {
    if (Math.abs(a.normal.y) !== Math.abs(b.normal.y))
      throw Error(
        "Deze vlakken vragen kantelen; alleen rotatie om Y is ondersteund.",
      );
    if (a.normal.y === 0)
      yaw =
        ((Math.atan2(-b.normal.x, -b.normal.z) -
          Math.atan2(a.socket.normal.x, a.socket.normal.z)) *
          180) /
        Math.PI;
  }
  const rotatedSource = { ...source, rotation: yaw };
  const rotated = worldSocket(
    definition(p, source),
    rotatedSource,
    from.socketId,
  );
  if (dot(rotated.normal, b.normal) > -0.999999)
    throw Error(
      "Uitlijnvlakken moeten tegengesteld gericht zijn. Schakel rotatie uitlijnen in of kies andere vlakken.",
    );
  const delta = {
    x: b.position.x - rotated.position.x,
    y: b.position.y - rotated.position.y,
    z: b.position.z - rotated.position.z,
  };
  if (!request.freeHeight && Math.abs(delta.y) > 0.001)
    throw Error(
      "Deze uitlijning wijzigt de hoogte. Schakel vrije hoogte expliciet in.",
    );
  const next = clone(p);
  for (const o of next.objects.filter((o) => ids.includes(o.id))) {
    const transformed = transformAroundPivot(
      o.position,
      o.rotation,
      source.position,
      delta,
      yaw - source.rotation,
      request.freeHeight,
    );
    o.position = transformed.position;
    o.rotation = transformed.rotation;
  }
  if (request.remember) {
    const key = (e: SocketEndpoint) => JSON.stringify([e.objectId, e.socketId]);
    const fromKey = key(from),
      toKey = key(to);
    const same = (next.connections ?? []).find(
      (c) =>
        (key(c.from) === fromKey && key(c.to) === toKey) ||
        (key(c.from) === toKey && key(c.to) === fromKey),
    );
    if (!same) {
      if (
        (next.connections ?? []).some((c) =>
          [key(c.from), key(c.to)].some((k) => k === fromKey || k === toKey),
        )
      )
        throw Error(
          "Een uitlijnpunt is al bezet. Verwijder eerst de bestaande verbinding.",
        );
      (next.connections ??= []).push({
        id: uid(),
        from: clone(from),
        to: clone(to),
      });
    }
  }
  const project = parseProject(JSON.stringify(next)),
    issues = validate(project);
  return {
    project,
    issues,
    canApply: !issues.some((i) => i.severity === "error"),
    request: clone(request),
    base: JSON.stringify(p),
    translation: delta,
    rotation: yaw - source.rotation,
  };
}
export type AlignmentPreview = ReturnType<typeof alignConnections>;
export function removeConnection(p: Project, id: string) {
  const c = p.connections?.find((c) => c.id === id);
  if (!c) throw Error("Verbinding ontbreekt.");
  if (
    p.objects.some(
      (o) => [c.from.objectId, c.to.objectId].includes(o.id) && isLocked(p, o),
    )
  )
    throw Error("Een verbonden onderdeel is vergrendeld.");
  const next = clone(p);
  next.connections = next.connections?.filter((c) => c.id !== id);
  return next;
}
export function measurement(a: Vec3, b: Vec3) {
  if (
    ![a, b].every(
      (p) =>
        p &&
        ["x", "y", "z"].every(
          (k) =>
            typeof p[k as keyof Vec3] === "number" &&
            Number.isFinite(p[k as keyof Vec3]) &&
            Math.abs(p[k as keyof Vec3]) <= 1e7,
        ),
    )
  )
    throw Error("Ongeldige meetpunten.");
  return {
    length: distance(a, b),
    delta: { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
    horizontal: Math.hypot(b.x - a.x, b.z - a.z),
  };
}

/** Recompute from authoritative current data so a preview cannot overwrite later edits. */
export function applyAlignmentPreview(
  p: Project,
  preview: AlignmentPreview,
): Project {
  if (JSON.stringify(p) !== preview.base)
    throw Error("Het ontwerp is gewijzigd. Maak een nieuwe uitlijnpreview.");
  const checked = alignConnections(p, preview.request);
  if (!checked.canApply)
    throw Error("De uitlijning overschrijdt de ruimte. Pas het voorstel aan.");
  return checked.project;
}
