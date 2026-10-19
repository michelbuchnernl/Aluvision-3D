import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { ProjectStore } from "./store.ts";
import { ClaudeProvider, ClaudeService } from "./claude.ts";
import { StudioError, fail } from "./errors.ts";
import { MAX_ATTEMPTS } from "./renders.ts";
import type { RenderService } from "./renders.ts";
import type { Library } from "./library.ts";
import { createReadStream } from "node:fs";
import { readFileSync } from "node:fs";
interface Session {
  id: string;
  csrf: string;
  expiresAt: number;
}
interface Options {
  store: ProjectStore;
  provider?: ClaudeProvider;
  renders?: RenderService;
  library?: Library;
  accessToken?: string;
  allowedOrigins?: string[];
  staticRoot?: string;
  secureCookies?: boolean;
  clock?: () => number;
}
const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const same = (a: string, b: string) => {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
async function jsonBody(req: IncomingMessage) {
  if (
    !req.headers["content-type"]?.toLowerCase().startsWith("application/json")
  )
    fail(415, "json_required", "Deze actie verwacht JSON.");
  let n = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    n += chunk.length;
    if (n > 12_000_000) fail(413, "body_limit", "Aanvraag is te groot.");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "invalid_json", "Ongeldige JSON.");
  }
}
const integer = (v: unknown) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1;
export function createStudioServer(options: Options) {
  const store = options.store,
    clock = options.clock ?? Date.now,
    provider = options.provider ?? new ClaudeProvider(),
    ai = new ClaudeService(store, provider),
    sessions = new Map<string, Session>();
  const origins = new Set(
    options.allowedOrigins ?? [
      "http://localhost:4173",
      "http://127.0.0.1:4173",
      "http://localhost:8787",
      "http://127.0.0.1:8787",
    ],
  );
  const hosts = new Set([
    "localhost",
    "127.0.0.1",
    "[::1]",
    ...Array.from(origins).map((v) => new URL(v).hostname),
  ]);
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("Cache-Control", "no-store");
    const send = (status: number, value: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(value));
    };
    try {
      let url: URL;
      try {
        url = new URL(req.url ?? "/", `http://${req.headers.host}`);
      } catch {
        fail(400, "invalid_url", "Ongeldig adres.");
      }
      if (!hosts.has(url.hostname))
        fail(403, "host_rejected", "Host is niet toegestaan.");
      if (req.headers.origin && !origins.has(req.headers.origin))
        fail(
          403,
          "origin_rejected",
          "Dit herkomstadres mag de lokale editor niet benaderen.",
        );
      const api = url.pathname.startsWith("/api/");
      if (!api) {
        if (req.method !== "GET" && req.method !== "HEAD")
          fail(405, "method_not_allowed", "Actie niet toegestaan.");
        if (!options.staticRoot)
          fail(
            404,
            "not_found",
            "Start de frontend met npm run dev of bouw dist voor npm start.",
          );
        let decoded: string;
        try {
          decoded = decodeURIComponent(url.pathname);
        } catch {
          fail(400, "invalid_path", "Ongeldig pad.");
        }
        const root = resolve(options.staticRoot),
          path = resolve(root, "." + decoded);
        if (path !== root && !path.startsWith(root + sep))
          fail(403, "invalid_path", "Pad niet toegestaan.");
        let file = path === root ? resolve(root, "index.html") : path;
        let bytes: Buffer;
        try {
          bytes = await readFile(file);
        } catch {
          if (extname(decoded))
            fail(404, "not_found", "Bestand niet gevonden.");
          file = resolve(root, "index.html");
          try {
            bytes = await readFile(file);
          } catch {
            fail(
              404,
              "not_built",
              "Productieversie ontbreekt. Voer npm run build uit.",
            );
          }
        }
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
        );
        res.writeHead(200, {
          "Content-Type": MIME[extname(file)] ?? "application/octet-stream",
        });
        res.end(req.method === "HEAD" ? undefined : bytes);
        return;
      }
      if (url.pathname === "/api/health" && req.method === "GET") {
        send(200, { ok: true, storage: "sqlite", schema: 1 });
        return;
      }
      const gate = options.accessToken ?? "";
      if (gate && !same(String(req.headers["x-studio-access"] ?? ""), gate))
        fail(401, "access_required", "Vul de toegangscode van deze server in.");
      const cookie = String(req.headers.cookie ?? "")
        .split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("studio_session="))
        ?.slice("studio_session=".length);
      let session = cookie ? sessions.get(cookie) : undefined;
      if (url.pathname === "/api/session" && req.method === "GET") {
        if (!session || session.expiresAt <= clock()) {
          if (sessions.size > 1000) {
            for (const [key, s] of sessions)
              if (s.expiresAt <= clock()) sessions.delete(key);
            if (sessions.size > 1000)
              fail(429, "session_limit", "Te veel actieve sessies.");
          }
          session = {
            id: randomBytes(32).toString("hex"),
            csrf: randomBytes(32).toString("hex"),
            expiresAt: clock() + 86400000,
          };
          sessions.set(session.id, session);
        }
        res.setHeader(
          "Set-Cookie",
          `studio_session=${session.id}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=86400${options.secureCookies ? "; Secure" : ""}`,
        );
        send(200, {
          csrf: session.csrf,
          expiresAt: session.expiresAt,
          ai: provider.status(),
          vaultWarning: store.vaultError,
        });
        return;
      }
      if (!session || session.expiresAt <= clock())
        fail(401, "session_required", "Verbind opnieuw met de server.");
      if (
        !["GET", "HEAD"].includes(req.method ?? "") &&
        !same(String(req.headers["x-studio-csrf"] ?? ""), session.csrf)
      )
        fail(403, "csrf_required", "Sessiecontrole mislukt. Verbind opnieuw.");
      const method = req.method ?? "GET";
      const leaseToken = String(req.headers["x-studio-lease"] ?? "");
      const clientId = String(req.headers["x-studio-client"] ?? "");
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(clientId))
        fail(
          400,
          "client_required",
          "Tab-identiteit ontbreekt. Verbind opnieuw.",
        );
      const actor = session.id + ":" + clientId;
      const path = url.pathname
        .split("/")
        .filter(Boolean)
        .map((p) => {
          try {
            return decodeURIComponent(p);
          } catch {
            fail(400, "invalid_path", "Ongeldig pad.");
          }
        });
      if (url.pathname === "/api/projects" && method === "GET") {
        send(200, { projects: store.list() });
        return;
      }
      if (url.pathname === "/api/projects" && method === "POST") {
        const body = await jsonBody(req);
        send(201, store.create(body.project));
        return;
      }
      if (url.pathname === "/api/ai/status" && method === "GET") {
        send(200, provider.status());
        return;
      }
      const renders = options.renders;
      if (url.pathname === "/api/library" && method === "GET") {
        send(
          200,
          options.library?.listing() ?? {
            available: false,
            hint: "Geen bibliotheek ingesteld op de server.",
            models: [],
          },
        );
        return;
      }
      if (
        path[1] === "library" &&
        path[2] === "files" &&
        path.length === 4 &&
        method === "GET"
      ) {
        const hit = options.library?.pathFor(path[3]);
        if (!hit)
          fail(
            404,
            "library_file_not_found",
            "Bibliotheekbestand niet gevonden of niet beschikbaar.",
          );
        res.writeHead(200, {
          "Content-Type": "model/gltf-binary",
          "Content-Length": hit!.model.bytes,
          // The file name carries the Warehouse id and the manifest pins the checksum, so it is safe to cache.
          "Cache-Control": "private, max-age=3600",
          "X-Content-SHA256": hit!.model.sha256,
        });
        createReadStream(hit!.path)
          .on("error", () => res.destroy())
          .pipe(res);
        return;
      }
      if (url.pathname === "/api/render/status" && method === "GET") {
        send(200, {
          available: !!renders,
          blenderConfigured: renders?.configured ?? false,
          maxAttempts: MAX_ATTEMPTS,
        });
        return;
      }
      if (path[1] === "renders" && path[2]) {
        if (!renders)
          fail(503, "render_unavailable", "Renderwachtrij is niet actief.");
        if (path.length === 3 && method === "GET") {
          send(200, renders.queue.get(path[2]));
          return;
        }
        if (path.length === 4 && path[3] === "cancel" && method === "POST") {
          const job = renders.queue.get(path[2]);
          store.assertLease(job.projectId, actor, leaseToken);
          send(200, renders.queue.cancel(path[2]));
          return;
        }
        if (path.length === 4 && method === "GET") {
          const file = renders.queue.outputPath(path[2], path[3]);
          const bytes = readFileSync(file);
          res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": bytes.length,
            "Content-Disposition": `attachment; filename="${path[3]}"`,
          });
          res.end(bytes);
          return;
        }
      }
      if (path[1] === "projects" && path[2]) {
        const id = path[2],
          action = path[3];
        if (action === "renders" && path.length === 4) {
          if (!renders)
            fail(503, "render_unavailable", "Renderwachtrij is niet actief.");
          if (method === "GET") {
            store.get(id);
            send(200, {
              jobs: renders.queue.list(id),
              blenderConfigured: renders.configured,
            });
            return;
          }
          if (method === "POST") {
            const b = await jsonBody(req);
            store.assertLease(id, actor, leaseToken);
            const head = store.get(id).revision;
            if (!b.spec || b.spec.projectId !== id || b.spec.revision !== head)
              fail(
                409,
                "render_stale",
                "De opdracht hoort niet bij de huidige revisie. Bewaar en probeer opnieuw.",
              );
            if (typeof b.glbBase64 !== "string")
              fail(400, "glb_required", "GLB ontbreekt.");
            send(
              201,
              renders.queue.enqueue(b.spec, Buffer.from(b.glbBase64, "base64")),
            );
            return;
          }
        }
        if (path.length === 3 && method === "GET") {
          send(200, store.get(id));
          return;
        }
        if (path.length === 3 && method === "PUT") {
          const b = await jsonBody(req);
          if (!integer(b.expectedRevision))
            fail(400, "revision_required", "Verwachte revisie ontbreekt.");
          send(
            200,
            store.save(
              id,
              b.project,
              b.expectedRevision,
              actor,
              leaseToken,
              typeof b.note === "string" ? b.note : "Automatisch bewaard",
            ),
          );
          return;
        }
        if (action === "lease" && method === "POST") {
          const b = await jsonBody(req);
          const lease = store.lease(id, actor, b.takeover === true);
          send(200, { token: lease.token, expiresAt: lease.expiresAt });
          return;
        }
        if (action === "lease" && method === "DELETE") {
          await jsonBody(req);
          store.release(id, actor, leaseToken);
          send(200, { released: true });
          return;
        }
        if (action === "revisions" && path.length === 4 && method === "GET") {
          send(200, { revisions: store.revisions(id) });
          return;
        }
        if (action === "revisions" && path.length === 5 && method === "GET") {
          const n = Number(path[4]);
          if (!integer(n)) fail(400, "invalid_revision", "Ongeldige revisie.");
          send(200, { project: store.revision(id, n), revision: n });
          return;
        }
        if (action === "restore" && method === "POST") {
          const b = await jsonBody(req);
          if (!integer(b.revision) || !integer(b.expectedRevision))
            fail(400, "invalid_revision", "Ongeldige revisie.");
          send(
            200,
            store.restore(
              id,
              b.revision,
              b.expectedRevision,
              actor,
              leaseToken,
            ),
          );
          return;
        }
        if (action === "budget" && method === "GET") {
          send(200, store.budget(id));
          return;
        }
        if (action === "budget" && method === "PUT") {
          const b = await jsonBody(req);
          send(200, store.setBudget(id, b.limitMicros, actor, leaseToken));
          return;
        }
        if (action === "ai" && path[4] === "jobs" && method === "GET") {
          send(200, { jobs: store.jobs(id), budget: store.budget(id) });
          return;
        }
        if (action === "ai" && path[4] === "quote" && method === "POST") {
          const b = await jsonBody(req);
          send(
            200,
            await ai.quote(
              id,
              actor,
              leaseToken,
              b.prompt,
              b.model,
              b.maxOutput ?? 4096,
            ),
          );
          return;
        }
      }
      if (path[1] === "ai" && path[2] === "jobs" && path[3]) {
        const job = store.job(path[3]);
        if (path.length === 4 && method === "GET") {
          send(200, store.publicJob(job));
          return;
        }
        if (method === "POST" && path[4] === "run") {
          await jsonBody(req);
          send(200, await ai.run(job.id, actor, leaseToken));
          return;
        }
        if (method === "POST" && path[4] === "apply") {
          const b = await jsonBody(req);
          if (!integer(b.expectedRevision))
            fail(400, "revision_required", "Verwachte revisie ontbreekt.");
          send(
            200,
            store.applyJob(
              job.id,
              b.expectedRevision,
              actor,
              leaseToken,
              b.approveRoom === true,
            ),
          );
          return;
        }
        if (method === "POST" && path[4] === "reconcile") {
          const b = await jsonBody(req);
          send(
            200,
            store.reconcileJob(job.id, b.costMicros, b.note, actor, leaseToken),
          );
          return;
        }
        if (method === "POST" && path[4] === "reject") {
          await jsonBody(req);
          send(200, store.rejectJob(job.id, actor, leaseToken));
          return;
        }
      }
      fail(404, "not_found", "Actie niet gevonden.");
    } catch (e) {
      if (res.headersSent) {
        res.end();
        return;
      }
      if (e instanceof StudioError)
        send(e.status, { error: e.code, message: e.message, ...e.details });
      else if (e instanceof SyntaxError)
        send(400, { error: "invalid_data", message: "Ongeldige gegevens." });
      else if (
        e instanceof Error &&
        /Ongeldig|onderdeel|schema|Project is groter/.test(e.message)
      )
        send(400, { error: "invalid_project", message: e.message });
      else
        send(500, {
          error: "server_error",
          message:
            "Server kon de actie niet afronden. Je lokale ontwerp is niet aangepast.",
        });
    }
  });
  server.requestTimeout = 75000;
  server.headersTimeout = 10000;
  return { server, store, provider };
}
