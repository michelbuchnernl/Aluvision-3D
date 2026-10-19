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
  /** Browsing class (see scripts/library/classify.py) and optional sub-group within it. */
  class: string;
  group?: string;
  /** True when a rendered preview PNG exists for this model. */
  preview: boolean;
}
export interface LibraryClass {
  id: string;
  label: string;
  description: string;
  count: number;
}
export interface LibraryListing {
  available: boolean;
  hint?: string;
  source?: string;
  summary?: { ready: number; refused: number; missing: number };
  classes: LibraryClass[];
  /** True when library/gallery.html exists (served at /api/library/gallery). */
  gallery?: boolean;
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
    class: "",
    preview: false,
  };
}
const CLASS_ID = /^[a-z][a-z0-9-]{0,30}$/;
interface Classes {
  list: { id: string; label: string; description: string }[];
  byFile: Map<string, { class: string; group?: string }>;
}
/** Optional classes.json (scripts/library/classify.py). Unknown or malformed entries fall back to "other". */
function readClasses(dir: string): Classes {
  const out: Classes = { list: [], byFile: new Map() };
  const path = join(dir, "classes.json");
  if (!existsSync(path)) return out;
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    for (const c of Array.isArray(raw.classes) ? raw.classes : [])
      if (CLASS_ID.test(String(c?.id)) && typeof c.label === "string")
        out.list.push({
          id: c.id,
          label: text(c.label, 80),
          description: text(c.description, 200),
        });
    const known = new Set(out.list.map((c) => c.id));
    for (const [file, v] of Object.entries<any>(raw.models ?? {}))
      if (libraryFileName(file) && known.has(v?.class))
        out.byFile.set(file, {
          class: v.class,
          ...(typeof v.group === "string" ? { group: text(v.group, 60) } : {}),
        });
  } catch {
    // Unreadable class file: the library still works, ungrouped.
  }
  return out;
}
const stemOf = (file: string) => file.replace(/\.glb$/, "");
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
        classes: [],
        models: [],
      };
    const classesPath = join(this.dir, "classes.json");
    const stamp =
      statSync(path).mtimeMs +
      (existsSync(classesPath) ? statSync(classesPath).mtimeMs : 0);
    let base = this.cache?.stamp === stamp ? this.cache.listing : undefined;
    if (!base) {
      try {
        const raw = JSON.parse(readFileSync(path, "utf8")),
          classes = readClasses(this.dir);
        const fallback = classes.list.some((c) => c.id === "other")
          ? "other"
          : "";
        const models = (Array.isArray(raw.models) ? raw.models : [])
          .map(model)
          .filter((m: LibraryModel | undefined): m is LibraryModel => !!m)
          .map((m: LibraryModel) => {
            const c = classes.byFile.get(m.file);
            return {
              ...m,
              class: c?.class ?? fallback,
              ...(c?.group ? { group: c.group } : {}),
            };
          });
        const counted = classes.list.map((c) => ({
          ...c,
          count: models.filter(
            (m: LibraryModel) => m.class === c.id && m.status === "ready",
          ).length,
        }));
        base = {
          available: true,
          source: text(raw.source, 200),
          summary: {
            ready: models.filter((m: LibraryModel) => m.status === "ready")
              .length,
            refused: models.filter((m: LibraryModel) => m.status === "refused")
              .length,
            missing: num(raw.summary?.missing) ?? 0,
          },
          classes: counted.filter((c) => c.count > 0),
          models,
        };
      } catch {
        base = {
          available: false,
          hint: "manifest.json is niet leesbaar.",
          classes: [],
          models: [],
        };
      }
      this.cache = { stamp, listing: base };
    }
    // Previews appear while they are being rendered, so existence is checked on every call (cheap).
    return {
      ...base,
      gallery: existsSync(join(this.dir, "gallery.html")),
      models: base.models.map((m) => ({
        ...m,
        preview: existsSync(
          join(this.dir, "previews", stemOf(m.file) + ".png"),
        ),
      })),
    };
  }
  /** The static gallery page written by scripts/library/build_gallery.py, if present. */
  galleryPath(): string | undefined {
    const path = join(this.dir, "gallery.html");
    return existsSync(path) ? path : undefined;
  }
  /** Path of a listed model's preview PNG, if it exists. */
  previewPathFor(file: string): string | undefined {
    const name = file.endsWith(".png") ? file.slice(0, -4) + ".glb" : file;
    if (!libraryFileName(name)) return undefined;
    if (!this.listing().models.some((v) => v.file === name)) return undefined;
    const path = join(this.dir, "previews", stemOf(name) + ".png");
    return existsSync(path) ? path : undefined;
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
