import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
/**
 * Read-only access to a local GLB library described by manifest.json (built by scripts/library/build_manifest.py,
 * which applies the same size/geometry rules as the studio's GLB importer). The manifest and the files are treated
 * as untrusted data: every field is type- and pattern-checked, and only files listed as "ready" are ever served.
 * Nothing here claims that an entry is a verified manufacturer part.
 */
export interface LibraryModel {
  id: string;
  name: string;
  /** File name inside the library's glb/ folder. */
  file: string;
  bytes: number;
  sha256: string;
  triangles: number;
  sizeCm: { x: number; y: number; z: number };
  status: "ready" | "refused";
  reason?: string;
  notes: string[];
  description: string;
  domain?: string;
  provenance: string;
  url?: string;
}
export interface LibraryListing {
  available: boolean;
  hint?: string;
  source?: string;
  summary?: { ready: number; refused: number; missing: number };
  models: LibraryModel[];
}
const FILE = /^[A-Za-z0-9][\w.+-]{0,160}\.glb$/;
export const libraryFileName = (name: string) =>
  FILE.test(name) && !name.includes("..");
const text = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";
const num = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) ? v : undefined;
function model(raw: any): LibraryModel | undefined {
  if (
    !raw ||
    (raw.status !== "ready" && raw.status !== "refused") ||
    typeof raw.file !== "string"
  )
    return undefined;
  const file = raw.file.replace(/^glb\//, "");
  const bytes = num(raw.bytes),
    ready = raw.status === "ready",
    s = raw.sizeCm;
  // Refused entries (flat or empty geometry) may have no usable size; ready entries need everything.
  const tri = num(raw.triangles) ?? (ready ? undefined : 0);
  const sizeOk = [s?.x, s?.y, s?.z].every((n) => num(n) !== undefined && n > 0);
  if (
    !libraryFileName(file) ||
    bytes === undefined ||
    bytes <= 0 ||
    !/^[0-9a-f]{64}$/.test(String(raw.sha256)) ||
    tri === undefined ||
    (ready && !sizeOk)
  )
    return undefined;
  const url =
    typeof raw.warehouse?.url === "string" &&
    raw.warehouse.url.startsWith("https://3dwarehouse.sketchup.com/")
      ? raw.warehouse.url
      : undefined;
  return {
    id: text(raw.warehouseId, 64) || file,
    name: text(raw.name, 120) || file,
    file,
    bytes,
    sha256: raw.sha256,
    triangles: tri,
    sizeCm: sizeOk ? { x: s.x, y: s.y, z: s.z } : { x: 0, y: 0, z: 0 },
    status: raw.status,
    ...(raw.status === "refused" ? { reason: text(raw.reason, 300) } : {}),
    notes: Array.isArray(raw.notes)
      ? raw.notes
          .map((n: unknown) => text(n, 300))
          .filter(Boolean)
          .slice(0, 5)
      : [],
    description: text(raw.warehouse?.description, 1000),
    ...(raw.warehouse?.domain
      ? { domain: text(raw.warehouse.domain, 60) }
      : {}),
    provenance: text(raw.provenance, 500),
    ...(url ? { url } : {}),
  };
}
export class Library {
  readonly dir: string;
  private cache?: { stamp: number; listing: LibraryListing };
  constructor(dir: string) {
    this.dir = resolve(dir);
  }
  listing(): LibraryListing {
    const path = join(this.dir, "manifest.json");
    if (!existsSync(path))
      return {
        available: false,
        hint: "Geen manifest.json gevonden. Voer 'python3 scripts/library/build_manifest.py' uit.",
        models: [],
      };
    const stamp = statSync(path).mtimeMs;
    if (this.cache?.stamp === stamp) return this.cache.listing;
    let listing: LibraryListing;
    try {
      const raw = JSON.parse(readFileSync(path, "utf8"));
      const models = (Array.isArray(raw.models) ? raw.models : [])
        .map(model)
        .filter((m: LibraryModel | undefined): m is LibraryModel => !!m);
      listing = {
        available: true,
        source: text(raw.source, 200),
        summary: {
          ready: models.filter((m: LibraryModel) => m.status === "ready")
            .length,
          refused: models.filter((m: LibraryModel) => m.status === "refused")
            .length,
          missing: num(raw.summary?.missing) ?? 0,
        },
        models,
      };
    } catch {
      listing = {
        available: false,
        hint: "manifest.json is niet leesbaar.",
        models: [],
      };
    }
    this.cache = { stamp, listing };
    return listing;
  }
  /** Path of a ready model's file; the file must still have the size the manifest recorded. */
  pathFor(file: string): { path: string; model: LibraryModel } | undefined {
    if (!libraryFileName(file)) return undefined;
    const m = this.listing().models.find(
      (v) => v.file === file && v.status === "ready",
    );
    if (!m) return undefined;
    const path = join(this.dir, "glb", file);
    try {
      if (statSync(path).size !== m.bytes) return undefined;
    } catch {
      return undefined;
    }
    return { path, model: m };
  }
}
