import { useEffect, useState } from "react";
import {
  Database,
  RefreshCw,
  Save,
  FolderOpen,
  History,
  CloudOff,
  Sparkles,
  Check,
  Eye,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import type { Project } from "./model";
import type {
  ProjectConnection,
  ConnectionState,
  RemoteJob,
} from "./serverClient";
const money = (micros: number) =>
  new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(micros / 1e6);
const status: Record<string, string> = {
  local: "Lokale kopie",
  connecting: "Verbinden…",
  connected: "Server verbonden",
  offline: "Verbinding onderbroken",
  conflict: "Nieuwere serverversie",
  locked: "Bewerking vergrendeld",
};
const jobStatus: Record<string, string> = {
  quoted: "Kostenraming",
  running: "Claude is bezig",
  proposed: "Voorstel ter beoordeling",
  applied: "Toegepast",
  rejected: "Verworpen",
  failed: "Aanvraag mislukt",
  uncertain: "Verbruik onzeker",
  reconciled: "Verbruik gereconcilieerd",
};
interface BaseProps {
  connection: ProjectConnection;
  state: ConnectionState;
}
export function ServerPanel({ connection, state }: BaseProps) {
  const [access, setAccess] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Serveractie mislukt.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run(() => connection.refresh());
  }, []);
  return (
    <>
      <span className="eyebrow">PROJECTEN EN REVISIES</span>
      <h2>Bewaren op je eigen server</h2>
      <p>
        Bewaar ontwerpen en eerdere revisies in de lokale Studio-server. De
        handmatige editor werkt ook met alleen een lokale kopie.
      </p>
      <div className={"connection-card " + state.mode}>
        <Database size={22} />
        <div>
          <strong>{status[state.mode]}</strong>
          <small>
            {state.revision
              ? `Serverrevisie ${state.revision}${state.dirty ? " · lokale wijzigingen wachten op opslag" : ""}`
              : "Nog geen serverproject verbonden"}
          </small>
        </div>
        {state.mode === "connected" && <span className="server-dot" />}
      </div>
      {state.message && <p className="panel-message">{state.message}</p>}
      {error && (
        <div className="panel-error" role="alert">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}
      {state.projectId &&
        ["locked", "conflict", "offline"].includes(state.mode) && (
          <div className="connection-recovery">
            <p>
              Je lokale ontwerp blijft bewaard. Laden of overnemen opent de
              laatste serverversie; er wordt eerst een lokaal herstelpunt
              gemaakt.
            </p>
            <div className="panel-actions">
              <button
                className="button"
                disabled={busy}
                onClick={() => run(() => connection.open(state.projectId!))}
              >
                <FolderOpen size={14} />
                Serverversie laden
              </button>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(() => connection.open(state.projectId!, true))
                }
              >
                Bewerking overnemen
              </button>
            </div>
          </div>
        )}
      <div className="panel-actions">
        <button
          className="button primary"
          disabled={busy || state.mode === "connecting"}
          onClick={() =>
            run(() =>
              state.mode === "connected"
                ? connection.save("Handmatig bewaard")
                : connection.createCurrent(),
            )
          }
        >
          <Save size={15} />
          {state.mode === "connected"
            ? "Nu op server bewaren"
            : "Huidig ontwerp bewaren"}
        </button>
        {state.projectId && (
          <button
            className="button"
            disabled={busy}
            onClick={() => run(() => connection.disconnect())}
          >
            <CloudOff size={14} />
            Verder lokaal
          </button>
        )}
        <button
          className="button subtle"
          disabled={busy}
          onClick={() => run(() => connection.refresh())}
        >
          <RefreshCw size={14} />
          Vernieuw
        </button>
      </div>
      {state.pendingExisting && (
        <div className="connection-recovery">
          <p>
            Dit project bestaat al. Kies de serverversie of bewaar je huidige
            ontwerp als een nieuw project.
          </p>
          <div className="panel-actions">
            <button
              className="button"
              disabled={busy}
              onClick={() => run(() => connection.open(state.pendingExisting!))}
            >
              Serverversie openen
            </button>
            <button
              className="button"
              disabled={busy}
              onClick={() => run(() => connection.createCurrent(true))}
            >
              Bewaar als nieuw project
            </button>
          </div>
        </div>
      )}
      {!state.projectId && (
        <details className="access-details">
          <summary>Toegangscode voor een afgeschermde server</summary>
          <label>
            Toegangscode
            <input
              type="password"
              autoComplete="off"
              value={access}
              onChange={(e) => setAccess(e.target.value)}
              placeholder="Alleen indien ingesteld op jouw server"
            />
          </label>
          <button
            className="button"
            disabled={busy}
            onClick={() => run(() => connection.refresh(access))}
          >
            Verbind met toegangscode
          </button>
          <p>
            De code blijft alleen in het geheugen van deze tab. Dit is geen
            Claude API-sleutel.
          </p>
        </details>
      )}
      <div className="server-projects">
        <h3>
          Projecten op deze server <span>{state.projects.length}</span>
        </h3>
        {state.projects.length ? (
          state.projects.map((p) => (
            <div key={p.id} className="server-project-row">
              <div>
                <strong>{p.name}</strong>
                <small>
                  Revisie {p.revision} ·{" "}
                  {new Date(p.updatedAt).toLocaleString("nl-NL")}
                </small>
              </div>
              <button
                className="button"
                disabled={busy}
                onClick={() => run(() => connection.open(p.id))}
              >
                Open
              </button>
            </div>
          ))
        ) : (
          <p className="fine-print">
            Nog geen serverprojecten gevonden. Start de applicatie op je laptop
            met npm run dev.
          </p>
        )}
      </div>
      {!!state.revisions.length && (
        <div className="server-revisions">
          <h3>
            <History size={16} />
            Revisies van dit project
          </h3>
          {state.revisions.slice(0, 20).map((r) => (
            <div key={r.revision} className="server-project-row">
              <div>
                <strong>
                  Revisie {r.revision} · {r.note}
                </strong>
                <small>
                  {new Date(r.createdAt).toLocaleString("nl-NL")} · {r.source}
                </small>
              </div>
              <button
                className="button"
                disabled={
                  busy ||
                  state.mode !== "connected" ||
                  r.revision === state.revision
                }
                onClick={() => run(() => connection.restore(r.revision))}
              >
                Herstel
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
export function AiPanel({
  connection,
  state,
  onPreview,
  focusJobId,
}: BaseProps & {
  onPreview: (p: Project, jobId: string) => void;
  focusJobId?: string | null;
}) {
  const [prompt, setPrompt] = useState(""),
    [model, setModel] = useState("auto"),
    [limit, setLimit] = useState(
      state.budget ? String(state.budget.limitMicros / 1e6) : "1",
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [activeId, setActiveId] = useState(focusJobId ?? state.jobs[0]?.id ?? ""),
    [approveRoom, setApproveRoom] = useState(false),
    [reconcileAmount, setReconcileAmount] = useState(""),
    [reconcileNote, setReconcileNote] = useState("");
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claude-actie mislukt.");
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (state.mode === "connected")
      run(async () => {
        await connection.details();
        if (activeId) {
          const item = connection.state.jobs.find((j) => j.id === activeId);
          if (item?.status === "proposed" && !item.candidate)
            await connection.loadJob(activeId);
        }
      });
  }, []);
  const ready = state.mode === "connected",
    configured = !!(
      state.ai?.configured &&
      state.ai.enabled &&
      !state.ai.pricingStale
    ),
    job = state.jobs.find((j) => j.id === activeId);
  const budget = state.budget;
  const quote = () =>
    run(async () => {
      const q = await connection.quote(prompt, model);
      setActiveId(q.id);
      setApproveRoom(false);
    });
  return (
    <>
      <span className="eyebrow">CONVERSATIONEEL ONTWERPEN</span>
      <h2>Ontwerp samen met Claude</h2>
      <p>
        Beschrijf een wijziging. Bekijk eerst de kostenraming en beoordeel
        daarna het voorstel. De scène verandert pas wanneer je het voorstel
        toepast.
      </p>
      {!ready && (
        <div className="panel-error">
          <Database size={16} />
          Verbind eerst een project via de knop ‘Server’ in de editor.
        </div>
      )}
      {ready && !configured && (
        <div className="ai-setup">
          <Sparkles size={20} />
          <div>
            <strong>
              {state.ai?.pricingStale
                ? "Tarieven moeten opnieuw worden gecontroleerd"
                : "Claude is nog niet ingeschakeld"}
            </strong>
            <p>
              {state.ai?.pricingStale
                ? "De serversnapshot is ouder dan 30 dagen. Controleer de officiële prijslijst voordat je nieuwe aanvragen uitvoert."
                : "Stel de Claude API-sleutel in op je server en zet STUDIO_ENABLE_AI op 1. Je sleutel komt niet in de browser of in het projectbestand."}
            </p>
            <small>
              Dit gebruikt de Claude API. API-verbruik staat los van een
              Claude-abonnement.
            </small>
          </div>
        </div>
      )}
      {error && (
        <div className="panel-error" role="alert">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}
      <div className="ai-budget">
        <div>
          <span>PROJECTBUDGET</span>
          <strong>{budget ? money(budget.limitMicros) : "—"}</strong>
        </div>
        <div>
          <span>BEREKEND VERBRUIK</span>
          <strong>{budget ? money(budget.spentMicros) : "—"}</strong>
        </div>
        <div>
          <span>GERESERVEERD</span>
          <strong>{budget ? money(budget.reservedMicros) : "—"}</strong>
        </div>
      </div>
      {budget?.warning && (
        <p className="budget-warning">
          80% of meer van het budget is gebruikt of gereserveerd. Nieuwe
          aanvragen boven de resterende ruimte worden geblokkeerd.
        </p>
      )}
      <div className="budget-config">
        <label>
          Budgetlimiet in USD
          <input
            type="number"
            min="0"
            max="10000"
            step="0.1"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
          />
        </label>
        <button
          className="button"
          disabled={!ready || busy}
          onClick={() =>
            run(() => {
              const n = Number(limit);
              if (!Number.isFinite(n) || n < 0)
                throw Error("Vul een geldig budget in.");
              return connection.setBudget(Math.round(n * 1e6));
            })
          }
        >
          Stel budget in
        </button>
      </div>
      <label className="ai-model">
        Claude-model
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={busy}
        >
          <option value="auto">
            Automatisch (past model aan de opdracht aan)
          </option>
          {(state.ai?.models ?? [{ id: "claude-sonnet-5-5" }]).map((m) => (
            <option key={m.id} value={m.id}>
              {m.id}
            </option>
          ))}
        </select>
      </label>
      {state.ai && (
        <p className="pricing-note">
          {(() => {
            const p = state.ai.models.find((m) => m.id === model)?.pricing;
            return p
              ? `USD ${p.input} input / USD ${p.output} output per miljoen tokens. `
              : "";
          })()}
          <a href={state.ai.pricingSource} target="_blank" rel="noreferrer">
            Officiële tarieven
          </a>{" "}
          · gecontroleerd{" "}
          {new Date(state.ai.pricingVerifiedAt).toLocaleDateString("nl-NL")}.
          Beschikbaarheid wordt bij de aanvraag geverifieerd.
        </p>
      )}
      <label className="ai-prompt">
        Wat wil je aan het ontwerp veranderen?
        <textarea
          rows={4}
          value={prompt}
          maxLength={6000}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Bijvoorbeeld: maak de tafel uniek en verplaats hem 25 cm naar rechts. Houd alle onderdelen binnen de ruimte."
          disabled={busy}
        />
      </label>
      <div className="panel-actions">
        <button
          className="button primary"
          disabled={!ready || !configured || busy || !prompt.trim()}
          onClick={quote}
        >
          <Sparkles size={15} />
          {busy ? "Even bezig…" : "Maak kostenraming"}
        </button>
        <small className="fine-print">
          De raming stuurt je vraag en compacte scènegegevens naar Claude.
        </small>
      </div>
      {job && (
        <div className="ai-proposal">
          <div className="proposal-title">
            <span>{jobStatus[job.status] ?? job.status}</span>
            <small>
              {job.model} · revisie {job.baseRevision}
            </small>
          </div>
          {job.status === "quoted" ? (
            <>
              <p>
                Maximale geraamde aanvraag:{" "}
                <strong>{money(job.quotedMicros)}</strong>, inclusief
                uitvoerlimiet en een invoermarge. Een raming is geen factuur.
              </p>
              <p className="fine-print">
                {job.inputTokens.toLocaleString("nl-NL")} geraamde inputtokens ·
                maximaal {job.maxOutput} outputtokens · geldig tot{" "}
                {new Date(job.expiresAt).toLocaleTimeString("nl-NL")}.
              </p>
              <button
                className="button primary"
                disabled={
                  busy ||
                  !configured ||
                  !ready ||
                  !budget ||
                  budget.remainingMicros < job.quotedMicros
                }
                onClick={() => run(() => connection.run(job.id))}
              >
                Vraag Claude om voorstel
              </button>
              {budget && budget.remainingMicros < job.quotedMicros && (
                <p className="budget-warning">
                  Onvoldoende ruimte in het ingestelde budget.
                </p>
              )}
            </>
          ) : (
            <>
              {job.proposal && (
                <>
                  <h3>{job.proposal.summary}</h3>
                  {job.proposal.questions.length > 0 && (
                    <div className="clarification">
                      <strong>Claude vraagt om verduidelijking</strong>
                      {job.proposal.questions.map((q, i) => (
                        <p key={i}>{q}</p>
                      ))}
                      <small>
                        Beantwoord dit in het opdrachtveld en maak een nieuwe
                        raming.
                      </small>
                    </div>
                  )}
                  <div className="operation-list">
                    {job.proposal.operations.map((o, i) => (
                      <div key={i}>
                        <span>{i + 1}</span>
                        <code>{operationLabel(o)}</code>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {job.message && <p className="panel-message">{job.message}</p>}
              {job.candidate?.issues
                .filter((i) => i.severity === "error")
                .map((i, k) => (
                  <p className="budget-warning" key={k}>
                    {i.message}
                  </p>
                ))}
              {job.candidate?.roomChanged && (
                <label className="room-approval">
                  <input
                    type="checkbox"
                    checked={approveRoom}
                    onChange={(e) => setApproveRoom(e.target.checked)}
                  />
                  Ik keur de voorgestelde nieuwe ruimteafmetingen goed.
                </label>
              )}
              {job.status === "proposed" && (
                <div className="panel-actions">
                  <button
                    className="button"
                    disabled={busy || !job.candidate}
                    onClick={() =>
                      job.candidate && onPreview(job.candidate.project, job.id)
                    }
                  >
                    <Eye size={14} />
                    Bekijk in 3D
                  </button>
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      !ready ||
                      !job.candidate?.canApply ||
                      state.dirty ||
                      (job.candidate.roomChanged && !approveRoom) ||
                      job.baseRevision !== state.revision
                    }
                    onClick={() =>
                      run(() => connection.apply(job.id, approveRoom))
                    }
                  >
                    <Check size={14} />
                    Pas voorstel toe
                  </button>
                  <button
                    className="button"
                    disabled={busy || !ready}
                    onClick={() => run(() => connection.reject(job.id))}
                  >
                    <Trash2 size={14} />
                    Verwerp
                  </button>
                </div>
              )}
              {job.costMicros > 0 && (
                <p className="pricing-note">
                  Berekende gebruikskosten: {money(job.costMicros)} ·{" "}
                  {job.usage?.input_tokens ?? "—"} input /{" "}
                  {job.usage?.output_tokens ?? "—"} outputtokens. Definitieve
                  afrekening gebeurt door de API-aanbieder.
                </p>
              )}
              {job.status === "uncertain" && (
                <>
                  <div className="panel-error">
                    <AlertTriangle size={15} />
                    De verbinding eindigde zonder betrouwbaar verbruik. De
                    reservering blijft meetellen; er wordt niet automatisch
                    opnieuw aangevraagd.
                  </div>
                  <details className="access-details">
                    <summary>
                      Verbruik controleren en reservering afwikkelen
                    </summary>
                    <p>
                      Controleer eerst het verbruik bij je API-aanbieder. Leg
                      hieronder de gecontroleerde kosten vast; dit verstuurt
                      geen nieuwe AI-aanvraag.
                    </p>
                    <label>
                      Gecontroleerde kosten in USD
                      <input
                        type="number"
                        min="0"
                        step="0.000001"
                        value={reconcileAmount}
                        onChange={(e) => setReconcileAmount(e.target.value)}
                      />
                    </label>
                    <label>
                      Toelichting en bron
                      <input
                        value={reconcileNote}
                        maxLength={1000}
                        onChange={(e) => setReconcileNote(e.target.value)}
                        placeholder="Bijvoorbeeld: gebruiksoverzicht van de API-aanbieder gecontroleerd"
                      />
                    </label>
                    <button
                      className="button"
                      disabled={
                        busy ||
                        !ready ||
                        reconcileAmount.trim() === "" ||
                        reconcileNote.trim().length < 5
                      }
                      onClick={() =>
                        run(() => {
                          const amount = Number(reconcileAmount);
                          if (!Number.isFinite(amount) || amount < 0)
                            throw Error("Vul een geldig bedrag in.");
                          return connection.reconcile(
                            job.id,
                            Math.round(amount * 1e6),
                            reconcileNote,
                          );
                        })
                      }
                    >
                      Registreer gecontroleerd verbruik
                    </button>
                  </details>
                </>
              )}
            </>
          )}
        </div>
      )}
      {state.jobs.length > 0 && (
        <div className="ai-job-history">
          <h3>Activiteit in dit project</h3>
          {state.jobs.map((j) => (
            <button
              key={j.id}
              className={activeId === j.id ? "selected" : ""}
              onClick={() => {
                setActiveId(j.id);
                setApproveRoom(false);
                if (j.status === "proposed" && !j.candidate)
                  run(() => connection.loadJob(j.id));
              }}
            >
              <span>
                {jobStatus[j.status] ?? j.status}
                <small>{j.proposal?.summary ?? j.message ?? j.model}</small>
              </span>
              <small>{new Date(j.createdAt).toLocaleTimeString("nl-NL")}</small>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
function operationLabel(
  o: NonNullable<RemoteJob["proposal"]>["operations"][number],
) {
  switch (o.type) {
    case "add":
      return `Plaats ${o.name} op X ${o.position.x}, Y ${o.position.y}, Z ${o.position.z} cm`;
    case "transform":
      return `Verplaats ${o.id.slice(0, 8)} → (${o.position.x}, ${o.position.y}, ${o.position.z}) cm, draai ${o.rotation}°`;
    case "remove":
      return `Verwijder ${o.ids.length} exemplaren`;
    case "make_unique":
      return `Maak ${o.ids.length} exemplaren uniek`;
    case "resize_definition":
      return `Gedeelde maat ${o.id.slice(0, 8)} → ${o.size.x} × ${o.size.y} × ${o.size.z} cm`;
    case "material":
      return `Materiaal ${o.material} op ${o.scope === "instance" ? "exemplaar" : "gedeelde definitie"}`;
    case "room":
      return `Ruimte → ${o.length} × ${o.depth} × ${o.height} cm`;
  }
}
