// Starts the real server with a real Blender and sends one render job through the HTTP API.
//   BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender npm run render:smoke
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaDemoProject } from "../src/model.ts";
import { glbBytes } from "../src/glb.ts";
import { buildRenderSpec } from "../src/renderSpec.ts";
import { StudioClient } from "../src/serverClient.ts";
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const blender = process.env.BLENDER_PATH;
if (!blender) {
  console.error("✘ BLENDER_PATH ontbreekt");
  process.exit(1);
}
const port = 8791,
  data = mkdtempSync(join(tmpdir(), "studio-smoke-"));
const server = spawn(
  process.execPath,
  ["--experimental-strip-types", "server/index.ts"],
  {
    env: {
      ...process.env,
      STUDIO_PORT: String(port),
      STUDIO_DATA_DIR: data,
      BLENDER_PATH: blender,
    },
    stdio: ["ignore", "pipe", "inherit"],
  },
);
let banner = "";
server.stdout.on("data", (c) => (banner += c));
const stop = () => {
  server.kill("SIGTERM");
  setTimeout(() => rmSync(data, { recursive: true, force: true }), 1000);
};
try {
  for (let i = 0; i < 50 && !banner.includes("Boormester-server"); i++)
    await new Promise((r) => setTimeout(r, 100));
  console.log(banner.trim());
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        ...(cookie ? { cookie } : {}),
        origin: `http://127.0.0.1:${port}`,
      },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  console.log(
    "render status:",
    JSON.stringify(await client.request("/render/status")),
  );
  const p = mediaDemoProject();
  p.cameras.push({
    id: "c1",
    name: "Zicht",
    position: { x: -380, y: 165, z: 60 },
    target: { x: 200, y: 120, z: -40 },
    orthographic: false,
  });
  const saved = await client.request("/projects", "POST", { project: p });
  const lease = await client.request(`/projects/${p.id}/lease`, "POST", {});
  const glb = Buffer.from(await glbBytes(p));
  const spec = buildRenderSpec(
    p,
    saved.revision,
    { preset: "immersive", width: 640, height: 360, samples: 8 },
    {
      sha256: createHash("sha256").update(glb).digest("hex"),
      bytes: glb.length,
    },
  );
  let job = await client.request(
    `/projects/${p.id}/renders`,
    "POST",
    { spec, glbBase64: glb.toString("base64") },
    lease.token,
  );
  console.log("queued:", job.id, job.status);
  const t0 = Date.now();
  while (!["done", "failed"].includes(job.status) && Date.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 1000));
    job = await client.request(`/renders/${job.id}`);
  }
  console.log(
    `${job.status} na ${((Date.now() - t0) / 1000).toFixed(1)} s · poging ${job.attempts} · ${job.message}`,
  );
  if (job.status !== "done") throw Error("render niet klaar");
  const blob = await client.blob(`/renders/${job.id}/${job.outputs[0].file}`);
  const bytes = Buffer.from(await blob.arrayBuffer());
  if (
    createHash("sha256").update(bytes).digest("hex") !== job.outputs[0].sha256
  )
    throw Error("download wijkt af van het rapport");
  const out = join(data, "smoke.png");
  writeFileSync(out, bytes);
  console.log(`✔ gedownload en gecontroleerd (${bytes.length} bytes): ${out}`);
  stop();
} catch (e) {
  console.error("✘", e instanceof Error ? e.message : e);
  stop();
  process.exit(1);
}
