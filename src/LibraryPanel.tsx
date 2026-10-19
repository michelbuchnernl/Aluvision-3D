import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, AlertTriangle } from "lucide-react";
import type { Definition, Project } from "./model";
import type { StudioClient } from "./serverClient";
import { loadLibraryDefinition } from "./libraryModel";
import type { LibraryModel } from "./libraryModel";
interface LibraryClass {
  id: string;
  label: string;
  description: string;
  count: number;
}
interface Listing {
  available: boolean;
  hint?: string;
  source?: string;
  summary?: { ready: number; refused: number; missing: number };
  classes: LibraryClass[];
  gallery?: boolean;
  models: LibraryModel[];
}
const mb = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1)} MB`
    : `${Math.max(1, Math.round(n / 1e3))} kB`;
const cm = (n: number) => (n >= 100 ? Math.round(n) : Number(n.toFixed(1)));
const PAGE = 80;
/** Lists the server's AluVision GLB library and adds a model (and one instance of it) to the project on demand. */
export function LibraryPanel({
  client,
  project: p,
  search,
  readOnly,
  onAdd,
  onMessage,
}: {
  client: StudioClient;
  project: Project;
  search: string;
  readOnly: boolean;
  onAdd: (def: Definition) => void;
  onMessage: (message: string) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState<string | null>(null),
    [limit, setLimit] = useState(PAGE),
    [showRefused, setShowRefused] = useState(false),
    [cls, setCls] = useState("");
  const load = async () => {
    setError("");
    try {
      setListing(await client.request<Listing>("/library"));
    } catch (e) {
      setListing(null);
      setError(
        e instanceof Error
          ? e.message
          : "De bibliotheek kon niet worden geladen.",
      );
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => setLimit(PAGE), [search, showRefused, cls]);
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (listing?.models ?? [])
      .filter((m) =>
        showRefused ? m.status === "refused" : m.status === "ready",
      )
      .filter((m) => !cls || m.class === cls)
      .filter(
        (m) =>
          !q ||
          m.name.toLowerCase().includes(q) ||
          m.description.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name, "nl", { numeric: true }));
  }, [listing, search, showRefused, cls]);
  const add = async (m: LibraryModel) => {
    const existing = p.definitions.find((d) => d.asset?.sha256 === m.sha256);
    if (existing) return onAdd(existing);
    setBusy(m.file);
    try {
      const { def, sizeOff } = await loadLibraryDefinition(client, p, m);
      onAdd(def);
      if (sizeOff)
        onMessage(
          `${m.name}: de gemeten afmeting wijkt meer dan 5% af van het manifest (${cm(def.size.x)} × ${cm(def.size.y)} × ${cm(def.size.z)} cm).`,
        );
    } catch (e) {
      onMessage(
        e instanceof Error ? e.message : "Model kon niet worden geladen.",
      );
    } finally {
      setBusy(null);
    }
  };
  const classLabel = (id: string) =>
    listing?.classes.find((c) => c.id === id)?.label ?? id;
  const visible = shown.slice(0, limit);
  // Within a class the models are shown under their sub-group headings (e.g. stand size, connection type).
  const sections: { title: string; items: LibraryModel[] }[] = [];
  for (const m of visible) {
    const title = cls ? (m.group ?? "") : classLabel(m.class);
    const last = sections[sections.length - 1];
    if (last && last.title === title) last.items.push(m);
    else sections.push({ title, items: [m] });
  }
  const card = (m: LibraryModel) => (
    <button
      className="catalog-card"
      key={m.file}
      disabled={readOnly || busy !== null || m.status !== "ready"}
      title={m.status === "refused" ? m.reason : m.description}
      onClick={() => void add(m)}
    >
      <span className="part-preview asset">
        {m.preview ? (
          <img
            src={`/api/library/previews/${encodeURIComponent(m.file)}`}
            alt=""
            loading="lazy"
            width={46}
            height={46}
          />
        ) : (
          <>
            <i />
            <b />
            <em />
          </>
        )}
      </span>
      <span className="part-copy">
        <strong>{m.name}</strong>
        <small>
          {cm(m.sizeCm.x)} × {cm(m.sizeCm.y)} × {cm(m.sizeCm.z)} cm ·{" "}
          {mb(m.bytes)}
        </small>
        <span>
          {m.status === "refused"
            ? (m.reason ?? "geweigerd")
            : m.description.split("\n")[0] || "AluVision-bibliotheek"}
          {m.notes.some((n) => /wijken af/.test(n)) && (
            <AlertTriangle
              size={11}
              style={{ marginLeft: 4 }}
              aria-label="maat wijkt af"
            />
          )}
        </span>
      </span>
      <span className="add-part">
        {busy === m.file ? "…" : <Plus size={15} />}
      </span>
    </button>
  );
  return (
    <>
      <div className="section-heading">
        ALUVISION-BIBLIOTHEEK{" "}
        <span>
          {listing?.summary
            ? `${listing.summary.ready} beschikbaar`
            : listing
              ? "niet beschikbaar"
              : "laden…"}
        </span>
      </div>
      {error && (
        <p className="media-warning" style={{ margin: "0 12px" }}>
          {error} De bibliotheek staat op de server: start die met npm run dev.
        </p>
      )}
      {listing && !listing.available && (
        <p className="media-warning" style={{ margin: "0 12px" }}>
          {listing.hint}
        </p>
      )}
      {listing?.available && (
        <>
          {!!listing.classes.length && (
            <label className="library-class">
              Klasse
              <select
                aria-label="Klasse"
                value={cls}
                onChange={(e) => setCls(e.target.value)}
              >
                <option value="">
                  Alle klassen ({listing.summary?.ready})
                </option>
                {listing.classes.map((c) => (
                  <option key={c.id} value={c.id} title={c.description}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
            </label>
          )}
          {listing.gallery && (
            <p className="fine-print" style={{ padding: "0 12px 4px" }}>
              <a href="/api/library/gallery" target="_blank" rel="noreferrer">
                Galerij met alle voorbeelden openen
              </a>
            </p>
          )}
          {!!listing.summary?.refused && (
            <div className="library-filters">
              <label className="media-check">
                <input
                  type="checkbox"
                  checked={showRefused}
                  onChange={(e) => setShowRefused(e.target.checked)}
                />
                Toon geweigerde ({listing.summary.refused})
              </label>
            </div>
          )}
        </>
      )}
      <div className="catalog-list">
        {sections.map((sec, i) => (
          <div key={sec.title + i}>
            {sec.title && <div className="library-group">{sec.title}</div>}
            {sec.items.map(card)}
          </div>
        ))}
        {listing?.available && shown.length === 0 && (
          <p className="fine-print" style={{ padding: "6px 4px" }}>
            Geen modellen gevonden{search ? ` voor “${search}”` : ""}.
          </p>
        )}
        {shown.length > limit && (
          <button
            className="button full"
            onClick={() => setLimit(limit + PAGE)}
          >
            Toon meer ({shown.length - limit})
          </button>
        )}
      </div>
    </>
  );
}
