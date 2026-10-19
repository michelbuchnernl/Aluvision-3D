import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Database,
  Layers,
  Search,
  Plus,
  MousePointer2,
  Move3D,
  RotateCw,
  Copy,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Upload,
  Save,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  LockKeyhole,
  LockKeyholeOpen,
  Maximize,
  Camera,
  Sun,
  Moon,
  Grid2X2,
  Ruler,
  Link2,
  Check,
  X,
  HelpCircle,
  AlertTriangle,
  PanelLeftClose,
  Menu,
  FileSpreadsheet,
  Group,
  Ungroup,
  Sparkles,
  History as HistoryIcon,
  CheckCircle2,
  CircleDot,
  ArrowUpRight,
  Clapperboard,
  Glasses,
} from "lucide-react";
import Viewport from "./Viewport";
import type { Tool, ViewportApi, VrState } from "./Viewport";
import {
  CATALOG,
  MATERIALS,
  uid,
  clone,
  demoProject,
  mediaDemoProject,
  emptyProject,
  definition,
  effectiveMaterial,
  isLocked,
  validate,
  collisionWarnings,
  newInstance,
  editObjects,
  duplicate,
  makeUnique,
  group,
  ungroup,
  groupPath,
  groupObjectIds,
  selectionAtLevel,
  childGroupForObject,
  removeObjects,
  bom,
  bomCsv,
  serialize,
  parseProject,
  commit,
  undo,
  redo,
} from "./model";
import type { Project, History, View, Preset, Vec3, MaterialId } from "./model";
import { useProjectServer } from "./useProjectServer";
import { SceneTree } from "./SceneTree";
import { AlignmentPanel, MeasurementPanel } from "./SpatialTools";
import { MediaPanel } from "./MediaPanel";
import { RenderPanel } from "./RenderPanel";
import { MediaRuntime } from "./mediaRuntime";
import { applyAlignmentPreview, removeConnection } from "./spatial";
import type { AlignmentPreview } from "./spatial";
import { saveBytes } from "./download";
import { ServerPanel, AiPanel } from "./ServerPanels";
import "./styles.css";
const STORAGE = "boormester-studio-v1",
  VERSIONS = STORAGE + "-versions",
  LEASE = STORAGE + "-lease";
const VIEWS: { id: View; label: string }[] = [
  { id: "perspective", label: "Perspectief" },
  { id: "top", label: "Bovenaanzicht" },
  { id: "front", label: "Vooraanzicht" },
  { id: "back", label: "Achteraanzicht" },
  { id: "left", label: "Linkerzijde" },
  { id: "right", label: "Rechterzijde" },
  { id: "bottom", label: "Onderaanzicht" },
  { id: "eye", label: "Ooghoogte" },
];
type Version = { time: string; project: Project };
function loadInitial() {
  try {
    const saved = localStorage.getItem(STORAGE);
    if (saved) {
      try {
        return parseProject(saved);
      } catch {
        localStorage.setItem(STORAGE + "-invalid-backup", saved);
      }
    }
  } catch {}
  return demoProject();
}
function loadVersions(): Version[] {
  try {
    const raw = JSON.parse(localStorage.getItem(VERSIONS) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, 10).flatMap((v) => {
      try {
        return typeof v.time === "string"
          ? [{ time: v.time, project: parseProject(JSON.stringify(v.project)) }]
          : [];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}
function download(name: string, data: string, mime = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  disabled = false,
  suffix = "cm",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  useEffect(() => setDraft(String(Math.round(value * 100) / 100)), [value]);
  const apply = () => {
    const n = Number(draft);
    if (
      draft.trim() &&
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max)
    )
      onChange(n);
    else setDraft(String(value));
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step="1"
          min={min}
          max={max}
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <small>{suffix}</small>
      </div>
    </label>
  );
}
function TextInput({
  label,
  value,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      aria-label={label}
      value={draft}
      maxLength={150}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const next = draft.trim() || value;
        setDraft(next);
        onCommit(next);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function IconButton({
  title,
  children,
  onClick,
  active = false,
  disabled = false,
}: {
  title: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={"icon-button" + (active ? " active" : "")}
      aria-label={title}
      title={title}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
function App() {
  const [h, setH] = useState<History>(() => ({
    past: [],
    present: loadInitial(),
    future: [],
  }));
  const p = h.present;
  const pRef = useRef(p);
  pRef.current = p;
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]),
    [tool, setTool] = useState<Tool>("select"),
    [view, setView] = useState<View>("perspective"),
    [preset, setPreset] = useState<Preset>("technical"),
    [snap, setSnap] = useState(10),
    [freeHeight, setFreeHeight] = useState(false);
  const [tab, setTab] = useState<"library" | "scene">("library"),
    [search, setSearch] = useState(""),
    [sideOpen, setSideOpen] = useState(() => window.innerWidth > 900),
    [inspectorOpen, setInspectorOpen] = useState(
      () => window.innerWidth > 1100,
    );
  const [modal, setModal] = useState<
      | null
      | "help"
      | "bom"
      | "room"
      | "versions"
      | "new"
      | "server"
      | "ai"
      | "align"
      | "media"
      | "render"
    >(null),
    [toast, setToast] = useState(""),
    [saved, setSaved] = useState(true),
    [storageError, setStorageError] = useState(""),
    [webglError, setWebglError] = useState(""),
    [showIssues, setShowIssues] = useState(false),
    [materialScope, setMaterialScope] = useState<"instance" | "definition">(
      "instance",
    ),
    [localReadOnly, setReadOnly] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [exportBusy, setExportBusy] = useState(false);
  const [mediaRuntime] = useState(() => new MediaRuntime());
  const [mediaVersion, setMediaVersion] = useState(0);
  useEffect(() => {
    // Read-only hook for the Playwright suite (opt-in via ?e2e=1).
    if (!new URLSearchParams(location.search).has("e2e")) return;
    (window as any).__studio = {
      project: () => JSON.parse(JSON.stringify(pRef.current)),
      boxes: () => api.current?.screenBoxes() ?? [],
      selected: () => [...selectedRef.current],
    };
    return () => {
      delete (window as any).__studio;
    };
  }, []);
  const selectedRef = useRef<string[]>([]);
  selectedRef.current = selected;
  const [vrState, setVrState] = useState<VrState>("unsupported");
  useEffect(
    () => mediaRuntime.subscribe(() => setMediaVersion(mediaRuntime.version)),
    [mediaRuntime],
  );
  const api = useRef<ViewportApi | null>(null),
    file = useRef<HTMLInputElement>(null),
    owner = useRef(uid());
  const [versions, setVersions] = useState<Version[]>(loadVersions);
  const [previewProject, setPreviewProject] = useState<Project | null>(null),
    [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [alignmentPreview, setAlignmentPreview] =
    useState<AlignmentPreview | null>(null);
  const [measurePoints, setMeasurePoints] = useState<Vec3[]>([]);
  const [includeHiddenGlb, setIncludeHiddenGlb] = useState(false);
  const showingPreview = !!previewProject || !!alignmentPreview;
  const server = useProjectServer(p, (next) => {
    try {
      const backup = [
        { time: new Date().toISOString(), project: clone(pRef.current) },
        ...loadVersions(),
      ].slice(0, 10);
      localStorage.setItem(VERSIONS, JSON.stringify(backup));
      setVersions(backup);
    } catch {}
    setH((previous) => commit(previous, next));
    setSelected([]);
    setEditGroupId(null);
    setPreviewProject(null);
    setAlignmentPreview(null);
    setMeasurePoints([]);
  });
  const serverReadOnly = ["locked", "conflict", "connecting"].includes(
    server.state.mode,
  );
  const readOnly = localReadOnly || serverReadOnly || showingPreview;

  useEffect(() => {
    setMeasurePoints([]);
    setAlignmentPreview(null);
  }, [p.id]);
  const announce = (m: string) => setToast(m);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    if (server.state.projectId) {
      setReadOnly(false);
      return;
    }
    const heartbeat = () => {
      try {
        const lease = JSON.parse(localStorage.getItem(LEASE) ?? "null");
        if (
          !lease ||
          lease.expires < Date.now() ||
          lease.owner === owner.current
        ) {
          localStorage.setItem(
            LEASE,
            JSON.stringify({
              owner: owner.current,
              expires: Date.now() + 15000,
            }),
          );
          setReadOnly(false);
        } else setReadOnly(true);
      } catch {
        setStorageError(
          "Lokale opslag is niet beschikbaar. Gebruik JSON-export om je werk te bewaren.",
        );
      }
    };
    heartbeat();
    const timer = setInterval(heartbeat, 4000);
    const listener = (e: StorageEvent) => {
      if (e.key === LEASE) heartbeat();
    };
    window.addEventListener("storage", listener);
    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", listener);
      try {
        const l = JSON.parse(localStorage.getItem(LEASE) ?? "null");
        if (l?.owner === owner.current) localStorage.removeItem(LEASE);
      } catch {}
    };
  }, [server.state.projectId]);
  useEffect(() => {
    if (localReadOnly) return;
    setSaved(false);
    const id = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE, serialize(p));
        setSaved(true);
        setStorageError("");
      } catch {
        setStorageError(
          "Automatisch opslaan mislukt. Exporteer je project als JSON.",
        );
      }
    }, 500);
    return () => clearTimeout(id);
  }, [p, localReadOnly]);
  const change = (next: Project | ((p: Project) => Project)) => {
    if (readOnly) {
      announce("Deze tab is alleen-lezen. Neem eerst de bewerking over.");
      return;
    }
    setH((h) => commit(h, typeof next === "function" ? next(h.present) : next));
  };
  useEffect(() => {
    setSelected((prev) => {
      const next = prev.filter((id) => p.objects.some((o) => o.id === id));
      return next.length === prev.length ? prev : next;
    });
  }, [p.objects]);
  useEffect(() => {
    const flush = () => {
      if (!localReadOnly) {
        try {
          localStorage.setItem(STORAGE, serialize(pRef.current));
        } catch {}
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [localReadOnly]);
  useEffect(() => {
    if (editGroupId && !p.groups.some((g) => g.id === editGroupId)) {
      setEditGroupId(null);
      setSelected([]);
    }
  }, [p.groups, editGroupId]);
  const enterContext = (id: string | null) => {
    setEditGroupId(id);
    setSelected([]);
    setTool("select");
  };
  const pick = (ids: string[], add = false) => {
    const resolved = selectionAtLevel(p, ids, editGroupId);
    setSelected((previous) =>
      add ? [...new Set([...previous, ...resolved])] : resolved,
    );
  };
  const selectedObjects = p.objects.filter((o) => selected.includes(o.id));
  const selectionLocked = selectedObjects.some((o) => isLocked(p, o));
  const selectedGroup = p.groups.find(
    (g) =>
      (g.parentId ?? null) === editGroupId &&
      groupObjectIds(p, g.id).length === selected.length &&
      selected.length > 0 &&
      groupObjectIds(p, g.id).every((id) => selected.includes(id)),
  );
  const one =
    selectedObjects.length === 1 && !selectedGroup
      ? selectedObjects[0]
      : undefined;
  const def = one ? definition(p, one) : undefined;
  const contextLocked = groupPath(p, editGroupId ?? undefined).some(
    (g) => g.locked,
  );
  const issues = [...validate(p), ...collisionWarnings(p)],
    errors = issues.filter((i) => i.severity === "error");
  const snapshot = (label = "Versie opgeslagen") => {
    if (readOnly) return;
    const next = [
      { time: new Date().toISOString(), project: clone(pRef.current) },
      ...versions,
    ].slice(0, 10);
    try {
      localStorage.setItem(VERSIONS, JSON.stringify(next));
      localStorage.setItem(STORAGE, serialize(pRef.current));
      setVersions(next);
      setSaved(true);
      announce(label);
    } catch {
      announce("Opslaan mislukt. Gebruik JSON-export.");
    }
  };
  const duplicateSelection = () => {
    if (
      pRef.current.objects.some(
        (o) => selected.includes(o.id) && isLocked(pRef.current, o),
      )
    ) {
      announce("Selectie bevat vergrendelde onderdelen.");
      return;
    }
    const result = duplicate(pRef.current, selected, editGroupId);
    change(result.project);
    setSelected(result.ids);
  };
  const deleteSelection = () => {
    if (
      pRef.current.objects.some(
        (o) => selected.includes(o.id) && isLocked(pRef.current, o),
      )
    ) {
      announce("Selectie bevat vergrendelde onderdelen.");
      return;
    }
    change((q) => removeObjects(q, selected));
    setSelected([]);
  };
  const onImport = async (f?: File) => {
    if (!f) return;
    try {
      let next: Project,
        note = "Project geladen en gecontroleerd";
      // Detect by content (ZIP magic), not by file name.
      const magic = new Uint8Array(await f.slice(0, 4).arrayBuffer());
      if (
        magic[0] === 0x50 &&
        magic[1] === 0x4b &&
        magic[2] === 3 &&
        magic[3] === 4
      ) {
        if (f.size > 100_000_000) throw Error("Pakket is groter dan 100 MB.");
        const { readPackage } = await import("./projectPackage");
        const pkg = await readPackage(new Uint8Array(await f.arrayBuffer()));
        next = pkg.project;
        note = [
          "Pakket gecontroleerd (controlesommen kloppen)",
          ...pkg.warnings,
        ].join(". ");
      } else {
        if (f.size > 10_000_000) throw Error("Bestand is groter dan 10 MB.");
        next = parseProject(await f.text());
      }
      snapshot("Herstelpunt bewaard");
      change(next);
      setSelected([]);
      announce(note);
    } catch (e) {
      announce(
        e instanceof Error ? e.message : "Project kon niet worden geladen",
      );
    }
    if (file.current) file.current.value = "";
  };
  const actions = useRef<any>(null);
  actions.current = {
    duplicateSelection,
    deleteSelection,
    change,
    snapshot,
    modal,
    editGroupId,
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;
      if (e.key === "Escape") {
        if (!actions.current.modal && actions.current.editGroupId) {
          const parent =
            pRef.current.groups.find(
              (g) => g.id === actions.current.editGroupId,
            )?.parentId ?? null;
          setEditGroupId(parent);
        }
        setModal(null);
        setAlignmentPreview(null);
        setExportMenu(false);
        setSelected([]);
        setTool("select");
        return;
      }
      if (
        !actions.current.modal &&
        !e.ctrlKey &&
        !e.metaKey &&
        e.key.toLowerCase() === "t"
      ) {
        setTool("measure");
        return;
      }
      if (readOnly || actions.current.modal) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setH(e.shiftKey ? redo : undo);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        setH(redo);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        actions.current.duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        actions.current.snapshot();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        actions.current.deleteSelection();
      } else if (e.key.toLowerCase() === "v") setTool("select");
      else if (e.key.toLowerCase() === "m") setTool("move");
      else if (e.key.toLowerCase() === "r") setTool("rotate");
      else if (e.key.toLowerCase() === "f") api.current?.fit();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [readOnly]);
  const editPosition = (axis: keyof Vec3, value: number) => {
    if (one)
      change((q) =>
        editObjects(q, [one.id], (o) => {
          o.position[axis] = value;
        }),
      );
  };
  const editSize = (axis: keyof Vec3, value: number) => {
    if (!def) return;
    if (p.objects.some((o) => o.definitionId === def.id && isLocked(p, o))) {
      announce(
        "Een exemplaar van deze definitie is vergrendeld. Ontgrendel het eerst.",
      );
      return;
    }
    change((q) => {
      const n = clone(q);
      n.definitions.find((d) => d.id === def.id)!.size[axis] = value;
      return n;
    });
  };
  const updateOne = (edit: (o: NonNullable<typeof one>) => void) => {
    if (one) change((q) => editObjects(q, [one.id], edit));
  };
  const counts = bom(p);
  const locked = readOnly || !!(one && isLocked(p, one));
  const exportProject = () => {
    download("boormester-project.json", serialize(p));
    announce("Projectbestand gedownload");
  };
  const exportXlsx = async () => {
    setExportMenu(false);
    setExportBusy(true);
    announce("Excel-onderdelenlijst maken…");
    try {
      const e = await import("./exports");
      e.saveBytes(
        "boormester-onderdelen.xlsx",
        await e.xlsxBytes(p),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      announce(
        "Excel met onderdelen, exemplaren en projectgegevens gedownload",
      );
    } catch (err) {
      announce(
        "Excel-export mislukt: " +
          (err instanceof Error ? err.message : "onbekende fout"),
      );
    } finally {
      setExportBusy(false);
    }
  };
  const exportPdf = async () => {
    if (showingPreview) {
      announce(
        "Sluit eerst de voorstelweergave voordat je het ontwerp exporteert.",
      );
      return;
    }
    setExportMenu(false);
    setExportBusy(true);
    announce("Technische PDF maken…");
    try {
      const e = await import("./exports");
      const pdf = e.technicalPdf(p, api.current?.capture());
      pdf.save("boormester-ontwerp.pdf");
      announce("PDF met drie aanzichten en ontwerpcontrole gedownload");
    } catch (err) {
      announce(
        "PDF-export mislukt: " +
          (err instanceof Error ? err.message : "onbekende fout"),
      );
    } finally {
      setExportBusy(false);
    }
  };
  const exportPackage = async () => {
    if (showingPreview) {
      announce(
        "Sluit eerst de voorstelweergave voordat je het ontwerp exporteert.",
      );
      return;
    }
    setExportMenu(false);
    setExportBusy(true);
    try {
      const [{ glbBytes }, e, { buildPackage }] = await Promise.all([
        import("./glb"),
        import("./exports"),
        import("./projectPackage"),
      ]);
      const zip = await buildPackage(p, {
        glb: new Uint8Array(await glbBytes(p, false)),
        xlsx: new Uint8Array(await e.xlsxBytes(p)),
      });
      saveBytes("boormester-pakket.zip", zip, "application/zip");
      announce("Projectpakket gedownload · controlesommen in manifest.json");
    } catch (err) {
      announce(
        "Pakket maken mislukt: " +
          (err instanceof Error ? err.message : "onbekende fout"),
      );
    } finally {
      setExportBusy(false);
    }
  };
  const exportGlb = async () => {
    if (showingPreview) {
      announce(
        "Sluit eerst de voorstelweergave voordat je het ontwerp exporteert.",
      );
      return;
    }
    setExportMenu(false);
    setExportBusy(true);
    try {
      const { glbBytes } = await import("./glb");
      saveBytes(
        "boormester-ontwerp.glb",
        new Uint8Array(await glbBytes(p, includeHiddenGlb)),
        "model/gltf-binary",
      );
      announce("GLB gedownload · geometrie in meters");
    } catch (e) {
      announce(
        "GLB-export mislukt: " +
          (e instanceof Error ? e.message : "onbekende fout"),
      );
    } finally {
      setExportBusy(false);
    }
  };
  const applyAlignment = () => {
    if (!alignmentPreview || localReadOnly || serverReadOnly) return;
    try {
      const next = applyAlignmentPreview(pRef.current, alignmentPreview);
      setH((previous) => commit(previous, next));
      setAlignmentPreview(null);
      setMeasurePoints([]);
      announce("Uitlijning toegepast");
    } catch (e) {
      announce(e instanceof Error ? e.message : "Uitlijnen mislukt.");
    }
  };
  const savedCamera = () => {
    if (!api.current) return;
    const c = {
      ...api.current.bookmark(),
      id: uid(),
      name: `Standpunt ${p.cameras.length + 1}`,
    };
    change((q) => ({ ...q, cameras: [...q.cameras, c] }));
    announce("Standpunt opgeslagen");
  };
  return (
    <div className="app">
      <header className="header">
        <div className="brand-mark">
          <Box size={24} strokeWidth={1.4} />
        </div>
        <div className="brand">
          <strong>
            BOORMESTER<span>STUDIO</span>
          </strong>
          <small>IMMERSIVE SPACE DESIGN</small>
        </div>
        <div className="header-divider" />
        <div className="project-heading">
          <TextInput
            label="Projectnaam"
            value={p.name}
            disabled={readOnly}
            onCommit={(name) => change((q) => ({ ...q, name }))}
          />
          <span>
            {server.state.projectId ? (
              <>
                <Database size={11} />
                {server.state.mode === "connected"
                  ? server.state.saving
                    ? "Op server bewaren…"
                    : `Serverrevisie ${server.state.revision}${server.state.dirty ? " · gewijzigd" : ""}`
                  : server.state.mode === "locked"
                    ? "Serververgrendeling verloren"
                    : server.state.mode === "conflict"
                      ? "Serverconflict · lokale kopie bewaard"
                      : "Serververbinding onderbroken"}
              </>
            ) : storageError ? (
              <>
                <AlertTriangle size={11} /> Opslag niet beschikbaar
              </>
            ) : saved ? (
              <>
                <CheckCircle2 size={11} /> Lokaal opgeslagen
              </>
            ) : (
              <>
                <CircleDot size={11} /> Opslaan…
              </>
            )}
          </span>
        </div>
        <div className="header-actions">
          <button
            className="button subtle server-header-button"
            aria-label="Serverprojecten"
            onClick={() => setModal("server")}
          >
            <Database size={16} />
            <span>
              Server{server.state.revision ? ` · ${server.state.revision}` : ""}
            </span>
          </button>
          <button
            className="button subtle ai-header-button"
            aria-label="Ontwerpen met Claude"
            onClick={() => setModal("ai")}
          >
            <Sparkles size={16} />
            <span>Claude</span>
          </button>

          <button
            className="button subtle"
            aria-label="Media en projectiecanvas"
            onClick={() => setModal("media")}
          >
            <Clapperboard size={16} />
            <span className="desktop-label">Media</span>
          </button>
          <button
            className="button subtle desktop-label"
            onClick={() => setModal("versions")}
          >
            <HistoryIcon size={16} />
            <span>Versies</span>
          </button>
          <button
            className="button subtle"
            onClick={() => file.current?.click()}
            disabled={readOnly}
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <button
            className="button subtle"
            onClick={() => {
              snapshot();
              if (server.state.mode === "connected")
                server.connection
                  .save("Handmatig bewaard")
                  .catch((e) => announce(e.message));
            }}
            disabled={readOnly}
          >
            <Save size={16} />
            <span>Bewaar</span>
          </button>
          <div className="export-wrapper">
            <button
              className="button primary"
              aria-expanded={exportMenu}
              aria-label="Exporteer ontwerp"
              disabled={exportBusy}
              onClick={() => setExportMenu(!exportMenu)}
            >
              <Download size={16} />
              <span>{exportBusy ? "Exporteren…" : "Exporteer"}</span>
              <ChevronDown size={12} />
            </button>
            {exportMenu && (
              <div className="export-menu">
                <button
                  onClick={() => {
                    setExportMenu(false);
                    exportProject();
                  }}
                >
                  <Download size={15} />
                  <span>
                    Projectbestand
                    <small>JSON · openen en verder bewerken</small>
                  </span>
                </button>
                <button onClick={exportXlsx}>
                  <FileSpreadsheet size={15} />
                  <span>
                    Excel-onderdelenlijst
                    <small>XLSX · inclusief alle exemplaren</small>
                  </span>
                </button>
                <button disabled={showingPreview} onClick={exportPackage}>
                  <Download size={15} />
                  <span>
                    Projectpakket
                    <small>ZIP · project, GLB, Excel, controlesommen</small>
                  </span>
                </button>
                <button disabled={showingPreview} onClick={exportGlb}>
                  <Box size={15} />
                  <span>
                    3D-model<small>GLB · meters · demo-geometrie</small>
                  </span>
                </button>
                <button
                  onClick={() => {
                    setExportMenu(false);
                    setModal("render");
                  }}
                >
                  <Clapperboard size={15} />
                  <span>
                    Blender-render
                    <small>PNG · wachtrij op de server · voorbereid</small>
                  </span>
                </button>
                <label className="glb-visibility">
                  <input
                    type="checkbox"
                    checked={includeHiddenGlb}
                    onChange={(e) => setIncludeHiddenGlb(e.target.checked)}
                  />
                  GLB inclusief verborgen onderdelen
                </label>
                <button onClick={exportPdf}>
                  <Ruler size={15} />
                  <span>
                    Technisch document
                    <small>PDF · aanzichten en ontwerpcontrole</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          <IconButton
            title="Help en sneltoetsen"
            onClick={() => setModal("help")}
          >
            <HelpCircle size={19} />
          </IconButton>
        </div>
      </header>
      <div className="workspace-toolbar">
        <div className="toolbar-left">
          <IconButton
            title="Bibliotheek tonen/verbergen"
            onClick={() => setSideOpen(!sideOpen)}
            active={sideOpen}
          >
            <Menu size={17} />
          </IconButton>
          <div className="breadcrumb context-breadcrumb">
            <button onClick={() => enterContext(null)}>Ruimte</button>
            {groupPath(p, editGroupId ?? undefined).map((g) => (
              <React.Fragment key={g.id}>
                <ChevronRight size={12} />
                <button
                  className={g.id === editGroupId ? "current" : ""}
                  onClick={() => enterContext(g.id)}
                >
                  {g.name}
                </button>
              </React.Fragment>
            ))}
            {editGroupId ? (
              <span className="context-editing-label">GROEP BEWERKEN</span>
            ) : (
              <span className="draft-tag">CONCEPT</span>
            )}
          </div>
        </div>
        <div className="toolbar-right">
          <button className="room-summary" onClick={() => setModal("room")}>
            <Ruler size={14} />
            {p.room.length / 100} × {p.room.depth / 100} × {p.room.height / 100}{" "}
            m<ChevronDown size={13} />
          </button>
          <span className="synthetic-badge">Demo-onderdelen</span>
          <IconButton
            title="Eigenschappen tonen/verbergen"
            active={inspectorOpen}
            onClick={() => setInspectorOpen(!inspectorOpen)}
          >
            <Layers size={17} />
          </IconButton>
        </div>
      </div>
      {(localReadOnly || storageError) && (
        <div className="notice">
          <AlertTriangle size={16} />
          {localReadOnly
            ? "Een andere tab bewerkt dit lokale project. Deze tab is alleen-lezen."
            : storageError}
          {localReadOnly && (
            <button
              onClick={() => {
                try {
                  const raw = localStorage.getItem(STORAGE);
                  if (raw) {
                    const current = parseProject(raw);
                    setH({ past: [], present: current, future: [] });
                    setSelected([]);
                  }
                  localStorage.setItem(
                    LEASE,
                    JSON.stringify({
                      owner: owner.current,
                      expires: Date.now() + 15000,
                    }),
                  );
                  setReadOnly(false);
                  announce(
                    "Laatste opgeslagen ontwerp geladen; bewerking overgenomen",
                  );
                } catch {
                  announce(
                    "Overnemen mislukt: opgeslagen project kon niet worden geladen.",
                  );
                }
              }}
            >
              Neem bewerking over
            </button>
          )}
        </div>
      )}
      {serverReadOnly && (
        <div className="notice">
          <Database size={15} />
          {server.state.message}
          <button onClick={() => setModal("server")}>
            Bekijk serverstatus
          </button>
        </div>
      )}
      {previewProject && (
        <div className="proposal-preview-bar">
          <Eye size={15} />
          <span>Voorstelweergave · nog niet toegepast</span>
          <button onClick={() => setPreviewProject(null)}>
            Terug naar ontwerp
          </button>
          <button onClick={() => setModal("ai")}>Voorstel beoordelen</button>
        </div>
      )}
      {alignmentPreview && (
        <div className="proposal-preview-bar alignment-preview-bar">
          <Link2 size={15} />
          <span>
            Uitlijnpreview · ΔX {alignmentPreview.translation.x.toFixed(1)} / ΔY{" "}
            {alignmentPreview.translation.y.toFixed(1)} / ΔZ{" "}
            {alignmentPreview.translation.z.toFixed(1)} cm ·{" "}
            {alignmentPreview.rotation.toFixed(1)}°
            {!alignmentPreview.canApply && " · PAST NIET IN RUIMTE"}
            {alignmentPreview.issues.filter((i) => i.severity === "warning")
              .length > 0 &&
              ` · ${alignmentPreview.issues.filter((i) => i.severity === "warning").length} waarschuwingen`}
          </span>
          <button
            onClick={() => {
              setAlignmentPreview(null);
              setModal("align");
            }}
          >
            Aanpassen
          </button>
          <button onClick={() => setAlignmentPreview(null)}>Annuleren</button>
          <button
            disabled={
              !alignmentPreview.canApply || localReadOnly || serverReadOnly
            }
            onClick={applyAlignment}
          >
            Toepassen
          </button>
          {alignmentPreview.issues.some((i) => i.severity === "warning") && (
            <details className="alignment-warnings">
              <summary>Waarschuwingen bekijken</summary>
              {alignmentPreview.issues
                .filter((i) => i.severity === "warning")
                .slice(0, 10)
                .map((i) => (
                  <p key={i.id}>{i.message}</p>
                ))}
            </details>
          )}
          {alignmentPreview.issues.some((i) => i.severity === "error") && (
            <span>
              {alignmentPreview.issues
                .filter((i) => i.severity === "error")
                .slice(0, 2)
                .map((i) => i.message)
                .join(" ")}
            </span>
          )}
        </div>
      )}
      <main
        className={
          "workspace " +
          (!sideOpen ? "hide-library " : "") +
          (!inspectorOpen ? "hide-inspector" : "")
        }
      >
        {sideOpen && (
          <aside className="library">
            <div className="sidebar-tabs">
              <button
                className={tab === "library" ? "selected" : ""}
                onClick={() => {
                  setTab("library");
                  setSearch("");
                }}
              >
                <Box size={15} />
                Bibliotheek
              </button>
              <button
                className={tab === "scene" ? "selected" : ""}
                onClick={() => {
                  setTab("scene");
                  setSearch("");
                }}
              >
                <Layers size={15} />
                Objecten <span>{p.objects.length}</span>
              </button>
            </div>
            <label className="search">
              <Search size={15} />
              <input
                placeholder={
                  tab === "library"
                    ? "Zoek een onderdeel…"
                    : "Zoek in je ontwerp…"
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Onderdelen zoeken"
              />
            </label>
            {tab === "library" ? (
              <>
                <div className="section-heading">
                  DEMO-COLLECTIE <span>{CATALOG.length} onderdelen</span>
                </div>
                <div className="catalog-list">
                  {CATALOG.filter((d) =>
                    d.name.toLowerCase().includes(search.toLowerCase()),
                  ).map((d) => (
                    <button
                      className="catalog-card"
                      key={d.id}
                      disabled={readOnly || contextLocked}
                      onClick={() => {
                        const o = newInstance(p, d.id);
                        if (editGroupId) o.groupId = editGroupId;
                        change((q) => ({ ...q, objects: [...q.objects, o] }));
                        setSelected([o.id]);
                        setTool("move");
                      }}
                    >
                      <span className={"part-preview " + d.kind}>
                        <i />
                        <b />
                        <em />
                      </span>
                      <span className="part-copy">
                        <strong>{d.name}</strong>
                        <small>
                          {d.size.x} × {d.size.y} × {d.size.z} cm
                        </small>
                        <span>
                          {d.kind === "panel"
                            ? "Projectie"
                            : d.kind === "table" || d.kind === "projector"
                              ? "Inrichting"
                              : "Constructie"}
                        </span>
                      </span>
                      <span className="add-part">
                        <Plus size={15} />
                      </span>
                    </button>
                  ))}
                </div>
                <div className="library-footnote">
                  <CircleDot size={14} />
                  <p>
                    Synthetische onderdelen voor ontwerp en demonstratie. Geen
                    fabrikantcatalogus of constructieberekening.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="section-heading">
                  SCÈNE <span>{p.objects.length} exemplaren</span>
                </div>
                <SceneTree
                  project={p}
                  selected={selected}
                  contextId={editGroupId}
                  search={search}
                  readOnly={readOnly}
                  onChange={change}
                  onEnter={(id) => enterContext(id)}
                  onPick={(ids, add, context) => {
                    if (context !== editGroupId) {
                      setEditGroupId(context);
                      setSelected(ids);
                    } else
                      setSelected((previous) =>
                        add ? [...new Set([...previous, ...ids])] : ids,
                      );
                  }}
                />
              </>
            )}
            <div className="tags-panel">
              <div className="section-heading">LAGEN</div>
              {p.tags.map((t) => (
                <div className="tag-row" key={t.id}>
                  <i className={t.id} />
                  <span>{t.name}</span>
                  <button
                    aria-label={`Laag ${t.name} tonen/verbergen`}
                    onClick={() =>
                      change((q) => {
                        const n = clone(q);
                        n.tags.find((v) => v.id === t.id)!.visible = !t.visible;
                        return n;
                      })
                    }
                  >
                    {t.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                  <button
                    aria-label={`Laag ${t.name} vergrendelen`}
                    onClick={() =>
                      change((q) => {
                        const n = clone(q);
                        n.tags.find((v) => v.id === t.id)!.locked = !t.locked;
                        return n;
                      })
                    }
                  >
                    {t.locked ? (
                      <LockKeyhole size={13} />
                    ) : (
                      <LockKeyholeOpen size={13} />
                    )}
                  </button>
                </div>
              ))}
            </div>
          </aside>
        )}
        <section className={"canvas-area " + preset} aria-label="Ontwerpruimte">
          <Viewport
            project={previewProject ?? alignmentPreview?.project ?? p}
            selected={showingPreview ? [] : selected}
            tool={readOnly && tool !== "measure" ? "select" : tool}
            view={view}
            preset={preset}
            media={mediaRuntime}
            onVrChange={setVrState}
            mediaVersion={mediaVersion}
            snap={snap}
            freeHeight={freeHeight}
            contextId={showingPreview ? null : editGroupId}
            measurement={measurePoints}
            onMeasure={(point) =>
              setMeasurePoints((previous) =>
                previous.length === 1 ? [...previous, point] : [point],
              )
            }
            onEnterGroup={(id) => {
              if (showingPreview) return;
              const next = childGroupForObject(p, id, editGroupId);
              if (next) enterContext(next);
            }}
            onSelect={showingPreview ? () => {} : pick}
            onTransform={(changes) =>
              change((q) =>
                editObjects(
                  q,
                  changes.map((c) => c.id),
                  (o) => {
                    const c = changes.find((c) => c.id === o.id)!;
                    o.position = c.position;
                    o.rotation = c.rotation;
                  },
                ),
              )
            }
            onReady={(a) => (api.current = a)}
            onError={setWebglError}
          />
          {tool === "measure" && (
            <MeasurementPanel
              points={measurePoints}
              onChange={setMeasurePoints}
              onClose={() => setTool("select")}
            />
          )}
          {webglError && (
            <div className="webgl-error">
              <AlertTriangle />
              <strong>3D-weergave niet beschikbaar</strong>
              <p>{webglError}</p>
            </div>
          )}
          <div className="view-top">
            <div className="view-select">
              <Box size={14} />
              <select
                aria-label="Camerastandpunt"
                value={view}
                onChange={(e) => setView(e.target.value as View)}
              >
                {VIEWS.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <span className="room-label">
              {p.room.length / 100} × {p.room.depth / 100} m <i /> 1 rastervak =
              100 cm
            </span>
          </div>
          <div className="floating-tools">
            <IconButton
              title="Selecteren (V)"
              active={tool === "select"}
              onClick={() => setTool("select")}
            >
              <MousePointer2 size={19} />
            </IconButton>
            <IconButton
              title="Verplaatsen (M)"
              active={tool === "move"}
              disabled={readOnly}
              onClick={() => setTool("move")}
            >
              <Move3D size={20} />
            </IconButton>
            <IconButton
              title="Roteren (R)"
              active={tool === "rotate"}
              disabled={readOnly}
              onClick={() => setTool("rotate")}
            >
              <RotateCw size={19} />
            </IconButton>
            <IconButton
              title="Afstand meten (T)"
              active={tool === "measure"}
              onClick={() => setTool(tool === "measure" ? "select" : "measure")}
            >
              <Ruler size={19} />
            </IconButton>
            <IconButton
              title="Uitlijnvlakken verbinden"
              disabled={!selected.length || readOnly || selectionLocked}
              onClick={() => setModal("align")}
            >
              <Link2 size={19} />
            </IconButton>
            <span />
            <IconButton
              title="Dupliceren (Ctrl/Cmd+D)"
              disabled={!selected.length || readOnly || selectionLocked}
              onClick={duplicateSelection}
            >
              <Copy size={18} />
            </IconButton>
            <IconButton
              title="Verwijderen (Delete)"
              disabled={!selected.length || readOnly || selectionLocked}
              onClick={deleteSelection}
            >
              <Trash2 size={18} />
            </IconButton>
            <span />
            <IconButton
              title="Ongedaan maken (Ctrl/Cmd+Z)"
              disabled={!h.past.length || readOnly}
              onClick={() => setH(undo)}
            >
              <Undo2 size={18} />
            </IconButton>
            <IconButton
              title="Opnieuw (Ctrl/Cmd+Shift+Z)"
              disabled={!h.future.length || readOnly}
              onClick={() => setH(redo)}
            >
              <Redo2 size={18} />
            </IconButton>
          </div>
          <div className="view-bottom">
            <div className="preset-switch" aria-label="Weergavestijl">
              <button
                className={preset === "technical" ? "active" : ""}
                onClick={() => setPreset("technical")}
              >
                <Sun size={14} />
                Technisch
              </button>
              <button
                className={preset === "presentation" ? "active" : ""}
                onClick={() => setPreset("presentation")}
              >
                <Sun size={14} />
                Presentatie
              </button>
              <button
                className={preset === "immersive" ? "active" : ""}
                onClick={() => setPreset("immersive")}
              >
                <Moon size={14} />
                Immersief
              </button>
            </div>
            <div className="canvas-actions">
              <IconButton
                title="Passend in beeld (F)"
                onClick={() => api.current?.fit()}
              >
                <Maximize size={17} />
              </IconButton>
              <IconButton
                title={
                  vrState === "unsupported"
                    ? "VR niet beschikbaar: geen WebXR-headset gevonden"
                    : vrState === "active"
                      ? "VR verlaten"
                      : "VR-wandeling (alleen kijken, teleport met stick)"
                }
                disabled={vrState === "unsupported"}
                onClick={async () => {
                  if (vrState === "active") return api.current?.exitVr();
                  const problem = await api.current?.enterVr();
                  if (problem) announce(problem);
                }}
              >
                <Glasses size={17} />
              </IconButton>
              <IconButton
                title="Standpunt opslaan"
                disabled={readOnly}
                onClick={savedCamera}
              >
                <Camera size={17} />
              </IconButton>
              <IconButton
                title="Screenshot downloaden"
                onClick={() => {
                  const src = api.current?.capture();
                  if (src) {
                    const a = document.createElement("a");
                    a.href = src;
                    a.download = "boormester-ontwerp.png";
                    a.click();
                  }
                }}
              >
                <Download size={17} />
              </IconButton>
            </div>
          </div>
          <div className="canvas-hint">
            {tool === "measure"
              ? "Klik twee punten op onderdelen of de vloer · exacte cm-coördinaten in het meetpaneel"
              : tool === "select"
                ? "Klik om te selecteren · Shift voor meer · Sleep een selectiekader"
                : tool === "move"
                  ? "Sleep de gekleurde assen · Vul exacte maten rechts in"
                  : "Sleep de groene boog · Draaiing in stappen van 15°"}
            <span>
              Middenmuis: draaien · Shift + middenmuis: pannen · Scroll: zoomen
            </span>
          </div>
        </section>
        {inspectorOpen && (
          <aside className="inspector">
            <div className="inspector-title">
              <span>Eigenschappen</span>
              <span className="units-label">CM</span>
            </div>
            <div className="inspector-scroll">
              {selected.length > 0 && (
                <div className="property-section connection-section">
                  <h4>DEMO-VERBINDINGEN</h4>
                  <button
                    className="button full"
                    disabled={readOnly || selectionLocked}
                    onClick={() => setModal("align")}
                  >
                    <Link2 size={14} />
                    Uitlijnvlakken verbinden
                  </button>
                  {(p.connections ?? [])
                    .filter(
                      (c) =>
                        selected.includes(c.from.objectId) ||
                        selected.includes(c.to.objectId),
                    )
                    .map((c) => (
                      <div className="connection-row" key={c.id}>
                        <span>
                          {
                            p.objects.find((o) => o.id === c.from.objectId)
                              ?.name
                          }{" "}
                          ↔{" "}
                          {p.objects.find((o) => o.id === c.to.objectId)?.name}
                        </span>
                        <button
                          aria-label="Verbinding verwijderen"
                          disabled={
                            readOnly ||
                            p.objects.some(
                              (o) =>
                                [c.from.objectId, c.to.objectId].includes(
                                  o.id,
                                ) && isLocked(p, o),
                            )
                          }
                          onClick={() => {
                            try {
                              change((q) => removeConnection(q, c.id));
                            } catch (e) {
                              announce(
                                e instanceof Error
                                  ? e.message
                                  : "Verwijderen mislukt.",
                              );
                            }
                          }}
                        >
                          <X size={13} />
                        </button>
                      </div>
                    ))}
                </div>
              )}

              {!one ? (
                <>
                  <div className="selection-summary">
                    <span className="selection-icon">
                      {selected.length ? (
                        <Group size={25} />
                      ) : (
                        <Box size={25} />
                      )}
                    </span>
                    <h3>
                      {selected.length
                        ? `${selected.length} onderdelen geselecteerd`
                        : "Je ruimte, jouw ontwerp"}
                    </h3>
                    <p>
                      {selected.length
                        ? "Bewerk de selectie via de werkbalk of maak er een groep van."
                        : "Selecteer een onderdeel om positie, afmetingen en materiaal te bewerken."}
                    </p>
                  </div>
                  {(selected.length > 1 || selectedGroup) && (
                    <div className="multi-actions">
                      {selectedGroup && (
                        <div className="selected-group-editor">
                          <TextInput
                            label="Groepsnaam"
                            value={selectedGroup.name}
                            disabled={readOnly || selectionLocked}
                            onCommit={(name) =>
                              change((q) => {
                                const n = clone(q);
                                n.groups.find(
                                  (g) => g.id === selectedGroup.id,
                                )!.name = name;
                                return n;
                              })
                            }
                          />
                          <button
                            className="button"
                            onClick={() => enterContext(selectedGroup.id)}
                          >
                            Bewerk groep
                          </button>
                        </div>
                      )}
                      <button
                        className="button"
                        disabled={
                          selected.length < 2 || readOnly || selectionLocked
                        }
                        onClick={() =>
                          change((q) => group(q, selected, editGroupId))
                        }
                      >
                        <Group size={15} /> Groepeer selectie
                      </button>
                      <button
                        className="button"
                        disabled={readOnly || selectionLocked}
                        onClick={() =>
                          change((q) => ungroup(q, selected, editGroupId))
                        }
                      >
                        <Ungroup size={15} /> Haal uit groep
                      </button>
                      <button
                        className="button"
                        disabled={readOnly || selectionLocked}
                        onClick={() => change((q) => makeUnique(q, selected))}
                      >
                        <Copy size={15} /> Maak elk uniek
                      </button>
                    </div>
                  )}
                  {selected.length > 0 && (
                    <div className="property-section">
                      <h4>SELECTIEMATERIAAL</h4>
                      <p className="fine-print">
                        Geldt voor alle geselecteerde exemplaren, inclusief
                        onderdelen in subgroepen.
                      </p>
                      <div className="material-swatches">
                        {Object.entries(MATERIALS).map(([id, m]) => (
                          <button
                            key={id}
                            title={m.name}
                            aria-label={`Selectiemateriaal ${m.name}`}
                            style={{ background: m.color }}
                            disabled={readOnly || selectionLocked}
                            onClick={() =>
                              change((q) =>
                                editObjects(q, selected, (o) => {
                                  o.material = id as MaterialId;
                                }),
                              )
                            }
                          >
                            {selectedObjects.every(
                              (o) => effectiveMaterial(p, o) === id,
                            ) && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                      <button
                        className="text-button"
                        disabled={readOnly || selectionLocked}
                        onClick={() =>
                          change((q) =>
                            editObjects(q, selected, (o) => {
                              delete o.material;
                            }),
                          )
                        }
                      >
                        Gebruik definitiematerialen
                      </button>
                    </div>
                  )}
                  <div className="property-section">
                    <h4>
                      RUIMTEAFMETINGEN{" "}
                      <button onClick={() => setModal("room")}>
                        Wijzig <ArrowUpRight size={12} />
                      </button>
                    </h4>
                    <div className="room-dimensions">
                      <div>
                        <span>Lengte</span>
                        <strong>
                          {p.room.length}
                          <small>cm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Diepte</span>
                        <strong>
                          {p.room.depth}
                          <small>cm</small>
                        </strong>
                      </div>
                      <div>
                        <span>Hoogte*</span>
                        <strong>
                          {p.room.height}
                          <small>cm</small>
                        </strong>
                      </div>
                    </div>
                    <p className="fine-print">
                      *300 cm is de gekozen demohoogte. Controleer de werkelijke
                      maat.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="selected-object">
                    <span className={"mini-preview " + def!.kind}>
                      <Box size={25} />
                    </span>
                    <div>
                      <TextInput
                        label="Objectnaam"
                        value={one.name}
                        disabled={locked}
                        onCommit={(name) => updateOne((o) => (o.name = name))}
                      />
                      <small>{def!.catalogId} · synthetisch</small>
                    </div>
                  </div>
                  <div className="property-section">
                    <h4>
                      POSITIE <span>ONDERZIJDE · CM</span>
                    </h4>
                    <div className="triple-fields">
                      <NumberField
                        label="X"
                        value={one.position.x}
                        onChange={(n) => editPosition("x", n)}
                        disabled={locked}
                      />
                      <NumberField
                        label="Y"
                        value={one.position.y}
                        onChange={(n) => editPosition("y", n)}
                        disabled={locked || !freeHeight}
                      />
                      <NumberField
                        label="Z"
                        value={one.position.z}
                        onChange={(n) => editPosition("z", n)}
                        disabled={locked}
                      />
                    </div>
                    <label className="toggle-row">
                      <input
                        type="checkbox"
                        checked={freeHeight}
                        onChange={(e) => setFreeHeight(e.target.checked)}
                      />
                      <span>Vrije hoogte bewerken</span>
                    </label>
                    <button
                      className="text-button"
                      disabled={locked}
                      onClick={() => updateOne((o) => (o.position.y = 0))}
                    >
                      Plaats op de vloer
                    </button>
                    <NumberField
                      label="Draaiing Y"
                      value={one.rotation}
                      suffix="°"
                      disabled={locked}
                      onChange={(n) => updateOne((o) => (o.rotation = n))}
                    />
                  </div>
                  <div className="property-section">
                    <h4>
                      ONDERDEELDEFINITIE{" "}
                      <span>{def!.unique ? "UNIEK" : "GEDEELD"}</span>
                    </h4>
                    <div className="shared-info">
                      <Copy size={14} />
                      {
                        p.objects.filter((o) => o.definitionId === def!.id)
                          .length
                      }{" "}
                      gekoppelde exemplaren
                    </div>
                    <p className="fine-print">
                      Maatwijzigingen gelden voor alle exemplaren van deze
                      definitie.
                    </p>
                    <div className="triple-fields">
                      <NumberField
                        label="Breedte"
                        value={def!.size.x}
                        min={1}
                        max={100000}
                        disabled={locked}
                        onChange={(n) => editSize("x", n)}
                      />
                      <NumberField
                        label="Hoogte"
                        value={def!.size.y}
                        min={1}
                        max={100000}
                        disabled={locked}
                        onChange={(n) => editSize("y", n)}
                      />
                      <NumberField
                        label="Diepte"
                        value={def!.size.z}
                        min={1}
                        max={100000}
                        disabled={locked}
                        onChange={(n) => editSize("z", n)}
                      />
                    </div>
                    <button
                      className="button full"
                      disabled={locked}
                      onClick={() => {
                        change((q) => makeUnique(q, [one.id]));
                        announce("Onderdeel heeft nu een eigen definitie");
                      }}
                    >
                      <Copy size={14} />
                      Maak uniek
                    </button>
                  </div>
                  <div className="property-section">
                    <h4>MATERIAAL</h4>
                    <select
                      className="scope-select"
                      aria-label="Materiaal toepassen op"
                      value={materialScope}
                      onChange={(e) => setMaterialScope(e.target.value as any)}
                    >
                      <option value="instance">Alleen dit exemplaar</option>
                      <option value="definition">Gedeelde definitie</option>
                    </select>
                    <div className="material-swatches">
                      {Object.entries(MATERIALS).map(([id, m]) => (
                        <button
                          key={id}
                          title={m.name}
                          aria-label={`Materiaal ${m.name}`}
                          className={
                            effectiveMaterial(p, one) === id ? "active" : ""
                          }
                          style={{ background: m.color }}
                          disabled={locked}
                          onClick={() => {
                            if (materialScope === "instance")
                              updateOne((o) => (o.material = id as MaterialId));
                            else {
                              if (
                                p.objects.some(
                                  (o) =>
                                    o.definitionId === def!.id &&
                                    isLocked(p, o),
                                )
                              ) {
                                announce(
                                  "Gedeelde definitie bevat vergrendelde exemplaren",
                                );
                                return;
                              }
                              change((q) => {
                                const n = clone(q);
                                n.definitions.find(
                                  (d) => d.id === def!.id,
                                )!.material = id as MaterialId;
                                return n;
                              });
                            }
                          }}
                        >
                          {effectiveMaterial(p, one) === id && (
                            <Check size={14} />
                          )}
                        </button>
                      ))}
                    </div>
                    <span className="material-name">
                      {MATERIALS[effectiveMaterial(p, one)].name}
                      {one.material && " · eigen materiaal"}
                    </span>
                    {one.material && (
                      <button
                        className="text-button"
                        disabled={locked}
                        onClick={() => updateOne((o) => delete o.material)}
                      >
                        Gebruik definitiemateriaal
                      </button>
                    )}
                  </div>
                  <div className="property-section">
                    <h4>ORGANISATIE</h4>
                    <label className="labeled-select">
                      Laag
                      <select
                        aria-label="Objectlaag"
                        value={one.tag}
                        disabled={locked}
                        onChange={(e) =>
                          updateOne((o) => (o.tag = e.target.value))
                        }
                      >
                        {p.tags.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="object-actions">
                      <button
                        className="button"
                        disabled={readOnly}
                        onClick={() =>
                          change((q) => {
                            const n = clone(q);
                            n.objects.find((o) => o.id === one.id)!.locked =
                              !one.locked;
                            return n;
                          })
                        }
                      >
                        {one.locked ? (
                          <LockKeyholeOpen size={14} />
                        ) : (
                          <LockKeyhole size={14} />
                        )}{" "}
                        {one.locked ? "Ontgrendel" : "Vergrendel"}
                      </button>
                      <button
                        className="button"
                        disabled={locked}
                        onClick={duplicateSelection}
                      >
                        <Copy size={14} />
                        Kopie
                      </button>
                    </div>
                  </div>
                </>
              )}
              <div className="property-section">
                <h4>
                  ONTWERPCONTROLE{" "}
                  <span className={errors.length ? "error-text" : "ok-text"}>
                    {errors.length ? "ACTIE NODIG" : "BINNEN GRENZEN"}
                  </span>
                </h4>
                <div
                  className={
                    "validation-card " + (issues.length ? "warning" : "")
                  }
                >
                  <span>
                    {issues.length ? (
                      <AlertTriangle size={17} />
                    ) : (
                      <CheckCircle2 size={17} />
                    )}
                  </span>
                  <div>
                    <strong>
                      {issues.length
                        ? `${errors.length} fouten · ${issues.length - errors.length} waarschuwingen`
                        : "Alle onderdelen passen"}
                    </strong>
                    <p>
                      {issues.length
                        ? "Bekijk maat- en overlapmeldingen."
                        : "Getoetst aan de opgegeven ruimte."}
                    </p>
                  </div>
                </div>
                {issues.length > 0 && (
                  <button
                    className="text-button"
                    onClick={() => setShowIssues(!showIssues)}
                  >
                    {showIssues ? "Verberg meldingen" : "Bekijk meldingen"}{" "}
                    <ChevronDown size={12} />
                  </button>
                )}
                {showIssues && (
                  <div className="issues-list">
                    {issues.slice(0, 30).map((i) => (
                      <button
                        key={i.id}
                        onClick={() => i.objectId && pick([i.objectId])}
                        className={i.severity}
                      >
                        {i.message}
                      </button>
                    ))}
                  </div>
                )}
                <p className="fine-print">
                  Indicatieve controle. Geen constructieve goedkeuring.
                </p>
              </div>
              <div className="property-section">
                <h4>
                  OPGESLAGEN STANDPUNTEN <span>{p.cameras.length}</span>
                </h4>
                {p.cameras.length ? (
                  p.cameras.map((c) => (
                    <div className="camera-row" key={c.id}>
                      <button onClick={() => api.current?.restore(c)}>
                        <Camera size={13} />
                        {c.name}
                      </button>
                      <button
                        aria-label={`Verwijder ${c.name}`}
                        onClick={() =>
                          change((q) => ({
                            ...q,
                            cameras: q.cameras.filter((v) => v.id !== c.id),
                          }))
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="fine-print">
                    Bewaar je huidige blik met het camera-icoon.
                  </p>
                )}
              </div>
            </div>
            <button className="bom-button" onClick={() => setModal("bom")}>
              <FileSpreadsheet size={17} />
              <span>
                Onderdelenlijst
                <small>
                  {p.objects.length} exemplaren · {counts.length} regels
                </small>
              </span>
              <ChevronRight size={16} />
            </button>
          </aside>
        )}
      </main>
      <footer className="statusbar">
        <div>
          <span className="status-dot" />
          Handmatige editor <i />
          {p.objects.length} onderdelen <i />
          {selected.length
            ? `${selected.length} geselecteerd`
            : "Geen selectie"}
        </div>
        <div>
          <label>
            <Grid2X2 size={12} />
            Snap{" "}
            <select
              aria-label="Rastervastzetten"
              value={snap}
              onChange={(e) => setSnap(Number(e.target.value))}
            >
              <option value="0">Uit</option>
              <option value="1">1 cm</option>
              <option value="5">5 cm</option>
              <option value="10">10 cm</option>
              <option value="25">25 cm</option>
              <option value="100">100 cm</option>
            </select>
          </label>
          <i />
          <span>{freeHeight ? "Vrije hoogte" : "Vloermodus"}</span>
          <i />
          <button onClick={() => setModal("new")}>Nieuw / demo</button>
        </div>
      </footer>
      <input
        type="file"
        accept=".json,application/json,.zip,application/zip"
        ref={file}
        className="hidden"
        onChange={(e) => onImport(e.target.files?.[0])}
      />
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={16} />
          {toast}
          <button aria-label="Melding sluiten" onClick={() => setToast("")}>
            <X size={13} />
          </button>
        </div>
      )}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <section
            className={
              "modal " +
              (modal === "bom" ||
              modal === "server" ||
              modal === "ai" ||
              modal === "media" ||
              modal === "render"
                ? "wide"
                : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "align"
                ? "Demo-uitlijnvlakken verbinden"
                : modal === "render"
                  ? "Blender-renderwachtrij"
                  : modal === "media"
                    ? "Media en projectiecanvas"
                    : modal === "server"
                      ? "Serverprojecten en revisies"
                      : modal === "ai"
                        ? "Ontwerpen met Claude"
                        : modal === "bom"
                          ? "Onderdelenlijst"
                          : modal === "room"
                            ? "Ruimteafmetingen"
                            : modal === "versions"
                              ? "Versiegeschiedenis"
                              : modal === "new"
                                ? "Nieuw ontwerp"
                                : "Bediening en informatie"
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="Dialoog sluiten"
              onClick={() => setModal(null)}
            >
              <X size={20} />
            </button>
            {modal === "align" && (
              <AlignmentPanel
                project={p}
                selected={selected}
                freeHeight={freeHeight}
                readOnly={readOnly}
                onPreview={(preview) => {
                  setAlignmentPreview(preview);
                  setModal(null);
                  setTool("select");
                  setMeasurePoints([]);
                }}
              />
            )}
            {modal === "render" && (
              <RenderPanel
                project={p}
                connection={server.connection}
                state={server.state}
                preset={preset}
                readOnly={readOnly}
                onMessage={announce}
              />
            )}
            {modal === "media" && (
              <MediaPanel
                project={p}
                selected={selected}
                readOnly={readOnly}
                runtime={mediaRuntime}
                version={mediaVersion}
                onChange={change}
                onMessage={announce}
              />
            )}
            {modal === "server" && (
              <ServerPanel
                connection={server.connection}
                state={server.state}
              />
            )}
            {modal === "ai" && (
              <AiPanel
                connection={server.connection}
                state={server.state}
                focusJobId={previewJobId}
                onPreview={(project, id) => {
                  setAlignmentPreview(null);
                  setMeasurePoints([]);
                  setPreviewProject(project);
                  setPreviewJobId(id);
                  setModal(null);
                }}
              />
            )}
            {modal === "help" && (
              <>
                <span className="eyebrow">BOORMESTER STUDIO · PROTOTYPE</span>
                <h2>Van ruimte naar ontwerp.</h2>
                <p>
                  Voeg onderdelen toe uit de bibliotheek. Klik om te selecteren
                  en gebruik de assen of centimeterwaarden om precies te werken.
                </p>
                <div className="help-grid">
                  {[
                    ["V / M / R", "Selecteren / verplaatsen / roteren"],
                    ["Middenmuis", "Rondkijken (Shift = pannen)"],
                    ["Scroll / pinch", "Zoomen"],
                    ["Shift + klik", "Meerdere onderdelen selecteren"],
                    [
                      "Sleep naar rechts",
                      "Alleen volledig omsloten onderdelen",
                    ],
                    ["Sleep naar links", "Ook doorkruiste onderdelen"],
                    ["Ctrl/Cmd + D", "Dupliceren"],
                    ["Ctrl/Cmd + Z", "Ongedaan maken"],
                    ["Ctrl/Cmd + S", "Lokaal herstelpunt bewaren"],
                    ["F", "Selectie of ruimte passend in beeld"],
                    ["Delete / Esc", "Verwijderen / selectie opheffen"],
                  ].map(([a, b]) => (
                    <React.Fragment key={a}>
                      <kbd>{a}</kbd>
                      <span>{b}</span>
                    </React.Fragment>
                  ))}
                </div>
                <p className="fine-print">
                  Op touch: één vinger om rond te kijken, twee om te
                  pannen/zoomen. Gebruik invoervelden voor precies plaatsen. De
                  editor werkt zonder AI-sleutel. Blender is nog niet
                  geïmplementeerd. VR (alleen kijken; duw de stick naar voren en
                  laat los om naar een vrije vloerlocatie te teleporteren) is
                  logica-getest maar nog niet op een echte headset geprobeerd;
                  mediacanvas staat onder Media. Excel bevat een onderdelen- en
                  exemplarenblad; de PDF bevat conceptuele aanzichten op schaal,
                  geen fabricagetekeningen.
                </p>
                <p className="fine-print">
                  Coördinaten: X = lengte, Y = hoogte, Z = diepte. Het nulpunt
                  ligt midden op de vloer; objectposities zijn het midden van de
                  onderzijde.
                </p>
              </>
            )}
            {modal === "room" && (
              <>
                <span className="eyebrow">HARDE ONTWERPGRENZEN</span>
                <h2>Ruimteafmetingen</h2>
                <p>
                  Alle fysieke onderdelen worden aan deze grenzen getoetst. Een
                  wijziging verplaatst of verkleint geen enkel onderdeel.
                </p>
                <div className="room-form">
                  {(["length", "depth", "height"] as const).map((k, i) => (
                    <NumberField
                      key={k}
                      label={["Lengte X", "Diepte Z", "Hoogte Y"][i]}
                      value={p.room[k]}
                      min={10}
                      max={100000}
                      disabled={readOnly}
                      onChange={(n) =>
                        change((q) => ({ ...q, room: { ...q.room, [k]: n } }))
                      }
                    />
                  ))}
                </div>
                <p className="fine-print">
                  Demo-aanname: hoogte 300 cm. Vervang dit door de gemeten
                  hoogte.
                </p>
                <button
                  className="button primary"
                  onClick={() => setModal(null)}
                >
                  Terug naar ontwerp
                </button>
              </>
            )}
            {modal === "bom" && (
              <>
                <span className="eyebrow">SCÈNE → ONDERDELEN</span>
                <h2>Onderdelenlijst</h2>
                <p>
                  {p.objects.length} exemplaren, gegroepeerd op definitie,
                  materiaal en groep. Verborgen onderdelen tellen ook mee.
                </p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        {[
                          "Onderdeel",
                          "Code",
                          "Aantal",
                          "Maten (cm)",
                          "Materiaal",
                          "Status",
                        ].map((v) => (
                          <th key={v}>{v}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {counts.map((r, i) => (
                        <tr key={i}>
                          <td>{r.description}</td>
                          <td>
                            <code>{r.code}</code>
                          </td>
                          <td>
                            <strong>{r.quantity}</strong>
                          </td>
                          <td>
                            {r.size.x} × {r.size.y} × {r.size.z}
                          </td>
                          <td>{MATERIALS[r.material].name}</td>
                          <td>{r.status}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Totaal exemplaren</td>
                        <td>{counts.reduce((n, r) => n + r.quantity, 0)}</td>
                        <td colSpan={3} />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="modal-bottom">
                  <span className="fine-print">
                    XLSX met exemplaardetails · CSV als alternatief.
                  </span>
                  <div className="export-options">
                    <button
                      className="button"
                      onClick={() =>
                        download(
                          "boormester-onderdelen.csv",
                          bomCsv(p),
                          "text/csv;charset=utf-8",
                        )
                      }
                    >
                      <Download size={15} />
                      CSV
                    </button>
                    <button
                      className="button primary"
                      disabled={exportBusy}
                      onClick={exportXlsx}
                    >
                      <FileSpreadsheet size={15} />
                      Download Excel
                    </button>
                  </div>
                </div>
              </>
            )}
            {modal === "versions" && (
              <>
                <span className="eyebrow">LOKALE HERSTELPUNTEN</span>
                <h2>Versiegeschiedenis</h2>
                <p>
                  Bewaar maximaal tien herstelpunten in deze browser. Download
                  JSON om een ontwerp naar je laptop te verplaatsen.
                </p>
                <button
                  className="button primary"
                  disabled={readOnly}
                  onClick={() => snapshot()}
                >
                  <Save size={15} />
                  Huidige versie bewaren
                </button>
                <div className="versions-list">
                  {versions.length ? (
                    versions.map((v, i) => (
                      <div key={v.time}>
                        <div>
                          <strong>{v.project.name}</strong>
                          <small>
                            {new Date(v.time).toLocaleString("nl-NL")} ·{" "}
                            {v.project.objects.length} onderdelen
                          </small>
                        </div>
                        <button
                          className="button"
                          disabled={readOnly}
                          onClick={() => {
                            try {
                              const next = parseProject(
                                JSON.stringify(v.project),
                              );
                              snapshot();
                              change(next);
                              setSelected([]);
                              setModal(null);
                              announce("Herstelpunt teruggezet");
                            } catch {
                              announce("Dit herstelpunt is ongeldig.");
                            }
                          }}
                        >
                          Herstel
                        </button>
                      </div>
                    ))
                  ) : (
                    <p>
                      Nog geen herstelpunten. Je huidige ontwerp wordt wel
                      automatisch lokaal opgeslagen.
                    </p>
                  )}
                </div>
              </>
            )}
            {modal === "new" && (
              <>
                <span className="eyebrow">BEGIN OPNIEUW</span>
                <h2>Nieuw ontwerp</h2>
                <p>
                  Je huidige ontwerp wordt eerst als lokaal herstelpunt bewaard.
                </p>
                <div className="new-options">
                  <button
                    className="button"
                    disabled={readOnly}
                    onClick={() => {
                      snapshot();
                      change(emptyProject());
                      setSelected([]);
                      setModal(null);
                    }}
                  >
                    <Plus size={18} />
                    Lege ruimte
                  </button>
                  <button
                    className="button primary"
                    disabled={readOnly}
                    onClick={() => {
                      snapshot();
                      change(demoProject());
                      setSelected([]);
                      setModal(null);
                    }}
                  >
                    <Box size={18} />
                    Laad 4 × 8 m demo
                  </button>
                  <button
                    className="button"
                    disabled={readOnly}
                    onClick={() => {
                      snapshot();
                      change(mediaDemoProject());
                      setSelected([]);
                      setModal(null);
                    }}
                  >
                    <Clapperboard size={18} />
                    Laad hoekcanvas-demo (90°)
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
