import { uid } from "./model.ts";
import type { Definition, Project } from "./model.ts";
import { importedDefinition } from "./assetImport.ts";
import { assetRegistry, sha256OfBytes } from "./assets.ts";
import type { StudioClient } from "./serverClient.ts";
/** One entry of the server's library listing (see server/library.ts). */
export interface LibraryModel {
  id: string;
  name: string;
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
  class: string;
  group?: string;
  preview: boolean;
}
/**
 * Returns the project definition for a library model, downloading and verifying it when the project has none yet.
 * The bytes must match the checksum in the manifest; a mismatch refuses the model instead of altering the design.
 */
export async function loadLibraryDefinition(
  client: StudioClient,
  project: Project,
  m: LibraryModel,
): Promise<{ def: Definition; isNew: boolean; sizeOff: boolean }> {
  const existing = project.definitions.find(
    (d) => d.asset?.sha256 === m.sha256,
  );
  if (existing) return { def: existing, isNew: false, sizeOff: false };
  if (m.status !== "ready")
    throw Error(m.reason || "Dit model is niet bruikbaar.");
  const blob = await client.blob(
    `/library/files/${encodeURIComponent(m.file)}`,
  );
  const bytes = await blob.arrayBuffer();
  const sha = await sha256OfBytes(bytes);
  if (sha !== m.sha256)
    throw Error(
      "De controlesom van het bestand wijkt af van de bibliotheekmanifest; het model is niet toegevoegd.",
    );
  const inspection = await assetRegistry.add(sha, bytes, false);
  const def = importedDefinition(
    uid(),
    {
      name: m.name,
      units: "m",
      role: "custom",
      provenance:
        m.provenance || "AluVision-bibliotheek (SketchUp 3D Warehouse)",
    },
    inspection,
    { sha256: sha, bytes: bytes.byteLength, fileName: m.file },
    { libraryFile: m.file, warehouseId: m.id, description: m.description },
  );
  const sizeOff = (["x", "y", "z"] as const).some(
    (k) =>
      Math.abs(def.size[k] - m.sizeCm[k]) > 0.05 * Math.max(1, m.sizeCm[k]),
  );
  return { def, isNew: true, sizeOff };
}
