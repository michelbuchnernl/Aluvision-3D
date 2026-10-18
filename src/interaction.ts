import type { Vec3 } from "./model.ts";
export interface ScreenBounds {
  id: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  clipped?: boolean;
}
/** Left→right is containment; right→left is crossing. Coordinates are viewport pixels. */
export function rectangleSelection(
  boxes: ScreenBounds[],
  from: { x: number; y: number },
  to: { x: number; y: number },
): string[] {
  const l = Math.min(from.x, to.x),
    r = Math.max(from.x, to.x),
    t = Math.min(from.y, to.y),
    b = Math.max(from.y, to.y),
    contains = to.x >= from.x;
  return boxes
    .filter(
      (o) =>
        !o.clipped &&
        (contains
          ? o.left >= l && o.right <= r && o.top >= t && o.bottom <= b
          : o.left <= r && o.right >= l && o.top <= b && o.bottom >= t),
    )
    .map((o) => o.id);
}
export function transformAroundPivot(
  position: Vec3,
  rotationDegrees: number,
  pivot: Vec3,
  delta: Vec3,
  angleDegrees: number,
  freeHeight: boolean,
): { position: Vec3; rotation: number } {
  const a = (angleDegrees * Math.PI) / 180,
    dx = position.x - pivot.x,
    dz = position.z - pivot.z;
  return {
    position: {
      x: pivot.x + dx * Math.cos(a) + dz * Math.sin(a) + delta.x,
      y: freeHeight ? position.y + delta.y : position.y,
      z: pivot.z - dx * Math.sin(a) + dz * Math.cos(a) + delta.z,
    },
    rotation: rotationDegrees + angleDegrees,
  };
}
