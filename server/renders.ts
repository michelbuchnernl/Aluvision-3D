import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { validateRenderSpec, MAX_GLB_BYTES } from "../src/renderSpec.ts";
import type { RenderSpec } from "../src/renderSpec.ts";
import { fail } from "./errors.ts";
export type RenderStatus =
  "queued" | "running" | "done" | "failed" | "cancelled";
export interface RenderOutput {
  camera: string;
  file: string;
  bytes: number;
  sha256: string;
}
export interface RenderJob {
  id: string;
  projectId: string;
  revision: number;
  status: RenderStatus;
  attempts: number;
  message: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  spec: RenderSpec;
  outputs: RenderOutput[];
}
export const MAX_ATTEMPTS = 3;
/** Executes one job directory (job.json + scene.glb) and returns what the worker reported. */
export type RenderRunner = (job: {
  dir: string;
  signal: AbortSignal;
}) => Promise<{ outputs: RenderOutput[]; log: string }>;
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export class RenderQueue {
  private db: DatabaseSync;
  readonly dir: string;
  private clock: () => number;
  constructor(db: DatabaseSync, dir: string, clock: () => number = Date.now) {
    this.db = db;
    this.dir = dir;
    this.clock = clock;
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    db.exec(`CREATE TABLE IF NOT EXISTS render_jobs(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id),revision INTEGER NOT NULL,spec TEXT NOT NULL,status TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,message TEXT NOT NULL DEFAULT '',outputs TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,started_at TEXT,finished_at TEXT);
      CREATE INDEX IF NOT EXISTS render_jobs_project ON render_jobs(project_id,created_at);`);
    this.recover();
  }
  private now() {
    return new Date(this.clock()).toISOString();
  }
  /** After a crash a 'running' job is retried, but only up to the attempt cap. */
  recover() {
    this.db
      .prepare(
        "UPDATE render_jobs SET status='failed',finished_at=?,message='Server herstart tijdens het renderen; maximaal aantal pogingen bereikt.' WHERE status='running' AND attempts>=?",
      )
      .run(this.now(), MAX_ATTEMPTS);
    this.db
      .prepare(
        "UPDATE render_jobs SET status='queued',message='Server herstart; opnieuw in de wachtrij.' WHERE status='running'",
      )
      .run();
  }
  jobDir(id: string) {
    if (!/^[0-9a-f-]{36}$/.test(id))
      fail(400, "invalid_job", "Ongeldige renderopdracht.");
    return join(this.dir, id);
  }
  private row(r: any): RenderJob {
    return {
      id: r.id,
      projectId: r.project_id,
      revision: r.revision,
      status: r.status,
      attempts: r.attempts,
      message: r.message,
      createdAt: r.created_at,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      spec: JSON.parse(r.spec),
      outputs: JSON.parse(r.outputs),
    };
  }
  enqueue(rawSpec: unknown, glb: Buffer): RenderJob {
    let spec: RenderSpec;
    try {
      spec = validateRenderSpec(rawSpec);
    } catch (e) {
      fail(
        400,
        "invalid_render",
        e instanceof Error ? e.message : "Ongeldige opdracht.",
      );
    }
    if (glb.length === 0 || glb.length > MAX_GLB_BYTES)
      fail(413, "glb_size", "Het GLB-bestand is leeg of te groot.");
    if (
      glb.length !== spec.glb.bytes ||
      createHash("sha256").update(glb).digest("hex") !== spec.glb.sha256
    )
      fail(
        400,
        "glb_mismatch",
        "GLB komt niet overeen met de checksum in de opdracht.",
      );
    if (glb.subarray(0, 4).toString("latin1") !== "glTF")
      fail(400, "glb_invalid", "Dit is geen binair GLB-bestand.");
    const id = randomUUID(),
      dir = this.jobDir(id);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, "scene.glb"), glb);
    writeFileSync(join(dir, "job.json"), JSON.stringify(spec, null, 2));
    this.db
      .prepare(
        "INSERT INTO render_jobs(id,project_id,revision,spec,status,message,created_at) VALUES(?,?,?,?,'queued','In de wachtrij.',?)",
      )
      .run(id, spec.projectId, spec.revision, JSON.stringify(spec), this.now());
    return this.get(id);
  }
  get(id: string): RenderJob {
    const r = this.db.prepare("SELECT * FROM render_jobs WHERE id=?").get(id);
    if (!r) fail(404, "render_not_found", "Renderopdracht niet gevonden.");
    return this.row(r);
  }
  list(projectId: string): RenderJob[] {
    return this.db
      .prepare(
        "SELECT * FROM render_jobs WHERE project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 100",
      )
      .all(projectId)
      .map((r) => this.row(r));
  }
  cancel(id: string): RenderJob {
    const job = this.get(id);
    if (job.status !== "queued")
      fail(
        409,
        "render_not_cancellable",
        "Alleen wachtende opdrachten kunnen worden geannuleerd.",
      );
    this.db
      .prepare(
        "UPDATE render_jobs SET status='cancelled',finished_at=?,message='Geannuleerd.' WHERE id=? AND status='queued'",
      )
      .run(this.now(), id);
    return this.get(id);
  }
  claim(): RenderJob | undefined {
    const next: any = this.db
      .prepare(
        "SELECT id FROM render_jobs WHERE status='queued' ORDER BY created_at,rowid LIMIT 1",
      )
      .get();
    if (!next) return undefined;
    const res = this.db
      .prepare(
        "UPDATE render_jobs SET status='running',attempts=attempts+1,started_at=?,message='Bezig met renderen.' WHERE id=? AND status='queued'",
      )
      .run(this.now(), next.id);
    return res.changes ? this.get(next.id) : undefined;
  }
  finish(id: string, outputs: RenderOutput[]) {
    this.db
      .prepare(
        "UPDATE render_jobs SET status='done',outputs=?,finished_at=?,message='Klaar.' WHERE id=?",
      )
      .run(JSON.stringify(outputs), this.now(), id);
  }
  /** Failure evidence is kept; the third failed attempt ends the job instead of looping. */
  failAttempt(id: string, attempts: number, message: string) {
    const final = attempts >= MAX_ATTEMPTS;
    this.db
      .prepare(
        "UPDATE render_jobs SET status=?,message=?,finished_at=? WHERE id=?",
      )
      .run(
        final ? "failed" : "queued",
        (final
          ? `Mislukt na ${attempts} pogingen: `
          : `Poging ${attempts} mislukt, opnieuw geprobeerd: `) +
          message.slice(-1500),
        final ? this.now() : null,
        id,
      );
  }
  /** Path of an output file, only for files the worker reported for this job. */
  outputPath(id: string, file: string) {
    const job = this.get(id);
    if (!job.outputs.some((o) => o.file === file))
      fail(404, "render_file_not_found", "Bestand niet gevonden.");
    const path = resolve(this.jobDir(id), "out", file);
    if (!existsSync(path))
      fail(404, "render_file_missing", "Bestand ontbreekt op schijf.");
    return path;
  }
  /** Verifies a worker report against the disk before it is trusted. */
  verify(job: RenderJob, reported: RenderOutput[]) {
    const dir = resolve(this.jobDir(job.id), "out");
    const wanted = job.spec.outputs;
    if (reported.length !== wanted.length)
      throw Error(
        "Het aantal uitvoerbestanden komt niet overeen met de opdracht.",
      );
    return wanted.map((o) => {
      const r = reported.find(
        (v) => v.file === o.file && v.camera === o.camera,
      );
      if (!r) throw Error(`Uitvoer ${o.file} ontbreekt in het rapport.`);
      const path = resolve(dir, o.file);
      if (!path.startsWith(dir + "/") && !path.startsWith(dir + "\\"))
        throw Error("Ongeldig uitvoerpad.");
      if (!existsSync(path) || statSync(path).size === 0)
        throw Error(`Uitvoerbestand ${o.file} bestaat niet of is leeg.`);
      const bytes = readFileSync(path);
      if (!bytes.subarray(0, 8).equals(PNG))
        throw Error(`${o.file} is geen PNG.`);
      const sha = createHash("sha256").update(bytes).digest("hex");
      if (sha !== r.sha256)
        throw Error(`Checksum van ${o.file} wijkt af van het rapport.`);
      return {
        camera: o.camera,
        file: o.file,
        bytes: bytes.length,
        sha256: sha,
      };
    });
  }
  purge(id: string) {
    rmSync(this.jobDir(id), { recursive: true, force: true });
  }
  filesOnDisk(id: string) {
    const out = join(this.jobDir(id), "out");
    return existsSync(out) ? readdirSync(out) : [];
  }
}
export class RenderService {
  private busy = false;
  private timer?: NodeJS.Timeout;
  private abort?: AbortController;
  readonly queue: RenderQueue;
  readonly runner?: RenderRunner;
  constructor(queue: RenderQueue, runner?: RenderRunner) {
    this.queue = queue;
    this.runner = runner;
  }
  get configured() {
    return !!this.runner;
  }
  /** Runs at most one job at a time; returns the job it handled, if any. */
  async processNext(): Promise<RenderJob | undefined> {
    if (!this.runner || this.busy) return undefined;
    this.busy = true;
    try {
      const job = this.queue.claim();
      if (!job) return undefined;
      this.abort = new AbortController();
      try {
        const result = await this.runner({
          dir: this.queue.jobDir(job.id),
          signal: this.abort.signal,
        });
        this.queue.finish(job.id, this.queue.verify(job, result.outputs));
      } catch (e) {
        this.queue.failAttempt(
          job.id,
          job.attempts,
          e instanceof Error ? e.message : String(e),
        );
      }
      return this.queue.get(job.id);
    } finally {
      this.abort = undefined;
      this.busy = false;
    }
  }
  start(intervalMs = 2000) {
    if (!this.runner || this.timer) return;
    this.timer = setInterval(
      () => void this.processNext().catch(() => {}),
      intervalMs,
    );
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    this.abort?.abort();
  }
}
/** Runs a real Blender. Not exercised by tests; see docs/BLENDER.md for the first-run checklist. */
export function blenderRunner(
  blenderPath: string,
  workerPath: string,
  timeoutMs = 20 * 60_000,
): RenderRunner {
  return ({ dir, signal }) =>
    new Promise((resolvePromise, reject) => {
      const child = spawn(
        blenderPath,
        ["-b", "--factory-startup", "--python", workerPath, "--", dir],
        { stdio: ["ignore", "pipe", "pipe"], signal },
      );
      let log = "";
      const keep = (chunk: Buffer) =>
        (log = (log + chunk.toString()).slice(-20000));
      child.stdout.on("data", keep);
      child.stderr.on("data", keep);
      const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const line = log
          .split("\n")
          .reverse()
          .find((l) => l.startsWith("STUDIO_RESULT "));
        if (code !== 0 || !line)
          return reject(
            Error(`Blender stopte met code ${code}. ${log.slice(-1200)}`),
          );
        try {
          resolvePromise({ outputs: JSON.parse(line.slice(14)).outputs, log });
        } catch {
          reject(Error("Blender-resultaat was geen geldige JSON."));
        }
      });
    });
}
