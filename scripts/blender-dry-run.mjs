// Prepares a real render job from the demo project and checks everything except Blender itself.
//   npm run blender:dry            -> build GLB + job.json, validate, syntax-check the worker
//   npm run blender:dry -- --run   -> additionally run Blender on that job (needs BLENDER_PATH)
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { demoProject } from "../src/model.ts";
import { glbBytes } from "../src/glb.ts";
import { buildRenderSpec, validateRenderSpec } from "../src/renderSpec.ts";
// The exporter wants the browser FileReader for Blob bytes; no canvas or WebGL is involved.
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const project = demoProject();
project.cameras.push({
  id: "dry-eye",
  name: "Ooghoogte",
  position: { x: -380, y: 165, z: 0 },
  target: { x: 300, y: 150, z: 0 },
  orthographic: false,
});
const glb = Buffer.from(await glbBytes(project));
const spec = buildRenderSpec(
  project,
  1,
  { preset: "immersive", width: 640, height: 360, samples: 8 },
  { sha256: createHash("sha256").update(glb).digest("hex"), bytes: glb.length },
);
validateRenderSpec(spec);
const dir = mkdtempSync(join(tmpdir(), "blender-dry-"));
writeFileSync(join(dir, "scene.glb"), glb);
writeFileSync(join(dir, "job.json"), JSON.stringify(spec, null, 2));
console.log(
  `✔ job.json valid (${spec.cameras.length} camera, ${spec.outputs.length} output) and GLB ${glb.length} bytes in ${dir}`,
);
const worker = resolve("blender/render_worker.py");
const py = spawnSync(
  "python3",
  [
    "-B",
    "-I",
    "-c",
    'import sys; compile(open(sys.argv[1]).read(), sys.argv[1], "exec")',
    worker,
  ],
  {
    encoding: "utf8",
  },
);
if (py.error?.code === "ENOENT")
  console.log("• python3 niet gevonden: syntaxiscontrole overgeslagen");
else if (py.status !== 0) {
  console.error("✘ render_worker.py syntaxfout:\n" + py.stderr);
  process.exit(1);
} else
  console.log(
    "✔ render_worker.py compileert (alleen syntaxis, niet uitgevoerd)",
  );
if (process.argv.includes("--run")) {
  const blender = process.env.BLENDER_PATH;
  if (!blender) {
    console.error("✘ --run vraagt BLENDER_PATH");
    process.exit(1);
  }
  const r = spawnSync(
    blender,
    ["-b", "--factory-startup", "--python", worker, "--", dir],
    { encoding: "utf8" },
  );
  const line = (r.stdout ?? "")
    .split("\n")
    .reverse()
    .find((l) => l.startsWith("STUDIO_RESULT "));
  console.log(
    line ??
      `✘ Blender gaf geen resultaat (code ${r.status})\n${(r.stderr ?? "").slice(-1500)}`,
  );
  process.exit(line ? 0 : 1);
} else
  console.log(
    "• Blender niet uitgevoerd (geen --run). Zie docs/BLENDER.md voor de eerste echte test.",
  );
