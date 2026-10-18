import { DatabaseSync } from "node:sqlite";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdirSync, writeFileSync, renameSync } from "node:fs";
import { join, dirname } from "node:path";
import { parseProject, validate } from "../src/model.ts";
import type { Project } from "../src/model.ts";
import { fail } from "./errors.ts";
export interface SavedProject {
  project: Project;
  revision: number;
  createdAt: string;
  updatedAt: string;
}
export interface Lease {
  token: string;
  expiresAt: number;
  holder: string;
}
export interface Job {
  id: string;
  projectId: string;
  baseRevision: number;
  model: string;
  prompt: string;
  status: string;
  quotedMicros: number;
  reservedMicros: number;
  costMicros: number;
  inputTokens: number;
  maxOutput: number;
  pricing: any;
  request: any;
  response: any;
  proposal: any;
  candidate: any;
  usage: any;
  message: string;
  createdAt: string;
  expiresAt: number;
  failureKey: string;
  owner: string;
}
export class ProjectStore {
  db: DatabaseSync;
  clock: () => number;
  vaultRoot?: string;
  vaultError = "";
  constructor(
    path = ":memory:",
    options: { clock?: () => number; vaultRoot?: string } = {},
  ) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    this.clock = options.clock ?? Date.now;
    this.vaultRoot = options.vaultRoot;
    this.db
      .exec(`PRAGMA foreign_keys=ON;PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
   CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,scene TEXT NOT NULL,head INTEGER NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,budget_micros INTEGER NOT NULL DEFAULT 0);
   CREATE TABLE IF NOT EXISTS revisions(project_id TEXT NOT NULL REFERENCES projects(id),revision INTEGER NOT NULL,scene TEXT NOT NULL,note TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(project_id,revision));
   CREATE TABLE IF NOT EXISTS leases(project_id TEXT PRIMARY KEY REFERENCES projects(id),holder TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,project_id TEXT NOT NULL REFERENCES projects(id),kind TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS ai_jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),base_revision INTEGER NOT NULL,model TEXT NOT NULL,prompt TEXT NOT NULL,status TEXT NOT NULL,quoted_micros INTEGER NOT NULL,reserved_micros INTEGER NOT NULL DEFAULT 0,cost_micros INTEGER NOT NULL DEFAULT 0,input_tokens INTEGER NOT NULL,max_output INTEGER NOT NULL,pricing TEXT NOT NULL,request TEXT NOT NULL,response TEXT,proposal TEXT,candidate TEXT,usage TEXT,message TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,expires_at INTEGER NOT NULL,failure_key TEXT NOT NULL,owner TEXT NOT NULL);
   CREATE INDEX IF NOT EXISTS jobs_project ON ai_jobs(project_id,created_at);`);
    // A crashed request may have been billed. Keep its reservation rather than silently refunding it.
    this.db
      .prepare(
        "UPDATE ai_jobs SET status='uncertain',message='Server herstart tijdens provideraanvraag; reservering blijft staan totdat verbruik is gereconcilieerd.' WHERE status='running'",
      )
      .run();
  }
  parse(raw: unknown): Project {
    try {
      return parseProject(JSON.stringify(raw));
    } catch (e) {
      fail(
        400,
        "invalid_project",
        e instanceof Error ? e.message : "Ongeldig project.",
      );
    }
  }
  close() {
    this.db.close();
  }
  timestamp() {
    return new Date(this.clock()).toISOString();
  }
  tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  event(projectId: string, kind: string, message: string) {
    this.db
      .prepare(
        "INSERT INTO events(project_id,kind,message,created_at) VALUES(?,?,?,?)",
      )
      .run(projectId, kind, message.slice(0, 3000), this.timestamp());
  }
  list() {
    return this.db
      .prepare(
        "SELECT id,name,head AS revision,created_at AS createdAt,updated_at AS updatedAt FROM projects ORDER BY updated_at DESC",
      )
      .all();
  }
  get(id: string): SavedProject {
    const r = this.db
      .prepare("SELECT * FROM projects WHERE id=?")
      .get(id) as any;
    if (!r) fail(404, "not_found", "Project bestaat niet.");
    return {
      project: JSON.parse(r.scene),
      revision: r.head,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
  create(raw: unknown, note = "Project aangemaakt"): SavedProject {
    const p = this.parse(raw);
    const time = this.timestamp();
    p.updatedAt = time;
    this.tx(() => {
      if (this.db.prepare("SELECT 1 FROM projects WHERE id=?").get(p.id))
        fail(
          409,
          "exists",
          "Project bestaat al. Open de bestaande serverversie of sla als nieuw project op.",
        );
      this.db
        .prepare(
          "INSERT INTO projects(id,name,scene,head,created_at,updated_at) VALUES(?,?,?,1,?,?)",
        )
        .run(p.id, p.name, JSON.stringify(p), time, time);
      this.db
        .prepare("INSERT INTO revisions VALUES(?,1,?,?,?,?)")
        .run(p.id, JSON.stringify(p), note.slice(0, 500), "create", time);
      this.event(p.id, "created", note);
    });
    this.syncVault(p.id);
    return this.get(p.id);
  }
  lease(id: string, holder: string, takeover = false): Lease {
    return this.tx(() => {
      this.get(id);
      const old = this.db
        .prepare("SELECT * FROM leases WHERE project_id=?")
        .get(id) as any;
      const time = this.clock();
      if (old && old.expires_at > time && old.holder !== holder && !takeover)
        fail(423, "locked", "Een andere sessie bewerkt dit project.", {
          expiresAt: old.expires_at,
        });
      const token =
        old && old.holder === holder && old.expires_at > time
          ? old.token
          : randomBytes(32).toString("hex");
      const expiresAt = time + 30000;
      this.db
        .prepare(
          "INSERT INTO leases VALUES(?,?,?,?) ON CONFLICT(project_id) DO UPDATE SET holder=excluded.holder,token=excluded.token,expires_at=excluded.expires_at",
        )
        .run(id, holder, token, expiresAt);
      if (takeover && old?.holder !== holder)
        this.event(
          id,
          "lease_takeover",
          "Bewerking expliciet overgenomen door een andere sessie.",
        );
      return { holder, token, expiresAt };
    });
  }
  assertLease(id: string, holder: string, token: string) {
    const l = this.db
      .prepare("SELECT * FROM leases WHERE project_id=?")
      .get(id) as any;
    if (
      !l ||
      l.holder !== holder ||
      l.token !== token ||
      l.expires_at <= this.clock()
    )
      fail(
        423,
        "lease_lost",
        "Bewerkingslock verlopen of overgenomen. Open de serverversie voordat je opnieuw opslaat.",
      );
  }
  release(id: string, holder: string, token: string) {
    this.db
      .prepare("DELETE FROM leases WHERE project_id=? AND holder=? AND token=?")
      .run(id, holder, token);
  }
  save(
    id: string,
    raw: unknown,
    expected: number,
    holder: string,
    token: string,
    note = "Automatisch bewaard",
    source = "manual",
  ): SavedProject {
    const p = this.parse(raw);
    if (p.id !== id) fail(400, "id_mismatch", "Project-ID wijkt af.");
    this.tx(() => {
      this.assertLease(id, holder, token);
      this.writeRevision(p, expected, note, source);
    });
    this.syncVault(id);
    return this.get(id);
  }
  writeRevision(p: Project, expected: number, note: string, source: string) {
    const old = this.get(p.id);
    if (old.revision !== expected)
      fail(
        409,
        "revision_conflict",
        "Server bevat een nieuwere revisie. Je lokale wijzigingen zijn behouden.",
        { revision: old.revision },
      );
    const time = this.timestamp(),
      revision = old.revision + 1;
    p.updatedAt = time;
    const json = JSON.stringify(p);
    this.db
      .prepare(
        "UPDATE projects SET name=?,scene=?,head=?,updated_at=? WHERE id=?",
      )
      .run(p.name, json, revision, time, p.id);
    this.db
      .prepare("INSERT INTO revisions VALUES(?,?,?,?,?,?)")
      .run(p.id, revision, json, note.slice(0, 500), source, time);
    this.event(
      p.id,
      "revision",
      `Revisie ${revision} (${source}): ${note.slice(0, 500)}`,
    );
  }
  revisions(id: string) {
    this.get(id);
    return this.db
      .prepare(
        "SELECT revision,note,source,created_at AS createdAt FROM revisions WHERE project_id=? ORDER BY revision DESC",
      )
      .all(id);
  }
  revision(id: string, revision: number): Project {
    this.get(id);
    const row = this.db
      .prepare("SELECT scene FROM revisions WHERE project_id=? AND revision=?")
      .get(id, revision) as any;
    if (!row) fail(404, "revision_not_found", "Revisie niet gevonden.");
    return JSON.parse(row.scene);
  }
  restore(
    id: string,
    target: number,
    expected: number,
    holder: string,
    token: string,
  ) {
    const p = this.revision(id, target);
    return this.save(
      id,
      p,
      expected,
      holder,
      token,
      `Hersteld uit revisie ${target}`,
      "restore",
    );
  }
  budget(id: string) {
    const row = this.db
      .prepare("SELECT budget_micros AS limitMicros FROM projects WHERE id=?")
      .get(id) as any;
    if (!row) fail(404, "not_found", "Project bestaat niet.");
    const totals = this.db
      .prepare(
        "SELECT COALESCE(SUM(cost_micros),0) AS spentMicros,COALESCE(SUM(reserved_micros),0) AS reservedMicros FROM ai_jobs WHERE project_id=?",
      )
      .get(id) as any;
    return {
      ...row,
      ...totals,
      remainingMicros:
        row.limitMicros - totals.spentMicros - totals.reservedMicros,
      warning:
        row.limitMicros > 0 &&
        totals.spentMicros + totals.reservedMicros >= row.limitMicros * 0.8,
    };
  }
  setBudget(id: string, micros: number, holder: string, token: string) {
    if (!Number.isSafeInteger(micros) || micros < 0 || micros > 1e10)
      fail(400, "invalid_budget", "Ongeldig budget.");
    this.tx(() => {
      this.assertLease(id, holder, token);
      const b = this.budget(id);
      if (micros < b.spentMicros + b.reservedMicros)
        fail(
          409,
          "budget_reserved",
          "Budget is lager dan reeds gebruikt of gereserveerd.",
        );
      this.db
        .prepare("UPDATE projects SET budget_micros=? WHERE id=?")
        .run(micros, id);
      this.event(
        id,
        "budget",
        `API-budget ingesteld op USD ${(micros / 1e6).toFixed(2)}.`,
      );
    });
    this.syncVault(id);
    return this.budget(id);
  }
  createQuote(
    data: Omit<
      Job,
      | "id"
      | "status"
      | "reservedMicros"
      | "costMicros"
      | "response"
      | "proposal"
      | "candidate"
      | "usage"
      | "message"
      | "createdAt"
    >,
  ): Job {
    const id = randomUUID();
    this.get(data.projectId);
    this.db
      .prepare(
        "INSERT INTO ai_jobs(id,project_id,base_revision,model,prompt,status,quoted_micros,input_tokens,max_output,pricing,request,created_at,expires_at,failure_key,owner) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        data.projectId,
        data.baseRevision,
        data.model,
        data.prompt,
        "quoted",
        data.quotedMicros,
        data.inputTokens,
        data.maxOutput,
        JSON.stringify(data.pricing),
        JSON.stringify(data.request),
        this.timestamp(),
        data.expiresAt,
        data.failureKey,
        data.owner,
      );
    return this.job(id);
  }
  job(id: string): Job {
    const r = this.db
      .prepare("SELECT * FROM ai_jobs WHERE id=?")
      .get(id) as any;
    if (!r) fail(404, "job_not_found", "Aanvraag niet gevonden.");
    const json = (k: string) => (r[k] ? JSON.parse(r[k]) : null);
    return {
      id: r.id,
      projectId: r.project_id,
      baseRevision: r.base_revision,
      model: r.model,
      prompt: r.prompt,
      status: r.status,
      quotedMicros: r.quoted_micros,
      reservedMicros: r.reserved_micros,
      costMicros: r.cost_micros,
      inputTokens: r.input_tokens,
      maxOutput: r.max_output,
      pricing: json("pricing"),
      request: json("request"),
      response: json("response"),
      proposal: json("proposal"),
      candidate: json("candidate"),
      usage: json("usage"),
      message: r.message,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      failureKey: r.failure_key,
      owner: r.owner,
    };
  }
  jobs(id: string) {
    this.get(id);
    return this.db
      .prepare(
        "SELECT id FROM ai_jobs WHERE project_id=? ORDER BY created_at DESC LIMIT 40",
      )
      .all(id)
      .map((r: any) => this.publicJob(this.job(r.id), false));
  }
  publicJob(j: Job, includeCandidate = true) {
    const { request, response, owner, failureKey, prompt, ...safe } = j;
    return { ...safe, candidate: includeCandidate ? j.candidate : null };
  }
  reserve(id: string, holder: string, token: string): Job {
    return this.tx(() => {
      const j = this.job(id);
      this.assertLease(j.projectId, holder, token);
      if (j.owner !== holder)
        fail(403, "job_owner", "Aanvraag hoort bij een andere sessie.");
      if (j.status !== "quoted")
        fail(
          409,
          "job_started",
          "Deze aanvraag is al gestart; wordt niet nogmaals verstuurd.",
        );
      if (j.expiresAt <= this.clock())
        fail(
          409,
          "quote_expired",
          "Kostenraming is verlopen; maak een nieuwe.",
        );
      if (this.get(j.projectId).revision !== j.baseRevision)
        fail(409, "proposal_stale", "Scène is gewijzigd sinds de raming.");
      const b = this.budget(j.projectId);
      if (b.remainingMicros < j.quotedMicros)
        fail(
          402,
          "budget_exceeded",
          "Voorspelde aanvraag overschrijdt het projectbudget.",
          { budget: b },
        );
      this.db
        .prepare(
          "UPDATE ai_jobs SET status='running',reserved_micros=quoted_micros WHERE id=?",
        )
        .run(id);
      this.event(
        j.projectId,
        "ai_started",
        `Claude-aanvraag ${id}, model ${j.model}, gereserveerd USD ${(j.quotedMicros / 1e6).toFixed(6)}.`,
      );
      return this.job(id);
    });
  }
  settle(
    id: string,
    costMicros: number,
    usage: unknown,
    proposal: unknown,
    candidate: unknown,
    response: unknown,
    message = "",
  ) {
    this.tx(() => {
      const j = this.job(id);
      if (j.status !== "running")
        fail(409, "job_state", "Aanvraag is niet actief.");
      if (!Number.isSafeInteger(costMicros) || costMicros < 0)
        throw Error("Invalid measured API cost");
      this.db
        .prepare(
          "UPDATE ai_jobs SET status=?,cost_micros=?,reserved_micros=0,usage=?,proposal=?,candidate=?,response=?,message=? WHERE id=?",
        )
        .run(
          proposal ? "proposed" : "failed",
          costMicros,
          JSON.stringify(usage),
          proposal ? JSON.stringify(proposal) : null,
          candidate ? JSON.stringify(candidate) : null,
          JSON.stringify(response),
          message.slice(0, 1000),
          id,
        );
      this.event(
        j.projectId,
        "ai_result",
        `Aanvraag ${id}: ${proposal ? "voorstel ontvangen" : "ongeldig antwoord"}; berekende gebruikskosten USD ${(costMicros / 1e6).toFixed(6)}.`,
      );
    });
    this.syncVault(this.job(id).projectId);
    return this.job(id);
  }
  failJob(id: string, message: string, uncertain = true) {
    this.tx(() => {
      const j = this.job(id);
      if (j.status !== "running") return;
      this.db
        .prepare(
          "UPDATE ai_jobs SET status=?,message=?,reserved_micros=? WHERE id=?",
        )
        .run(
          uncertain ? "uncertain" : "failed",
          message.slice(0, 1000),
          uncertain ? j.reservedMicros : 0,
          id,
        );
      this.event(
        j.projectId,
        "ai_failure",
        `Aanvraag ${id}: ${message.slice(0, 500)}${uncertain ? " Verbruik onzeker; reservering blijft staan." : ""}`,
      );
    });
    this.syncVault(this.job(id).projectId);
    return this.job(id);
  }
  recentDialogue(projectId: string) {
    const rows = this.db
      .prepare(
        "SELECT prompt,proposal,status FROM ai_jobs WHERE project_id=? AND proposal IS NOT NULL AND status IN ('proposed','applied') ORDER BY created_at DESC LIMIT 3",
      )
      .all(projectId) as any[];
    return rows.reverse().flatMap((r) => {
      const p = JSON.parse(r.proposal);
      return [
        { role: "user", content: r.prompt.slice(0, 2000) },
        {
          role: "assistant",
          content: JSON.stringify({
            summary: p.summary,
            questions: p.questions,
            applied: r.status === "applied",
          }),
        },
      ];
    });
  }
  failureCount(projectId: string, key: string) {
    return (
      this.db
        .prepare(
          "SELECT count(*) AS count FROM ai_jobs WHERE project_id=? AND failure_key=? AND status IN ('failed','uncertain')",
        )
        .get(projectId, key) as any
    ).count as number;
  }
  applyJob(
    id: string,
    expected: number,
    holder: string,
    token: string,
    approveRoom: boolean,
  ) {
    let projectId = "";
    this.tx(() => {
      const j = this.job(id);
      projectId = j.projectId;
      this.assertLease(projectId, holder, token);
      if (
        j.status !== "proposed" ||
        !j.candidate?.project ||
        !j.candidate.canApply
      )
        fail(409, "not_applicable", "Voorstel kan niet worden toegepast.");
      const current = this.get(projectId);
      if (expected !== j.baseRevision || current.revision !== j.baseRevision)
        fail(
          409,
          "proposal_stale",
          "Scène is gewijzigd sinds het voorstel. Er is niets toegepast.",
        );
      if (j.candidate.roomChanged && !approveRoom)
        fail(
          409,
          "room_approval_required",
          "Wijziging van de ruimte vereist expliciete goedkeuring.",
        );
      const p = parseProject(JSON.stringify(j.candidate.project));
      if (validate(p).some((i) => i.severity === "error"))
        fail(409, "invalid_geometry", "Voorstel overschrijdt de ruimte.");
      this.writeRevision(p, expected, j.proposal.summary, "claude");
      this.db
        .prepare(
          "UPDATE ai_jobs SET status='applied',candidate=NULL WHERE id=?",
        )
        .run(id);
    });
    this.syncVault(projectId);
    return this.get(projectId);
  }
  reconcileJob(
    id: string,
    costMicros: number,
    note: string,
    holder: string,
    token: string,
  ) {
    this.tx(() => {
      const j = this.job(id);
      this.assertLease(j.projectId, holder, token);
      if (j.status !== "uncertain")
        fail(
          409,
          "job_state",
          "Alleen onzeker verbruik kan worden gereconcilieerd.",
        );
      if (
        !Number.isSafeInteger(costMicros) ||
        costMicros < 0 ||
        costMicros > 1e10 ||
        typeof note !== "string" ||
        note.trim().length < 5 ||
        note.length > 1000
      )
        fail(
          400,
          "invalid_reconciliation",
          "Vul de werkelijk gecontroleerde kosten en een toelichting in.",
        );
      this.db
        .prepare(
          "UPDATE ai_jobs SET status='reconciled',cost_micros=?,reserved_micros=0,message=? WHERE id=?",
        )
        .run(costMicros, "Handmatig gereconcilieerd: " + note.trim(), id);
      this.event(
        j.projectId,
        "ai_reconciled",
        `Aanvraag ${id}: gecontroleerd USD ${(costMicros / 1e6).toFixed(6)}. ${note.trim()}`,
      );
    });
    this.syncVault(this.job(id).projectId);
    return this.publicJob(this.job(id));
  }
  rejectJob(id: string, holder: string, token: string) {
    this.tx(() => {
      const j = this.job(id);
      this.assertLease(j.projectId, holder, token);
      if (!["quoted", "proposed"].includes(j.status))
        fail(409, "job_state", "Aanvraag kan nu niet worden verworpen.");
      this.db
        .prepare(
          "UPDATE ai_jobs SET status='rejected',candidate=NULL WHERE id=?",
        )
        .run(id);
      this.event(j.projectId, "ai_rejected", `Voorstel ${id} verworpen.`);
    });
    return this.publicJob(this.job(id));
  }
  syncVault(id: string) {
    if (!this.vaultRoot) return;
    try {
      const saved = this.get(id),
        p = saved.project,
        folder = join(
          this.vaultRoot,
          "projects",
          createHash("sha256").update(id).digest("hex").slice(0, 24),
        );
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const rows = this.db
        .prepare(
          "SELECT kind,message,created_at FROM events WHERE project_id=? ORDER BY id",
        )
        .all(id) as any[];
      const clean = (s: string) =>
        s.replaceAll("\n", " ").replaceAll("\r", " ");
      const log =
        `# Projectlog\n\nProject-ID: ${clean(id)}\n\n` +
        rows
          .map((r) => `- ${r.created_at} [${r.kind}] ${clean(r.message)}`)
          .join("\n") +
        "\n";
      const context = `# ${clean(p.name)}\n\nRevisie: ${saved.revision}\nEenheid: cm\nRuimte X × Z × Y: ${p.room.length} × ${p.room.depth} × ${p.room.height}\nExemplaren: ${p.objects.length}\nDefinities: ${p.definitions.length}\nGrensfouten: ${validate(p).filter((i) => i.severity === "error").length}\n\n## Laatste gebeurtenissen\n\n${rows
        .slice(-8)
        .map((r) => `- ${clean(r.message)}`)
        .join(
          "\n",
        )}\n\nExacte staat en revisies staan in SQLite. Alle onderdelen zijn synthetisch en niet constructief beoordeeld.\n`;
      for (const [name, text] of [
        ["LOG.md", log],
        ["CONTEXT.md", context],
      ]) {
        const target = join(folder, name);
        writeFileSync(target + ".tmp", text, { mode: 0o600 });
        renameSync(target + ".tmp", target);
      }
      this.vaultError = "";
    } catch (e) {
      this.vaultError =
        e instanceof Error
          ? e.message
          : "Kennislog kon niet worden bijgewerkt.";
    }
  }
}
