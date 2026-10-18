import { uid, clone } from "./model.ts";
import type { Project } from "./model.ts";
import type { SceneProposal } from "./operations.ts";
export type ConnectionMode =
  "local" | "connecting" | "connected" | "offline" | "conflict" | "locked";
export interface ServerDocument {
  project: Project;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ServerSummary {
  id: string;
  name: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface ServerRevision {
  revision: number;
  note: string;
  source: string;
  createdAt: string;
}
export interface Budget {
  limitMicros: number;
  spentMicros: number;
  reservedMicros: number;
  remainingMicros: number;
  warning: boolean;
}
export interface AiStatus {
  enabled: boolean;
  configured: boolean;
  pricingSource: string;
  pricingVerifiedAt: string;
  pricingStale: boolean;
  models: {
    id: string;
    availability: string;
    pricing: {
      input: number;
      output: number;
      verifiedAt: string;
      source: string;
    };
  }[];
}
export interface RemoteJob {
  id: string;
  projectId: string;
  baseRevision: number;
  model: string;
  status: string;
  quotedMicros: number;
  reservedMicros: number;
  costMicros: number;
  inputTokens: number;
  maxOutput: number;
  proposal: SceneProposal | null;
  candidate: {
    project: Project;
    issues: { severity: string; message: string }[];
    roomChanged: boolean;
    canApply: boolean;
  } | null;
  usage: { input_tokens: number; output_tokens: number } | null;
  message: string;
  createdAt: string;
  expiresAt: number;
}
export class ServerRequestError extends Error {
  status: number;
  code: string;
  details: any;
  constructor(status: number, value: any) {
    super(value?.message ?? "Server niet bereikbaar.");
    this.status = status;
    this.code = value?.error ?? "server_error";
    this.details = value;
  }
}
export class StudioClient {
  csrf = "";
  accessCode = "";
  clientId = uid();
  fetcher: typeof fetch;
  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }
  async session() {
    const result = await this.request<{
      csrf: string;
      ai: AiStatus;
      vaultWarning: string;
    }>("/session", "GET", undefined, undefined, true);
    this.csrf = result.csrf;
    return result;
  }
  async request<T = any>(
    path: string,
    method = "GET",
    body?: unknown,
    lease?: string,
    skipSession = false,
  ): Promise<T> {
    if (!skipSession && !this.csrf) await this.session();
    let r: Response;
    try {
      r = await this.fetcher("/api" + path, {
        method,
        credentials: "same-origin",
        headers: {
          "x-studio-client": this.clientId,
          ...(this.accessCode ? { "x-studio-access": this.accessCode } : {}),
          ...(this.csrf ? { "x-studio-csrf": this.csrf } : {}),
          ...(lease ? { "x-studio-lease": lease } : {}),
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(path.endsWith("/run") ? 75000 : 65000),
      });
    } catch {
      throw new ServerRequestError(0, {
        error: "offline",
        message:
          "Serververbinding ontbreekt. Je lokale wijzigingen blijven bewaard.",
      });
    }
    let value: any;
    try {
      value = await r.json();
    } catch {
      throw new ServerRequestError(r.status, {
        error: "not_available",
        message:
          "Studio-server is niet beschikbaar. Start op je laptop met npm run dev.",
      });
    }
    if (!r.ok) throw new ServerRequestError(r.status, value);
    return value as T;
  }
}
export const contentFingerprint = (p: Project) =>
  JSON.stringify({ ...p, updatedAt: "" });
export interface ConnectionState {
  mode: ConnectionMode;
  projectId: string | null;
  revision: number | null;
  saving: boolean;
  dirty: boolean;
  message: string;
  projects: ServerSummary[];
  revisions: ServerRevision[];
  ai: AiStatus | null;
  budget: Budget | null;
  jobs: RemoteJob[];
  pendingExisting: string | null;
}
/** One serial save queue, a revision lease and an explicit conflict state. Local changes are never auto-replaced on a conflict. */
export class ProjectConnection {
  client: StudioClient;
  state: ConnectionState = {
    mode: "local",
    projectId: null,
    revision: null,
    saving: false,
    dirty: false,
    message: "",
    projects: [],
    revisions: [],
    ai: null,
    budget: null,
    jobs: [],
    pendingExisting: null,
  };
  current: Project;
  onLoad: (p: Project) => void;
  listeners = new Set<() => void>();
  leaseToken = "";
  savedFingerprint = "";
  generation = 0;
  queue: Promise<unknown> = Promise.resolve();
  constructor(
    project: Project,
    onLoad: (p: Project) => void,
    client = new StudioClient(),
  ) {
    this.current = project;
    this.onLoad = onLoad;
    this.client = client;
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  update(patch: Partial<ConnectionState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
  setCurrent(p: Project) {
    this.current = p;
    if (this.state.projectId && p.id !== this.state.projectId) {
      this.disconnect(
        "Nieuw lokaal project. Verbind opnieuw om het op de server te bewaren.",
      );
      return;
    }
    const dirty =
      !!this.state.projectId && contentFingerprint(p) !== this.savedFingerprint;
    if (dirty !== this.state.dirty) this.update({ dirty });
  }
  error(error: unknown) {
    const e =
      error instanceof ServerRequestError
        ? error
        : new ServerRequestError(0, {
            message:
              error instanceof Error ? error.message : "Serveractie mislukt.",
          });
    const mode: eMode =
      e.status === 423
        ? "locked"
        : e.status === 409
          ? "conflict"
          : this.state.projectId
            ? "offline"
            : "local";
    this.update({ mode, message: e.message, saving: false });
    return e;
  }
  async refresh(accessCode?: string) {
    if (accessCode !== undefined) {
      if (this.state.projectId)
        throw Error("Ontkoppel eerst voordat je de toegangscode wijzigt.");
      this.client.accessCode = accessCode;
      this.client.csrf = "";
    }
    try {
      const session = await this.client.session();
      const list = await this.client.request<{ projects: ServerSummary[] }>(
        "/projects",
      );
      this.update({
        projects: list.projects,
        ai: session.ai,
        message: session.vaultWarning
          ? "Project opgeslagen; kennislog heeft een schrijffout."
          : "",
      });
      return list.projects;
    } catch (e) {
      throw this.error(e);
    }
  }
  path(id = this.state.projectId) {
    if (!id) throw Error("Verbind eerst met een serverproject.");
    return "/projects/" + encodeURIComponent(id);
  }
  async attach(document: ServerDocument, takeover = false) {
    const path = this.path(document.project.id);
    const lease = await this.client.request<{
      token: string;
      expiresAt: number;
    }>(path + "/lease", "POST", { takeover });
    this.leaseToken = lease.token;
    this.savedFingerprint = contentFingerprint(document.project);
    this.current = document.project;
    this.generation++;
    this.update({
      mode: "connected",
      projectId: document.project.id,
      revision: document.revision,
      dirty: false,
      saving: false,
      message: "Serverproject verbonden.",
      pendingExisting: null,
      revisions: [],
      budget: null,
      jobs: [],
    });
    this.onLoad(document.project);
    await this.details();
    return document;
  }
  async createCurrent(copy = false) {
    // Drain, don't inherit: this.queue holds the last save's promise, so a
    // rejected background save would otherwise reject this call with the
    // previous error before it does anything.
    await this.settled();
    const original = this.current;
    const project = clone(original);
    if (copy) {
      project.id = uid();
      project.name += " · kopie";
    }
    await this.disconnect();
    this.update({
      mode: "connecting",
      message: "Project op server bewaren…",
      pendingExisting: null,
    });
    try {
      await this.refresh();
      const doc = await this.client.request<ServerDocument>(
        "/projects",
        "POST",
        { project },
      );
      return await this.attach(doc);
    } catch (e) {
      if (e instanceof ServerRequestError && e.code === "exists") {
        this.update({
          mode: "local",
          pendingExisting: project.id,
          message: e.message,
        });
      } else this.error(e);
      throw e;
    }
  }
  async open(id: string, takeover = false) {
    if (this.state.mode === "connected" && this.state.dirty) await this.flush();
    await this.settled();
    await this.disconnect();
    this.update({ mode: "connecting", message: "Serverproject openen…" });
    try {
      await this.client.session();
      let document = await this.client.request<ServerDocument>(this.path(id));
      if (takeover) {
        const lease = await this.client.request<{ token: string }>(
          this.path(id) + "/lease",
          "POST",
          { takeover: true },
        );
        this.leaseToken = lease.token;
        document = await this.client.request<ServerDocument>(this.path(id));
      }
      return await this.attach(document, takeover);
    } catch (e) {
      this.update({ projectId: id });
      throw this.error(e);
    }
  }
  disconnect(message = "Je werkt verder in de lokale kopie.") {
    const id = this.state.projectId,
      token = this.leaseToken;
    this.generation++;
    this.leaseToken = "";
    this.savedFingerprint = "";
    this.update({
      mode: "local",
      projectId: null,
      revision: null,
      dirty: false,
      saving: false,
      message,
      revisions: [],
      budget: null,
      jobs: [],
      pendingExisting: null,
    });
    if (id && token)
      return this.client
        .request(this.path(id) + "/lease", "DELETE", {}, token)
        .catch(() => {});
    return Promise.resolve();
  }
  /** Modes that still hold a project and may recover on their own. */
  live() {
    return this.state.mode === "connected" || this.state.mode === "offline";
  }
  async heartbeat() {
    // Runs in "offline" too. It used to stop there, so one transient failure
    // let the 30s server lease expire and the session never came back.
    if (!this.live() || !this.state.projectId) return;
    const generation = this.generation;
    try {
      const l = await this.client.request<{ token: string }>(
        this.path() + "/lease",
        "POST",
        {},
      );
      if (generation !== this.generation) return;
      this.leaseToken = l.token;
      if (this.state.mode === "offline")
        this.update({ mode: "connected", message: "Server weer bereikbaar." });
    } catch (e) {
      if (generation === this.generation) this.error(e);
    }
  }
  /** Waits for the save queue to drain without adopting its rejection. */
  settled() {
    return this.queue.then(
      () => {},
      () => {},
    );
  }
  save(note = "Automatisch bewaard"): Promise<ServerDocument | null> {
    const task = this.queue.catch(() => {}).then(() => this.performSave(note));
    this.queue = task;
    return task;
  }
  async performSave(note: string) {
    // "offline" is a retryable state, not a terminal one: the project, lease
    // and revision are all still held. "conflict" and "locked" are excluded —
    // those need the user to resolve them before a save can succeed.
    if (!this.live() || !this.state.projectId || this.state.revision === null)
      throw Error("Geen actieve serververbinding.");
    const snapshot = clone(this.current);
    if (snapshot.id !== this.state.projectId)
      throw Error("Project is gewisseld.");
    if (contentFingerprint(snapshot) === this.savedFingerprint) return null;
    const generation = this.generation;
    this.update({ saving: true, message: "Op server bewaren…" });
    try {
      const result = await this.client.request<ServerDocument>(
        this.path(),
        "PUT",
        { project: snapshot, expectedRevision: this.state.revision, note },
        this.leaseToken,
      );
      if (generation !== this.generation) return result;
      this.savedFingerprint = contentFingerprint(result.project);
      this.update({
        // A successful write proves the connection is back. Without this the
        // mode set by error() was never cleared by any success path.
        mode: "connected",
        revision: result.revision,
        saving: false,
        dirty: contentFingerprint(this.current) !== this.savedFingerprint,
        message: "Op server opgeslagen.",
      });
      return result;
    } catch (e) {
      if (generation === this.generation) this.error(e);
      throw e;
    }
  }
  async flush() {
    for (let i = 0; i < 5; i++) {
      await this.save();
      if (!this.state.dirty) return;
    }
    throw Error(
      "Ontwerp verandert nog. Rond de bewerking af en probeer opnieuw.",
    );
  }
  async details() {
    if (!this.state.projectId) return;
    const generation = this.generation;
    const path = this.path();
    const [r, b, j] = await Promise.all([
      this.client.request<{ revisions: ServerRevision[] }>(path + "/revisions"),
      this.client.request<Budget>(path + "/budget"),
      this.client.request<{ jobs: RemoteJob[] }>(path + "/ai/jobs"),
    ]);
    if (generation === this.generation)
      this.update({
        revisions: r.revisions,
        budget: b,
        jobs: j.jobs.map((job) => ({
          ...job,
          candidate:
            job.status === "proposed"
              ? (this.state.jobs.find((old) => old.id === job.id)?.candidate ??
                job.candidate)
              : null,
        })),
      });
  }
  async loadJob(id: string) {
    const job = await this.client.request<RemoteJob>("/ai/jobs/" + id);
    this.update({ jobs: this.state.jobs.map((j) => (j.id === id ? job : j)) });
    return job;
  }
  async restore(revision: number) {
    await this.flush();
    try {
      const doc = await this.client.request<ServerDocument>(
        this.path() + "/restore",
        "POST",
        { revision, expectedRevision: this.state.revision },
        this.leaseToken,
      );
      this.savedFingerprint = contentFingerprint(doc.project);
      this.current = doc.project;
      this.update({
        revision: doc.revision,
        dirty: false,
        message: `Hersteld als nieuwe revisie ${doc.revision}.`,
      });
      this.onLoad(doc.project);
      await this.details();
    } catch (e) {
      throw this.error(e);
    }
  }
  async setBudget(limitMicros: number) {
    const result = await this.client.request<Budget>(
      this.path() + "/budget",
      "PUT",
      { limitMicros },
      this.leaseToken,
    );
    this.update({ budget: result });
    return result;
  }
  async quote(prompt: string, model: string) {
    await this.flush();
    const result = await this.client.request<RemoteJob & { budget: Budget }>(
      this.path() + "/ai/quote",
      "POST",
      { prompt, model },
      this.leaseToken,
    );
    this.update({
      budget: result.budget,
      jobs: [result, ...this.state.jobs.filter((j) => j.id !== result.id)],
    });
    return result;
  }
  async run(id: string) {
    const result = await this.client.request<RemoteJob>(
      "/ai/jobs/" + id + "/run",
      "POST",
      {},
      this.leaseToken,
    );
    this.update({
      jobs: [result, ...this.state.jobs.filter((j) => j.id !== id)],
    });
    await this.details();
    return result;
  }
  async apply(id: string, approveRoom: boolean) {
    if (this.state.dirty)
      throw Error(
        "Je ontwerp is gewijzigd sinds het voorstel. Bewaar en vraag een nieuw voorstel.",
      );
    try {
      const doc = await this.client.request<ServerDocument>(
        "/ai/jobs/" + id + "/apply",
        "POST",
        { expectedRevision: this.state.revision, approveRoom },
        this.leaseToken,
      );
      this.savedFingerprint = contentFingerprint(doc.project);
      this.current = doc.project;
      this.update({
        revision: doc.revision,
        dirty: false,
        message: "Claude-voorstel toegepast als nieuwe revisie.",
      });
      this.onLoad(doc.project);
      await this.details();
      return doc;
    } catch (e) {
      if (e instanceof ServerRequestError && e.status === 423) this.error(e);
      throw e;
    }
  }
  async reconcile(id: string, costMicros: number, note: string) {
    const job = await this.client.request<RemoteJob>(
      "/ai/jobs/" + id + "/reconcile",
      "POST",
      { costMicros, note },
      this.leaseToken,
    );
    this.update({ jobs: this.state.jobs.map((j) => (j.id === id ? job : j)) });
    await this.details();
    return job;
  }
  async reject(id: string) {
    const j = await this.client.request<RemoteJob>(
      "/ai/jobs/" + id + "/reject",
      "POST",
      {},
      this.leaseToken,
    );
    this.update({ jobs: this.state.jobs.map((v) => (v.id === id ? j : v)) });
    return j;
  }
}
type eMode = ConnectionMode;
