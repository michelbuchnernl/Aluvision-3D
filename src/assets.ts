import * as THREE from "three";
import { inspectGlb } from "./assetImport.ts";
import type { GlbInspection } from "./assetImport.ts";
/**
 * Browser/session registry of imported GLB models, keyed by SHA-256 of the file. Projects store only the
 * metadata; bytes are persisted in IndexedDB (best effort) and travel inside project packages.
 */
const DB = "boormester-assets",
  STORE = "glb";
function openDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(undefined);
  });
}
async function dbPut(sha: string, bytes: ArrayBuffer) {
  const db = await openDb();
  if (!db) return false;
  return new Promise<boolean>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(bytes, sha);
    tx.oncomplete = () => resolve(true);
    tx.onerror = tx.onabort = () => resolve(false);
  });
}
async function dbGet(sha: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(sha);
    req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
    req.onerror = () => resolve(undefined);
  });
}
export async function sha256OfBytes(
  bytes: ArrayBuffer | Uint8Array,
): Promise<string> {
  const view =
    bytes instanceof Uint8Array
      ? new Uint8Array(bytes)
      : new Uint8Array(bytes.slice(0));
  const d = await crypto.subtle.digest("SHA-256", view);
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
/** Marks texture objects so the viewport's per-rebuild disposal leaves shared asset textures alone. */
function shareTextures(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material])
      for (const v of Object.values(mat as any))
        if ((v as THREE.Texture)?.isTexture)
          (v as THREE.Texture).userData.shared = true;
  });
}
export class AssetRegistry {
  private bytes = new Map<string, ArrayBuffer>();
  private scenes = new Map<string, THREE.Object3D>();
  private inflight = new Map<string, Promise<void>>();
  private listeners = new Set<() => void>();
  version = 0;
  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private changed() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  has(sha: string) {
    return this.scenes.has(sha);
  }
  get(sha: string) {
    return this.scenes.get(sha);
  }
  bytesFor(sha: string) {
    return this.bytes.get(sha);
  }
  /** Parses and registers a model. The caller has already verified that `sha` matches the bytes. */
  async add(
    sha: string,
    bytes: ArrayBuffer,
    persist = true,
  ): Promise<GlbInspection> {
    const inspection = await inspectGlb(bytes);
    shareTextures(inspection.scene);
    this.bytes.set(sha, bytes.slice(0));
    this.scenes.set(sha, inspection.scene);
    if (persist) void dbPut(sha, bytes);
    this.changed();
    return inspection;
  }
  /** Loads missing models from IndexedDB; unknown ones stay missing (the viewport shows a placeholder). */
  async ensure(shas: string[]) {
    await Promise.all(
      shas
        .filter((s) => !this.scenes.has(s))
        .map(
          (sha) =>
            this.inflight.get(sha) ??
            (() => {
              const task = (async () => {
                const bytes = await dbGet(sha);
                if (!bytes) return;
                if ((await sha256OfBytes(bytes)) !== sha) return; // corrupted store entry: refuse it
                await this.add(sha, bytes, false).catch(() => {});
              })().finally(() => this.inflight.delete(sha));
              this.inflight.set(sha, task);
              return task;
            })(),
        ),
    );
  }
  clear() {
    this.bytes.clear();
    this.scenes.clear();
    this.changed();
  }
}
export const assetRegistry = new AssetRegistry();
