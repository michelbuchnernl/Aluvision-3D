import { zipSync, unzipSync, strToU8, strFromU8 } from "fflate";
import { parseProject, serialize } from "./model.ts";
import type { Project } from "./model.ts";
/**
 * Portable project package (.zip): project JSON, GLB, XLSX BOM and a manifest with SHA-256 checksums.
 * Re-import is strict: every file must be listed, present and unchanged; nothing broken is accepted silently.
 */
export const PACKAGE_FORMAT = "boormester-package";
export const PACKAGE_VERSION = 1;
const ALLOWED = [
  "manifest.json",
  "project.json",
  "scene.glb",
  "bom.xlsx",
  "README.txt",
];
/** Imported models travel content-addressed: assets/<sha256>.glb. */
const ASSET = /^assets\/([0-9a-f]{64})\.glb$/;
const allowed = (name: string) => ALLOWED.includes(name) || ASSET.test(name);
const MAX_UNPACKED = 80_000_000;
export interface PackageFile {
  path: string;
  bytes: number;
  sha256: string;
}
export interface PackageManifest {
  format: typeof PACKAGE_FORMAT;
  version: number;
  createdAt: string;
  projectId: string;
  projectName: string;
  units: "cm";
  glbUnits: "m";
  counts: { objects: number; definitions: number; canvases: number };
  files: PackageFile[];
  /** Media files are not embedded; these must be attached again after import. */
  mediaToReattach: {
    id: string;
    name: string;
    kind: string;
    bytes?: number;
    sha256?: string;
  }[];
  /** SHA-256 of imported models whose bytes were not available when the package was made. */
  assetsMissing?: string[];
  /** Models used from the local AluVision library (not embedded); the library must provide them again. */
  libraryAssets?: { file: string; sha256: string; name: string }[];
  notes: string[];
}
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const copy = new Uint8Array(bytes);
  const d = await crypto.subtle.digest("SHA-256", copy);
  return [...new Uint8Array(d)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function buildPackage(
  p: Project,
  parts: {
    glb: Uint8Array;
    xlsx: Uint8Array;
    /** Bytes of imported models by SHA-256; missing ones are reported in the manifest. */
    assets?: Map<string, Uint8Array>;
  },
  createdAt = new Date().toISOString(),
): Promise<Uint8Array> {
  const project = strToU8(serialize(p));
  const readme = strToU8(
    [
      "Boormester Immersive Studio — projectpakket",
      "",
      "project.json  projectgegevens in centimeters (de bron)",
      "scene.glb     3D-model in meters, afgeleid van project.json",
      "bom.xlsx      onderdelenlijst",
      "manifest.json bestandslijst met SHA-256-controlesommen",
      "",
      "Mediabestanden zitten niet in dit pakket; zie mediaToReattach in manifest.json.",
      "Modellen zijn synthetische demo-onderdelen of geïmporteerd (niet geverifieerd); er zijn geen fabrikantgegevens of constructieve claims.",
      "",
    ].join("\n"),
  );
  const files: Record<string, Uint8Array> = {
    "project.json": project,
    "scene.glb": parts.glb,
    "bom.xlsx": parts.xlsx,
    "README.txt": readme,
  };
  // Library-backed models stay in the local AluVision library: they are listed (file + checksum), not embedded.
  const libraryAssets = [
    ...new Map(
      p.definitions.flatMap((d) =>
        d.asset?.libraryFile
          ? [
              [
                d.asset.sha256,
                {
                  file: d.asset.libraryFile,
                  sha256: d.asset.sha256,
                  name: d.name,
                },
              ] as const,
            ]
          : [],
      ),
    ).values(),
  ];
  const importedShas = [
    ...new Set(
      p.definitions.flatMap((d) =>
        d.asset && !d.asset.libraryFile ? [d.asset.sha256] : [],
      ),
    ),
  ];
  const assetsMissing: string[] = [];
  for (const sha of importedShas) {
    const data = parts.assets?.get(sha);
    if (data) files[`assets/${sha}.glb`] = data;
    else assetsMissing.push(sha);
  }
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    createdAt,
    projectId: p.id,
    projectName: p.name,
    units: "cm",
    glbUnits: "m",
    counts: {
      objects: p.objects.length,
      definitions: p.definitions.length,
      canvases: p.canvases?.length ?? 0,
    },
    files: await Promise.all(
      Object.entries(files).map(async ([path, bytes]) => ({
        path,
        bytes: bytes.length,
        sha256: await sha256Hex(bytes),
      })),
    ),
    mediaToReattach: (p.media ?? [])
      .filter((m) => m.kind !== "test-pattern")
      .map((m) => ({
        id: m.id,
        name: m.name,
        kind: m.kind,
        bytes: m.bytes,
        sha256: m.sha256,
      })),
    assetsMissing,
    libraryAssets,
    notes: [
      ...(p.definitions.some((d) => d.source === "synthetic")
        ? ["Bevat synthetische demo-onderdelen"]
        : []),
      ...(importedShas.length || libraryAssets.length
        ? [
            "Bevat geïmporteerde modellen: niet geverifieerd, herkomst in project.json",
          ]
        : []),
      "Geen constructieve certificering",
    ],
  };
  return zipSync(
    { "manifest.json": strToU8(JSON.stringify(manifest, null, 2)), ...files },
    { level: 6 },
  );
}
export interface ReadPackage {
  project: Project;
  manifest: PackageManifest;
  warnings: string[];
  /** Imported models by SHA-256, verified against both the manifest and their file name. */
  assets: Map<string, Uint8Array>;
}
export async function readPackage(bytes: Uint8Array): Promise<ReadPackage> {
  const bad = (msg: string): never => {
    throw Error("Ongeldig projectpakket: " + msg);
  };
  let total = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter: (f) => {
        total += f.originalSize;
        if (total > MAX_UNPACKED) throw Error("te groot na uitpakken");
        return true;
      },
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "geen geldig zipbestand.");
  }
  for (const name of Object.keys(entries))
    if (!allowed(name))
      bad(`onverwacht bestand ${JSON.stringify(name.slice(0, 80))}.`);
  if (!entries["manifest.json"]) bad("manifest.json ontbreekt.");
  let manifest: PackageManifest;
  try {
    manifest = JSON.parse(strFromU8(entries["manifest.json"]));
  } catch {
    return bad("manifest.json is geen geldige JSON.");
  }
  if (
    manifest?.format !== PACKAGE_FORMAT ||
    manifest.version !== PACKAGE_VERSION
  )
    bad("onbekend formaat of versie.");
  if (!Array.isArray(manifest.files)) bad("bestandslijst ontbreekt.");
  const listed = new Set<string>();
  for (const f of manifest.files) {
    if (
      !f ||
      !allowed(f.path) ||
      f.path === "manifest.json" ||
      listed.has(f.path)
    )
      bad("ongeldige bestandslijst.");
    listed.add(f.path);
    const data = entries[f.path];
    if (!data) bad(`${f.path} ontbreekt.`);
    if (data.length !== f.bytes)
      bad(`${f.path} heeft een andere grootte dan het manifest.`);
    if ((await sha256Hex(data)) !== f.sha256)
      bad(
        `controlesom van ${f.path} klopt niet; het bestand is gewijzigd of beschadigd.`,
      );
  }
  for (const name of Object.keys(entries))
    if (name !== "manifest.json" && !listed.has(name))
      bad(`${name} staat niet in het manifest.`);
  for (const need of ["project.json", "scene.glb"])
    if (!listed.has(need)) bad(`${need} is verplicht.`);
  const project = parseProject(strFromU8(entries["project.json"]));
  if (project.id !== manifest.projectId)
    bad("project-id wijkt af van het manifest.");
  if (
    manifest.counts?.objects !== project.objects.length ||
    manifest.counts?.definitions !== project.definitions.length ||
    manifest.counts?.canvases !== (project.canvases?.length ?? 0)
  )
    bad("aantallen in het manifest kloppen niet met het project.");
  const glb = entries["scene.glb"];
  if (strFromU8(glb.subarray(0, 4)) !== "glTF")
    bad("scene.glb is geen binair GLB.");
  const assets = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    const m = ASSET.exec(name);
    if (!m) continue;
    // Content-addressed: the file name must be the hash of the bytes (the manifest check already bound the bytes).
    if ((await sha256Hex(data)) !== m[1])
      bad(`${name} past niet bij zijn eigen controlesom.`);
    if (strFromU8(data.subarray(0, 4)) !== "glTF")
      bad(`${name} is geen binair GLB.`);
    assets.set(m[1], data);
  }
  const warnings = manifest.mediaToReattach?.length
    ? [
        `${manifest.mediaToReattach.length} mediabestand(en) moeten opnieuw worden gekoppeld: ${manifest.mediaToReattach.map((m) => m.name).join(", ")}.`,
      ]
    : [];
  const lacking = [
    ...new Set(
      project.definitions.flatMap((d) =>
        d.asset && !d.asset.libraryFile ? [d.asset.sha256] : [],
      ),
    ),
  ].filter((sha) => !assets.has(sha));
  const lib = new Set(
    project.definitions.flatMap((d) =>
      d.asset?.libraryFile ? [d.asset.sha256] : [],
    ),
  );
  if (lib.size)
    warnings.push(
      `${lib.size} model(len) komen uit de lokale AluVision-bibliotheek en worden bij het openen van de server geladen en op controlesom gecontroleerd.`,
    );
  if (lacking.length)
    warnings.push(
      `${lacking.length} geïmporteerd(e) model(len) zit(ten) niet in het pakket en worden als oranje kader getoond tot je ze opnieuw importeert.`,
    );
  return { project, manifest, warnings, assets };
}
