import { resolve, join } from "node:path";
import {
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  closeSync,
  unlinkSync,
} from "node:fs";
import { ProjectStore } from "./store.ts";
import { ClaudeProvider } from "./claude.ts";
import { createStudioServer } from "./http.ts";
import { RenderQueue, RenderService, blenderRunner } from "./renders.ts";
const host = process.env.STUDIO_HOST ?? "127.0.0.1",
  port = Number(process.env.STUDIO_PORT ?? 8787),
  root = resolve(process.env.STUDIO_DATA_DIR ?? "studio-data");
const publicOrigin = process.env.STUDIO_ORIGIN,
  accessToken = process.env.STUDIO_ACCESS_TOKEN;
if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
  throw Error("Ongeldige STUDIO_PORT.");
if (
  !["127.0.0.1", "::1", "localhost"].includes(host) &&
  (!accessToken ||
    accessToken.length < 24 ||
    !publicOrigin?.startsWith("https://"))
)
  throw Error(
    "Netwerkgebruik vereist STUDIO_ACCESS_TOKEN (minimaal 24 tekens) en een HTTPS STUDIO_ORIGIN achter je eigen toegangspoort.",
  );
mkdirSync(root, { recursive: true, mode: 0o700 });
const lockPath = join(root, "server.pid");
function acquire() {
  try {
    return openSync(lockPath, "wx", 0o600);
  } catch (e) {
    let pid: number;
    try {
      pid = Number(readFileSync(lockPath, "utf8"));
      if (!Number.isSafeInteger(pid) || pid < 1) throw Error("ongeldig");
    } catch {
      throw Error(
        "Serverlock is onleesbaar. Controleer of de server gestopt is voordat je studio-data/server.pid verwijdert.",
      );
    }
    try {
      process.kill(pid, 0);
      throw Error("Er draait al een server op deze datamap.");
    } catch (err: any) {
      if (err.code !== "ESRCH") throw err;
      unlinkSync(lockPath);
      return openSync(lockPath, "wx", 0o600);
    }
  }
}
const lock = acquire();
writeFileSync(lock, String(process.pid));
closeSync(lock);
const store = new ProjectStore(join(root, "studio.sqlite"), {
  vaultRoot: join(root, "vault"),
});
const provider = new ClaudeProvider({
  apiKey: process.env.ANTHROPIC_API_KEY,
  enabled: process.env.STUDIO_ENABLE_AI === "1",
});
// Blender is optional: without BLENDER_PATH jobs can be queued but are not executed.
const blenderPath = process.env.BLENDER_PATH;
const renders = new RenderService(
  new RenderQueue(store.db, join(root, "renders")),
  blenderPath
    ? blenderRunner(blenderPath, resolve("blender/render_worker.py"))
    : undefined,
);
renders.start();
const origins = [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  ...(publicOrigin ? [publicOrigin] : []),
  // Extra local dev origins, e.g. a second Vite port for browser tests. Plain http(s) origins on loopback only.
  ...(process.env.STUDIO_EXTRA_ORIGINS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .map((v) => {
      const u = new URL(v);
      if (
        !/^https?:$/.test(u.protocol) ||
        !["localhost", "127.0.0.1"].includes(u.hostname)
      )
        throw Error(
          "STUDIO_EXTRA_ORIGINS accepteert alleen http(s)://localhost of 127.0.0.1.",
        );
      return u.origin;
    }),
];
const { server } = createStudioServer({
  store,
  provider,
  renders,
  accessToken,
  allowedOrigins: origins,
  staticRoot: resolve("dist"),
  secureCookies: publicOrigin?.startsWith("https://"),
});
let closed = false;
const cleanup = () => {
  if (closed) return;
  closed = true;
  renders.stop();
  try {
    store.close();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {}
  }
};
server.on("error", (e) => {
  console.error("Studio-server kon niet starten:", e.message);
  cleanup();
  process.exitCode = 1;
});
server.listen(port, host, () =>
  console.log(
    `Boormester-server: http://${host}:${port} | Claude ${provider.enabled && provider.apiKey ? "ingeschakeld" : "uitgeschakeld"} | Blender ${blenderPath ? "ingesteld" : "niet ingesteld"}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => {
      cleanup();
      process.exit(0);
    });
    setTimeout(() => {
      cleanup();
      process.exit(0);
    }, 3000).unref();
  });
process.on("exit", cleanup);
