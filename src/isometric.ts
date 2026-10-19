import { definition, isVisible } from "./model.ts";
import type { Project } from "./model.ts";
/**
 * Isometric line drawing (all edges, no hidden-line removal). Axes are drawn at 30° with full-length
 * scale along each axis, the usual "isometric drawing" convention; viewed from the +X/+Z corner.
 * Output coordinates are centimetres on the drawing plane (u right, v up).
 */
export interface Point2 {
  u: number;
  v: number;
}
export interface Segment {
  a: Point2;
  b: Point2;
  kind: "room" | "object";
  objectId?: string;
}
const C30 = Math.cos(Math.PI / 6),
  S30 = Math.sin(Math.PI / 6);
export const isoPoint = (x: number, y: number, z: number): Point2 => ({
  u: (x - z) * C30,
  v: y - (x + z) * S30,
});
type P3 = [number, number, number];
function boxEdges(corners: P3[]): [P3, P3][] {
  // corners: 0..3 bottom ring, 4..7 top ring in the same order.
  const e: [number, number][] = [];
  for (let i = 0; i < 4; i++)
    e.push([i, (i + 1) % 4], [4 + i, 4 + ((i + 1) % 4)], [i, 4 + i]);
  return e.map(([i, j]) => [corners[i], corners[j]]);
}
/** Corners of an oriented box: bottom-centre position, rotation about Y in degrees (same convention as the editor). */
export function orientedBox(
  position: { x: number; y: number; z: number },
  size: { x: number; y: number; z: number },
  rotationDegrees: number,
): P3[] {
  const a = (rotationDegrees * Math.PI) / 180;
  const ring = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([sx, sz]) => {
    const dx = (sx * size.x) / 2,
      dz = (sz * size.z) / 2;
    return [
      position.x + dx * Math.cos(a) + dz * Math.sin(a),
      position.z - dx * Math.sin(a) + dz * Math.cos(a),
    ];
  });
  return [
    ...ring.map(([x, z]): P3 => [x, position.y, z]),
    ...ring.map(([x, z]): P3 => [x, position.y + size.y, z]),
  ];
}
export function isometricSegments(p: Project): {
  segments: Segment[];
  min: Point2;
  max: Point2;
} {
  const segments: Segment[] = [];
  const room = orientedBox(
    { x: 0, y: 0, z: 0 },
    { x: p.room.length, y: p.room.height, z: p.room.depth },
    0,
  );
  for (const [a, b] of boxEdges(room))
    segments.push({ a: isoPoint(...a), b: isoPoint(...b), kind: "room" });
  for (const o of p.objects) {
    if (!isVisible(p, o)) continue;
    const d = definition(p, o);
    for (const [a, b] of boxEdges(orientedBox(o.position, d.size, o.rotation)))
      segments.push({
        a: isoPoint(...a),
        b: isoPoint(...b),
        kind: "object",
        objectId: o.id,
      });
  }
  const us = segments.flatMap((s) => [s.a.u, s.b.u]),
    vs = segments.flatMap((s) => [s.a.v, s.b.v]);
  return {
    segments,
    min: { u: Math.min(...us), v: Math.min(...vs) },
    max: { u: Math.max(...us), v: Math.max(...vs) },
  };
}
export const STANDARD_SCALES = [
  10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000,
];
/** Smallest standard 1:n scale whose drawing fits the given paper area in millimetres. */
export function fitScale(
  widthCm: number,
  heightCm: number,
  areaMm: { w: number; h: number },
) {
  const required = Math.max(
    (widthCm * 10) / areaMm.w,
    (heightCm * 10) / areaMm.h,
  );
  return (
    STANDARD_SCALES.find((s) => s >= required) ??
    Math.ceil(required / 1000) * 1000
  );
}
