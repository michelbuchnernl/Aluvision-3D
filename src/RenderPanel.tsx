import { useEffect, useState } from "react";
import { Clapperboard, Download, X, RefreshCw } from "lucide-react";
import type { Preset, Project } from "./model";
import type {
  ConnectionState,
  ProjectConnection,
  RenderJobInfo,
} from "./serverClient";
import { glbBytes } from "./glb";
import { saveBytes } from "./download";
const LABEL: Record<RenderJobInfo["status"], string> = {
  queued: "Wachtrij",
  running: "Bezig",
  done: "Klaar",
  failed: "Mislukt",
  cancelled: "Geannuleerd",
};
const SIZES = [
  ["1280 × 720", 1280, 720],
  ["1920 × 1080", 1920, 1080],
  ["3840 × 2160", 3840, 2160],
] as const;
export function RenderPanel({
  project: p,
  connection,
  state,
  preset,
  readOnly,
  onMessage,
}: {
  project: Project;
  connection: ProjectConnection;
  state: ConnectionState;
  preset: Preset;
  readOnly: boolean;
  onMessage: (message: string) => void;
}) {
  const connected = state.mode === "connected" && !!state.projectId;
  const [jobs, setJobs] = useState<RenderJobInfo[]>([]),
    [blender, setBlender] = useState<boolean | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [look, setLook] = useState<Preset>(preset),
    [size, setSize] = useState(1),
    [engine, setEngine] = useState<"eevee" | "cycles">("eevee"),
    [samples, setSamples] = useState(64),
    [cameras, setCameras] = useState<string[]>([]);
  const load = async () => {
    if (!connected) return;
    try {
      const r = await connection.renders();
      setJobs(r.jobs);
      setBlender(r.blenderConfigured);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Renderlijst niet beschikbaar.",
      );
    }
  };
  useEffect(() => {
    void load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [connected, state.projectId]);
  const submit = async () => {
    setBusy(true);
    try {
      const [, width, height] = SIZES[size];
      await connection.submitRender(
        { preset: look, engine, samples, width, height, cameraNames: cameras },
        (project) => glbBytes(project, false),
      );
      onMessage("Renderopdracht in de wachtrij gezet.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Opdracht mislukt.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <span className="eyebrow">BLENDER · VOORBEREID</span>
      <h2>Renderwachtrij</h2>
      <p>
        Stuurt een opgeslagen revisie met GLB naar Blender op de server. De
        renderer is gebouwd maar nog niet op een echte Blender geprobeerd.
      </p>
      {!connected && (
        <p className="media-warning">
          Verbind eerst met een serverproject (Server-knop) om te renderen.
        </p>
      )}
      {connected && blender === false && (
        <p className="media-warning">
          Op de server staat geen BLENDER_PATH. Opdrachten blijven in de
          wachtrij tot Blender is ingesteld (zie docs/BLENDER.md).
        </p>
      )}
      {error && <p className="media-issue error">{error}</p>}
      <div className="media-body">
        <div className="media-grid">
          <label className="media-field">
            Stijl
            <select
              value={look}
              onChange={(e) => setLook(e.target.value as Preset)}
            >
              <option value="technical">Technisch</option>
              <option value="presentation">Presentatie</option>
              <option value="immersive">Immersief</option>
            </select>
          </label>
          <label className="media-field">
            Resolutie
            <select
              value={size}
              onChange={(e) => setSize(Number(e.target.value))}
            >
              {SIZES.map(([l], i) => (
                <option key={l} value={i}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="media-field">
            Engine
            <select
              value={engine}
              onChange={(e) => setEngine(e.target.value as "eevee" | "cycles")}
            >
              <option value="eevee">EEVEE (snel)</option>
              <option value="cycles">Cycles (fotorealistisch, traag)</option>
            </select>
          </label>
          <label className="media-field">
            Samples
            <input
              type="number"
              min={1}
              max={4096}
              value={samples}
              onChange={(e) =>
                setSamples(
                  Math.min(
                    4096,
                    Math.max(1, Math.round(Number(e.target.value) || 1)),
                  ),
                )
              }
            />
          </label>
        </div>
        <div className="media-field">
          Camera&apos;s
          {p.cameras.length === 0 && (
            <small>
              Geen opgeslagen standpunten: er wordt één overzichtscamera
              gebruikt.
            </small>
          )}
          {p.cameras.map((c) => (
            <label className="media-check" key={c.id}>
              <input
                type="checkbox"
                checked={cameras.includes(c.name)}
                onChange={(e) =>
                  setCameras(
                    e.target.checked
                      ? [...cameras, c.name]
                      : cameras.filter((n) => n !== c.name),
                  )
                }
              />
              {c.name}
            </label>
          ))}
          {p.cameras.length > 0 && cameras.length === 0 && (
            <small>
              Niets gekozen: alle opgeslagen standpunten worden gerenderd.
            </small>
          )}
        </div>
        <button
          className="button primary"
          disabled={!connected || readOnly || busy}
          onClick={submit}
        >
          <Clapperboard size={16} />{" "}
          {busy ? "Versturen…" : "Render in wachtrij zetten"}
        </button>
        <button className="button" onClick={load} disabled={!connected}>
          <RefreshCw size={14} /> Vernieuwen
        </button>
        {jobs.map((j) => (
          <div className="render-job" key={j.id}>
            <strong>{LABEL[j.status]}</strong>
            <span>
              revisie {j.revision} · {j.spec.preset} · {j.spec.resolution.width}
              ×{j.spec.resolution.height} · poging {j.attempts}
            </span>
            <small>{j.message}</small>
            {j.status === "queued" && (
              <button
                className="button"
                disabled={readOnly}
                onClick={() =>
                  connection
                    .cancelRender(j.id)
                    .then(load)
                    .catch((e) => setError(e.message))
                }
              >
                <X size={14} /> Annuleren
              </button>
            )}
            {j.outputs.map((o) => (
              <button
                className="button"
                key={o.file}
                onClick={async () => {
                  try {
                    const blob = await connection.client.blob(
                      `/renders/${j.id}/${o.file}`,
                    );
                    saveBytes(
                      o.file,
                      new Uint8Array(await blob.arrayBuffer()),
                      "image/png",
                    );
                  } catch (e) {
                    setError(
                      e instanceof Error ? e.message : "Download mislukt.",
                    );
                  }
                }}
              >
                <Download size={14} /> {o.camera} ({Math.round(o.bytes / 1024)}{" "}
                kB)
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
