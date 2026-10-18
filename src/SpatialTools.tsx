import { useState } from "react";
import { Ruler, X, Link2 } from "lucide-react";
import { definition, isLocked, isVisible } from "./model";
import type { Project, Vec3 } from "./model";
import { socketsFor } from "./connectionMetadata";
import { alignConnections, measurement } from "./spatial";
import type { AlignmentPreview } from "./spatial";
export function AlignmentPanel({
  project: p,
  selected,
  freeHeight,
  readOnly,
  onPreview,
}: {
  project: Project;
  selected: string[];
  freeHeight: boolean;
  readOnly: boolean;
  onPreview: (preview: AlignmentPreview) => void;
}) {
  const sourceObjects = p.objects.filter((o) => selected.includes(o.id)),
    targets = p.objects.filter(
      (o) => !selected.includes(o.id) && isVisible(p, o),
    );
  const [sourceId, setSource] = useState(sourceObjects[0]?.id ?? ""),
    [targetId, setTarget] = useState(targets[0]?.id ?? "");
  const source = sourceObjects.find((o) => o.id === sourceId),
    target = targets.find((o) => o.id === targetId);
  const [sourceSocket, setSourceSocket] = useState(
      source ? (socketsFor(definition(p, source))[0]?.id ?? "") : "",
    ),
    [targetSocket, setTargetSocket] = useState(
      target
        ? (socketsFor(definition(p, target))[1]?.id ??
            socketsFor(definition(p, target))[0]?.id ??
            "")
        : "",
    );
  const [rotate, setRotate] = useState(true),
    [height, setHeight] = useState(freeHeight),
    [remember, setRemember] = useState(true),
    [error, setError] = useState("");
  const blocked =
    readOnly || sourceObjects.some((o) => isLocked(p, o)) || !source || !target;
  return (
    <div className="alignment-panel">
      <span className="eyebrow">RUIMTELIJK UITLIJNEN</span>
      <h2>Verbind twee demo-vlakken.</h2>
      <p>
        De hele selectie verplaatst als één geheel. Dit zijn virtuele vlakken op
        de omhulling, geen fabrikantverbindingen of constructieve controle.
      </p>
      <label className="labeled-select">
        Onderdeel in selectie
        <select
          value={sourceId}
          onChange={(e) => {
            setSource(e.target.value);
            const o = sourceObjects.find((o) => o.id === e.target.value)!;
            setSourceSocket(socketsFor(definition(p, o))[0]?.id ?? "");
          }}
        >
          {sourceObjects.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="labeled-select">
        Bronvlak
        <select
          value={sourceSocket}
          onChange={(e) => setSourceSocket(e.target.value)}
        >
          {source &&
            socketsFor(definition(p, source)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.profile}
              </option>
            ))}
        </select>
      </label>
      <label className="labeled-select">
        Doel buiten selectie
        <select
          value={targetId}
          onChange={(e) => {
            setTarget(e.target.value);
            const o = targets.find((o) => o.id === e.target.value)!;
            setTargetSocket(socketsFor(definition(p, o))[0]?.id ?? "");
          }}
        >
          {targets.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} · {o.id.slice(0, 8)}
            </option>
          ))}
        </select>
      </label>
      <label className="labeled-select">
        Doelvlak
        <select
          value={targetSocket}
          onChange={(e) => setTargetSocket(e.target.value)}
        >
          {target &&
            socketsFor(definition(p, target)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.profile}
              </option>
            ))}
        </select>
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={rotate}
          onChange={(e) => setRotate(e.target.checked)}
        />
        Rotatie om Y uitlijnen
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={height}
          onChange={(e) => setHeight(e.target.checked)}
        />
        Hoogtewijziging toestaan
      </label>
      <label className="toggle-row">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
        />
        Verbinding vastleggen voor latere controle
      </label>
      <p className="fine-print">
        Een vastgelegde verbinding is een controlemarkering. Latere handmatige
        edits blijven mogelijk en kunnen een waarschuwing opleveren.
      </p>
      {error && (
        <p className="spatial-error" role="alert">
          {error}
        </p>
      )}
      {!sourceObjects.length && (
        <p>Selecteer eerst één onderdeel of een groep.</p>
      )}
      {sourceObjects.some((o) => isLocked(p, o)) && (
        <p>De selectie bevat vergrendelde onderdelen.</p>
      )}
      {!targets.length && <p>Er is geen zichtbaar doel buiten de selectie.</p>}
      <button
        className="button primary full"
        disabled={blocked || !sourceSocket || !targetSocket}
        onClick={() => {
          try {
            setError("");
            onPreview(
              alignConnections(p, {
                ids: selected,
                from: { objectId: sourceId, socketId: sourceSocket },
                to: { objectId: targetId, socketId: targetSocket },
                rotate,
                freeHeight: height,
                remember,
              }),
            );
          } catch (e) {
            setError(e instanceof Error ? e.message : "Uitlijnen mislukt.");
          }
        }}
      >
        <Link2 size={16} />
        Bekijk uitlijning
      </button>
    </div>
  );
}
export function MeasurementPanel({
  points,
  onChange,
  onClose,
}: {
  points: Vec3[];
  onChange: (points: Vec3[]) => void;
  onClose: () => void;
}) {
  const result = points.length === 2 ? measurement(points[0], points[1]) : null;
  return (
    <section className="measurement-panel" aria-label="Afstand meten">
      <header>
        <strong>
          <Ruler size={15} /> Afstand meten
        </strong>
        <button aria-label="Meetgereedschap sluiten" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <p>
        {points.length === 0
          ? "Klik het eerste punt op een onderdeel of de vloer."
          : points.length === 1
            ? "Klik het tweede punt."
            : "Klik opnieuw voor een nieuwe meting."}
      </p>
      {points.map((point, index) => (
        <div className="measurement-point" key={index}>
          <span>{index === 0 ? "A" : "B"}</span>
          {(["x", "y", "z"] as const).map((axis) => (
            <label key={axis}>
              {axis.toUpperCase()}
              <input
                aria-label={`Meetpunt ${index === 0 ? "A" : "B"} ${axis.toUpperCase()} in cm`}
                type="number"
                step="0.1"
                key={`${index}-${axis}-${point[axis]}`}
                defaultValue={Number(point[axis].toFixed(3))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                onBlur={(e) => {
                  const value = Number(e.target.value);
                  if (
                    e.target.value.trim() &&
                    Number.isFinite(value) &&
                    Math.abs(value) <= 1e7
                  )
                    onChange(
                      points.map((p, i) =>
                        i === index ? { ...p, [axis]: value } : p,
                      ),
                    );
                  else e.target.value = String(point[axis]);
                }}
              />
            </label>
          ))}
        </div>
      ))}
      {result && (
        <>
          <output>
            {result.length.toFixed(2)} <small>cm</small>
          </output>
          <div className="measurement-axes">
            ΔX {result.delta.x.toFixed(2)} · ΔY {result.delta.y.toFixed(2)} · ΔZ{" "}
            {result.delta.z.toFixed(2)} cm
          </div>
          <div className="fine-print">
            Horizontaal {result.horizontal.toFixed(2)} cm · tijdelijke meting,
            geen projectwijziging
          </div>
        </>
      )}
      {!!points.length && (
        <button className="text-button" onClick={() => onChange([])}>
          Meting wissen
        </button>
      )}
    </section>
  );
}
