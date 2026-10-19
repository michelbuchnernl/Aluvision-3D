import { useState } from "react";
import { Upload } from "lucide-react";
import { uid } from "./model";
import type { Definition, Project } from "./model";
import { inspectGlb, importedDefinition, sizeInCm } from "./assetImport";
import type { GlbInspection, ImportUnits } from "./assetImport";
import { assetRegistry, sha256OfBytes } from "./assets";
export function AssetPanel({
  project: p,
  readOnly,
  onAdd,
  onMessage,
}: {
  project: Project;
  readOnly: boolean;
  onAdd: (def: Definition) => void;
  onMessage: (message: string) => void;
}) {
  const [file, setFile] = useState<{
    name: string;
    bytes: ArrayBuffer;
    sha: string;
    inspection: GlbInspection;
  } | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(""),
    [units, setUnits] = useState<ImportUnits>("m"),
    [role, setRole] = useState<"decorative" | "custom">("decorative"),
    [provenance, setProvenance] = useState(""),
    [license, setLicense] = useState("");
  const pick = async (f?: File) => {
    if (!f) return;
    setError("");
    setFile(null);
    setBusy(true);
    try {
      if (f.size > 25_000_000) throw Error("Bestand is groter dan 25 MB.");
      const bytes = await f.arrayBuffer();
      const inspection = await inspectGlb(bytes);
      setFile({
        name: f.name,
        bytes,
        sha: await sha256OfBytes(bytes),
        inspection,
      });
      setName(f.name.replace(/\.glb$/i, "").slice(0, 120));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Bestand kon niet worden gelezen.",
      );
    } finally {
      setBusy(false);
    }
  };
  const cm = file ? sizeInCm(file.inspection.size, units) : undefined;
  const implausible =
    cm && (Math.min(cm.x, cm.y, cm.z) < 1 || Math.max(cm.x, cm.y, cm.z) > 5000);
  const duplicate = file
    ? p.definitions.find((d) => d.asset?.sha256 === file.sha)
    : undefined;
  const confirm = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const def = importedDefinition(
        uid(),
        { name, units, role, provenance, license },
        file.inspection,
        { sha256: file.sha, bytes: file.bytes.byteLength, fileName: file.name },
      );
      await assetRegistry.add(file.sha, file.bytes, true);
      onAdd(def);
      onMessage(
        `${def.name} geïmporteerd als ${role === "decorative" ? "decoratief (buiten BOM)" : "eigen onderdeel (ongeverifieerd)"}.`,
      );
      setFile(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Importeren mislukt.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <span className="eyebrow">CATALOGUSADAPTER · GLB</span>
      <h2>GLB-model importeren</h2>
      <p>
        Geïmporteerde modellen zijn <strong>geen catalogusonderdelen</strong>:
        ze krijgen de status &ldquo;geïmporteerd, niet geverifieerd&rdquo;, een
        eigen code (IMP-…) en jouw opgegeven herkomst. Er worden geen
        fabrikantnummers, certificering of draagkracht beweerd.
      </p>
      <label className="button media-upload">
        <Upload size={15} /> GLB-bestand kiezen
        <input
          type="file"
          accept=".glb,model/gltf-binary"
          hidden
          disabled={readOnly || busy}
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>
      {error && <p className="media-issue error">{error}</p>}
      {file && cm && (
        <div className="media-body">
          <p className="fine-print">
            {file.name} · {file.inspection.meshes} mesh(es) ·{" "}
            {file.inspection.triangles.toLocaleString("nl-NL")} driehoeken ·{" "}
            {file.inspection.materials} materia(a)l(en) · SHA-256{" "}
            {file.sha.slice(0, 12)}…
          </p>
          {file.inspection.warnings.map((w) => (
            <p className="media-issue warning" key={w}>
              {w}
            </p>
          ))}
          {duplicate && (
            <p className="media-issue warning">
              Dit bestand is al geïmporteerd als &ldquo;{duplicate.name}&rdquo;.
              Je kunt het opnieuw toevoegen met een andere rol of naam.
            </p>
          )}
          <label className="media-field">
            Naam
            <input
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="media-field">
            Eenheden in het bestand (glTF-standaard is meter)
            <select
              value={units}
              onChange={(e) => setUnits(e.target.value as ImportUnits)}
            >
              <option value="m">meter</option>
              <option value="cm">centimeter</option>
              <option value="mm">millimeter</option>
            </select>
          </label>
          <p className="fine-print">
            Afmeting in dit project: {cm.x.toFixed(1)} × {cm.y.toFixed(1)} ×{" "}
            {cm.z.toFixed(1)} cm (L × H × D). Controleer dit; de eenheid wordt
            niet geraden.
          </p>
          {implausible && (
            <p className="media-issue warning">
              Een zijde is kleiner dan 1 cm of groter dan 50 m. Klopt de gekozen
              eenheid?
            </p>
          )}
          <label className="media-field">
            Rol
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value as "decorative" | "custom")
              }
            >
              <option value="decorative">
                Decoratief — niet in de onderdelenlijst (BOM)
              </option>
              <option value="custom">
                Eigen onderdeel — in de BOM, ongeverifieerd
              </option>
            </select>
          </label>
          <label className="media-field">
            Herkomst (verplicht)
            <input
              value={provenance}
              maxLength={500}
              placeholder="Bijvoorbeeld: eigen model, of naam en bron"
              onChange={(e) => setProvenance(e.target.value)}
            />
          </label>
          <label className="media-field">
            Licentie (optioneel)
            <input
              value={license}
              maxLength={300}
              onChange={(e) => setLicense(e.target.value)}
            />
          </label>
          <button
            className="button primary"
            disabled={
              readOnly || busy || provenance.trim().length < 3 || !name.trim()
            }
            onClick={confirm}
          >
            Model toevoegen aan de bibliotheek
          </button>
        </div>
      )}
    </>
  );
}
