import { bounds, definition, isVisible } from "./model.ts";
import type { Project, Vec3 } from "./model.ts";
/**
 * Hardware-free teleport rules for the read-only VR walkthrough (centimetres).
 * A target is valid only on the floor, inside the room with a wall margin, and
 * clear of any visible object that reaches into body height.
 */
export const BODY_CLEARANCE_CM = 25;
export const BODY_HEIGHT_CM = 180;
export const MAX_TELEPORT_CM = 1000;
export type TeleportReason =
  "ok" | "no-floor" | "too-far" | "outside" | "blocked";
export interface TeleportTarget {
  point: { x: number; z: number };
  valid: boolean;
  reason: TeleportReason;
  blockedBy?: string;
  message: string;
}
/** Distance in plan from (x,z) to an object's oriented footprint; 0 when inside. */
function footprintDistance(p: Project, id: string, x: number, z: number) {
  const o = p.objects.find((v) => v.id === id)!,
    s = definition(p, o).size,
    a = (o.rotation * Math.PI) / 180;
  const dx = x - o.position.x,
    dz = z - o.position.z;
  const lx = dx * Math.cos(a) - dz * Math.sin(a),
    lz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.hypot(
    Math.max(Math.abs(lx) - s.x / 2, 0),
    Math.max(Math.abs(lz) - s.z / 2, 0),
  );
}
export function obstacles(p: Project) {
  return p.objects.filter((o) => {
    if (!isVisible(p, o)) return false;
    const b = bounds(p, o);
    return b.max.y > 5 && b.min.y < BODY_HEIGHT_CM;
  });
}
export function checkFloorPoint(
  p: Project,
  x: number,
  z: number,
  clearance = BODY_CLEARANCE_CM,
): TeleportTarget {
  const point = { x, z },
    r = p.room;
  if (
    Math.abs(x) > r.length / 2 - clearance ||
    Math.abs(z) > r.depth / 2 - clearance
  )
    return {
      point,
      valid: false,
      reason: "outside",
      message: `Buiten de ruimte of dichter dan ${clearance} cm bij een wand.`,
    };
  for (const o of obstacles(p))
    if (footprintDistance(p, o.id, x, z) < clearance)
      return {
        point,
        valid: false,
        reason: "blocked",
        blockedBy: o.id,
        message: `Geblokkeerd door ${o.name}.`,
      };
  return { point, valid: true, reason: "ok", message: "Geldige vloerlocatie." };
}
/** Intersects a controller ray (origin and direction in cm) with the floor plane y = 0. */
export function teleportTarget(
  p: Project,
  origin: Vec3,
  direction: Vec3,
  maxDistance = MAX_TELEPORT_CM,
): TeleportTarget | undefined {
  const len = Math.hypot(direction.x, direction.y, direction.z);
  if (!(len > 0)) return undefined;
  const d = {
    x: direction.x / len,
    y: direction.y / len,
    z: direction.z / len,
  };
  if (d.y >= -1e-6 || origin.y <= 0) return undefined;
  const t = -origin.y / d.y,
    x = origin.x + d.x * t,
    z = origin.z + d.z * t;
  if (t > maxDistance)
    return {
      point: { x, z },
      valid: false,
      reason: "too-far",
      message: `Doel ligt verder dan ${maxDistance} cm.`,
    };
  return checkFloorPoint(p, x, z);
}
/** Rig position (cm, floor level) that puts the headset's floor projection on the target. */
export function rigPositionFor(
  target: { x: number; z: number },
  headOffset: { x: number; z: number },
) {
  return { x: target.x - headOffset.x, y: 0, z: target.z - headOffset.z };
}
export type StickEvent = "none" | "start" | "aim" | "commit";
export const STICK_PUSH = -0.6;
export const STICK_RELEASE = -0.3;
/** Push the thumbstick forward to aim, release to teleport (with hysteresis). */
export function thumbstickStep(
  aiming: boolean,
  y: number,
): { aiming: boolean; event: StickEvent } {
  if (!aiming)
    return y <= STICK_PUSH
      ? { aiming: true, event: "start" }
      : { aiming, event: "none" };
  return y > STICK_RELEASE
    ? { aiming: false, event: "commit" }
    : { aiming: true, event: "aim" };
}
/** Nearest valid floor point to the room centre, used as the VR spawn position. */
export function startPoint(p: Project, step = 25) {
  let best: { x: number; z: number; d: number } | undefined;
  for (let x = -p.room.length / 2; x <= p.room.length / 2; x += step)
    for (let z = -p.room.depth / 2; z <= p.room.depth / 2; z += step) {
      const d = Math.hypot(x, z);
      if ((!best || d < best.d) && checkFloorPoint(p, x, z).valid)
        best = { x, z, d };
    }
  return best && { x: best.x, z: best.z };
}
