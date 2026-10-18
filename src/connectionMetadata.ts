import type { Definition, Instance, Vec3 } from "./model.ts";
export interface ConnectionSocket {
  id: string;
  name: string;
  /** Parametric box coordinates: X/Z -0.5..0.5, Y 0..1. */
  position: Vec3;
  normal: Vec3;
  profile: string;
}
export interface SocketEndpoint {
  objectId: string;
  socketId: string;
}
export interface SceneConnection {
  id: string;
  from: SocketEndpoint;
  to: SocketEndpoint;
}
/** Virtual envelope faces, not manufacturer sockets or certified connections. */
export const DEMO_SOCKETS: ConnectionSocket[] = [
  {
    id: "left",
    name: "Links",
    position: { x: -0.5, y: 0.5, z: 0 },
    normal: { x: -1, y: 0, z: 0 },
    profile: "demo-envelope",
  },
  {
    id: "right",
    name: "Rechts",
    position: { x: 0.5, y: 0.5, z: 0 },
    normal: { x: 1, y: 0, z: 0 },
    profile: "demo-envelope",
  },
  {
    id: "front",
    name: "Voor",
    position: { x: 0, y: 0.5, z: 0.5 },
    normal: { x: 0, y: 0, z: 1 },
    profile: "demo-envelope",
  },
  {
    id: "back",
    name: "Achter",
    position: { x: 0, y: 0.5, z: -0.5 },
    normal: { x: 0, y: 0, z: -1 },
    profile: "demo-envelope",
  },
  {
    id: "top",
    name: "Boven",
    position: { x: 0, y: 1, z: 0 },
    normal: { x: 0, y: 1, z: 0 },
    profile: "demo-envelope",
  },
  {
    id: "bottom",
    name: "Onder",
    position: { x: 0, y: 0, z: 0 },
    normal: { x: 0, y: -1, z: 0 },
    profile: "demo-envelope",
  },
];
export const socketsFor = (d: Definition): ConnectionSocket[] =>
  d.sockets ?? DEMO_SOCKETS;
export function validSocket(s: any): s is ConnectionSocket {
  const finite = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const text = (v: unknown) =>
    typeof v === "string" && v.length > 0 && v.length <= 100;
  if (
    !s ||
    !text(s.id) ||
    !text(s.name) ||
    !text(s.profile) ||
    !s.position ||
    !s.normal
  )
    return false;
  if (
    !["x", "y", "z"].every((k) => finite(s.position[k]) && finite(s.normal[k]))
  )
    return false;
  if (
    Math.abs(s.position.x) > 0.5 ||
    Math.abs(s.position.z) > 0.5 ||
    s.position.y < 0 ||
    s.position.y > 1
  )
    return false;
  // Cardinal normals keep this editor's yaw-only alignment unambiguous.
  if (
    Object.values(s.normal).filter((v) => v !== 0).length !== 1 ||
    !Object.values(s.normal).some((v) => v === 1 || v === -1)
  )
    return false;
  const axis = (["x", "y", "z"] as const).find((k) => s.normal[k] !== 0)!;
  const face = axis === "y" ? (s.normal.y === 1 ? 1 : 0) : s.normal[axis] * 0.5;
  return s.position[axis] === face;
}
export function rotateY(p: Vec3, degrees: number): Vec3 {
  const a = (degrees * Math.PI) / 180;
  return {
    x: p.x * Math.cos(a) + p.z * Math.sin(a),
    y: p.y,
    z: -p.x * Math.sin(a) + p.z * Math.cos(a),
  };
}
export function worldSocket(d: Definition, o: Instance, socketId: string) {
  const socket = socketsFor(d).find((s) => s.id === socketId);
  if (!socket) throw Error("Uitlijnpunt ontbreekt.");
  const local = {
    x: socket.position.x * d.size.x,
    y: socket.position.y * d.size.y,
    z: socket.position.z * d.size.z,
  };
  const offset = rotateY(local, o.rotation);
  return {
    socket,
    position: {
      x: o.position.x + offset.x,
      y: o.position.y + offset.y,
      z: o.position.z + offset.z,
    },
    normal: rotateY(socket.normal, o.rotation),
  };
}
export const distance = (a: Vec3, b: Vec3) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
