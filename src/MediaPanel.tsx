import { useState } from "react";
import { Play, Pause, Trash2, Upload, Plus } from "lucide-react";
import { uid } from "./model";
import type { Project } from "./model";
import { canvasLayout, chainSurfaces, defaultCanvasPixels } from "./media";
import type { FitMode, MediaAsset, ProjectionCanvas } from "./media";
import type { MediaRuntime } from "./mediaRuntime";
const TEST_PATTERN: MediaAsset = {
  id: "test-pattern",
  name: "Kalibratiepatroon",
  kind: "test-pattern",
  widthPx: 1920,
  heightPx: 1080,
};
const FIT_LABEL: Record<FitMode, string> = {
  stretch: "Uitrekken (vult, kan vervormen)",
  contain: "Passend (zwarte randen)",
  cover: "Vullend (snijdt bij)",
};
export function MediaPanel({
  project: p,
  selected,
  readOnly,
  runtime,
  version,
  onChange,
  onMessage,
}: {
  project: Project;
  selected: string[];
  readOnly: boolean;
  runtime: MediaRuntime;
  version: number;
  onChange: (update: (p: Project) => Project) => void;
  onMessage: (message: string) => void;
}) {
  const canvases = p.canvases ?? [],
    media = p.media ?? [];
  const [activeId, setActive] = useState(canvases[0]?.id ?? "");
  const canvas = canvases.find((c) => c.id === activeId) ?? canvases[0];
  const layout = canvas ? canvasLayout(p, canvas) : undefined;
  const asset = media.find((m) => m.id === canvas?.mediaId);
  const video = asset ? runtime.video(asset.id) : undefined;
  const missing =
    !!asset && asset.kind !== "test-pattern" && !runtime.hasSource(asset.id);
  const patch = (changes: Partial<ProjectionCanvas>) =>
    canvas &&
    onChange((q) => ({
      ...q,
      canvases: (q.canvases ?? []).map((c) =>
        c.id === canvas.id ? { ...c, ...changes } : c,
      ),
    }));
  const create = () => {
    const { order, unlinked } = chainSurfaces(p, selected);
    if (!order.length) {
      onMessage("Selecteer eerst een of meer projectiepanelen.");
      return;
    }
    const probe: ProjectionCanvas = {
      id: uid(),
      name: `Canvas ${canvases.length + 1}`,
      surfaceIds: order,
      widthPx: 1,
      heightPx: 1,
      fit: "stretch",
      mediaId: "test-pattern",
      showSeams: true,
    };
    const l = canvasLayout(p, probe);
    const px = defaultCanvasPixels(l.developedWidthCm, l.heightCm);
    const next = { ...probe, ...px };
    onChange((q) => ({
      ...q,
      media: q.media?.some((m) => m.id === "test-pattern")
        ? q.media
        : [...(q.media ?? []), TEST_PATTERN],
      canvases: [...(q.canvases ?? []), next],
    }));
    setActive(next.id);
    onMessage(
      unlinked.length
        ? `Canvas gemaakt; ${unlinked.length} paneel/panelen sluiten niet aan en staan achteraan.`
        : "Canvas gemaakt uit de aaneengesloten panelen.",
    );
  };
  const attach = async (file: File | undefined) => {
    if (!file || !canvas) return;
    try {
      const id = uid();
      const a = await runtime.attach(file, id);
      onChange((q) => ({
        ...q,
        media: [...(q.media ?? []), a],
        canvases: (q.canvases ?? []).map((c) =>
          c.id === canvas.id ? { ...c, mediaId: id } : c,
        ),
      }));
      onMessage(
        `${a.name} gekoppeld (${a.widthPx} × ${a.heightPx} px). Het bestand blijft alleen in deze browsersessie; de projectdata bewaart naam, maat en checksum.`,
      );
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Media kon niet worden geladen.",
      );
    }
  };
  const squarePixels = () => {
    if (!canvas || !layout) return;
    const heightPx = Math.max(
      1,
      Math.round((canvas.widthPx * layout.heightCm) / layout.developedWidthCm),
    );
    patch({ heightPx });
  };
  return (
    <>
      <span className="eyebrow">PROJECTIE EN MEDIA</span>
      <h2>Mediacanvas</h2>
      <p>
        Eén beeld over meerdere panelen. Het canvas wordt langs de wanden
        uitgerold in centimeters; naden en hoeken worden gemeten, niet
        aangenomen.
      </p>
      <div className="media-toolbar">
        <button className="button" disabled={readOnly} onClick={create}>
          <Plus size={16} /> Canvas van selectie ({selected.length})
        </button>
        {canvases.length > 1 && (
          <select
            aria-label="Canvas kiezen"
            value={canvas?.id}
            onChange={(e) => setActive(e.target.value)}
          >
            {canvases.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {!canvas && (
        <p className="fine-print">
          Nog geen canvas. Selecteer projectiepanelen in de ruimte en kies
          &ldquo;Canvas van selectie&rdquo;, of laad de hoekdemo via Nieuw /
          demo.
        </p>
      )}
      {canvas && layout && (
        <div className="media-body" data-version={version}>
          <label className="media-field">
            Naam
            <input
              value={canvas.name}
              disabled={readOnly}
              onChange={(e) => patch({ name: e.target.value.slice(0, 80) })}
            />
          </label>
          <label className="media-field">
            Media
            <select
              value={canvas.mediaId ?? ""}
              disabled={readOnly}
              onChange={(e) => patch({ mediaId: e.target.value || undefined })}
            >
              <option value="">Geen (stoffen paneel)</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} · {m.widthPx} × {m.heightPx}
                  {m.kind === "video" ? " · video" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="button media-upload">
            <Upload size={15} /> Afbeelding of video koppelen
            <input
              type="file"
              accept="image/*,video/*"
              hidden
              disabled={readOnly}
              onChange={(e) => {
                void attach(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          {missing && (
            <p className="media-warning">
              {asset!.name} is niet geladen in deze sessie. Koppel het bestand
              opnieuw; checksum {asset!.sha256?.slice(0, 12) ?? "onbekend"}.
            </p>
          )}
          {video && (
            <button
              className="button"
              onClick={() => runtime.setPlaying(!runtime.playing)}
            >
              {runtime.playing ? <Pause size={15} /> : <Play size={15} />}
              {runtime.playing ? "Pauzeer" : "Speel af"} (alle wanden synchroon)
            </button>
          )}
          <div className="media-grid">
            <label className="media-field">
              Canvas breedte (px)
              <input
                type="number"
                min={1}
                max={65536}
                value={canvas.widthPx}
                disabled={readOnly}
                onChange={(e) =>
                  patch({
                    widthPx: Math.min(
                      65536,
                      Math.max(1, Math.round(Number(e.target.value) || 1)),
                    ),
                  })
                }
              />
            </label>
            <label className="media-field">
              Canvas hoogte (px)
              <input
                type="number"
                min={1}
                max={65536}
                value={canvas.heightPx}
                disabled={readOnly}
                onChange={(e) =>
                  patch({
                    heightPx: Math.min(
                      65536,
                      Math.max(1, Math.round(Number(e.target.value) || 1)),
                    ),
                  })
                }
              />
            </label>
          </div>
          <button className="button" disabled={readOnly} onClick={squarePixels}>
            Hoogte aanpassen voor vierkante pixels
          </button>
          <label className="media-field">
            Aanpassing
            <select
              value={canvas.fit}
              disabled={readOnly}
              onChange={(e) => patch({ fit: e.target.value as FitMode })}
            >
              {(Object.keys(FIT_LABEL) as FitMode[]).map((k) => (
                <option key={k} value={k}>
                  {FIT_LABEL[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="media-check">
            <input
              type="checkbox"
              checked={canvas.showSeams}
              disabled={readOnly}
              onChange={(e) => patch({ showSeams: e.target.checked })}
            />
            Naden tonen (geel = vlak, rood = hoek)
          </label>
          <p className="fine-print">
            Uitgerold: {layout.developedWidthCm.toFixed(1)} ×{" "}
            {layout.heightCm.toFixed(1)} cm · {layout.pxPerCmX.toFixed(2)} px/cm
            horizontaal · {layout.pxPerCmY.toFixed(2)} px/cm verticaal.
          </p>
          <table className="media-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Paneel</th>
                <th>Kijkt naar</th>
                <th>cm</th>
                <th>px-bereik</th>
              </tr>
            </thead>
            <tbody>
              {layout.surfaces.map((s, i) => {
                const seam = layout.seams[i - 1];
                return (
                  <tr key={s.objectId}>
                    <td>{i + 1}</td>
                    <td>{s.name}</td>
                    <td>{s.facing}</td>
                    <td>{s.widthCm}</td>
                    <td>
                      {s.uPx0}–{s.uPx1}
                      {seam && seam.cornerDeg > 0.5 && (
                        <span className="seam-corner">
                          {" "}
                          hoek {seam.cornerDeg}°
                        </span>
                      )}
                      {seam && seam.gapCm > 0 && (
                        <span className="seam-gap"> gat {seam.gapCm} cm</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {layout.issues.map((i, k) => (
            <p className={"media-issue " + i.severity} key={k}>
              {i.message}
            </p>
          ))}
          <button
            className="button danger"
            disabled={readOnly}
            onClick={() => {
              onChange((q) => ({
                ...q,
                canvases: (q.canvases ?? []).filter((c) => c.id !== canvas.id),
              }));
              setActive("");
            }}
          >
            <Trash2 size={15} /> Canvas verwijderen
          </button>
        </div>
      )}
    </>
  );
}
