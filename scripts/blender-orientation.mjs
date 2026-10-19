// Asymmetric scene for checking handedness, scale and camera field of view in a real Blender.
//   BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender npm run blender:orientation
// Expected: BBOX lines in metres (table at y = -1.0, truss at y = +1.0), and in the rendered PNG the wooden
// table appears on the RIGHT, the truss at the lower left, the black connector small in the middle.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emptyProject, newInstance } from "../src/model.ts";
import { glbBytes } from "../src/glb.ts";
import { buildRenderSpec, validateRenderSpec } from "../src/renderSpec.ts";
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const p = emptyProject();
p.objects.push(newInstance(p, "table-140", { x: 0, y: 0, z: 100 }));
p.objects.push(newInstance(p, "truss-200", { x: 0, y: 0, z: -100 }));
p.objects.push(newInstance(p, "connector-25", { x: 250, y: 0, z: 0 }));
p.cameras.push({
  id: "c",
  name: "Ooghoogte",
  position: { x: -380, y: 165, z: 0 },
  target: { x: 300, y: 100, z: 0 },
  orthographic: false,
});
const glb = Buffer.from(await glbBytes(p));
const spec = buildRenderSpec(
  p,
  1,
  { preset: "presentation", width: 960, height: 540, samples: 16 },
  { sha256: createHash("sha256").update(glb).digest("hex"), bytes: glb.length },
);
validateRenderSpec(spec);
const dir = mkdtempSync(join(tmpdir(), "blender-orient-"));
writeFileSync(join(dir, "scene.glb"), glb);
writeFileSync(join(dir, "job.json"), JSON.stringify(spec, null, 2));
console.log("job:", dir);
const blender = process.env.BLENDER_PATH;
if (!blender) {
  console.log("• BLENDER_PATH niet gezet: alleen de opdracht is gebouwd.");
  process.exit(0);
}
const run = (script) =>
  spawnSync(
    blender,
    ["-b", "--factory-startup", "--python", resolve(script), "--", dir],
    { encoding: "utf8" },
  ).stdout ?? "";
for (const line of run("blender/diag_bbox.py").split("\n"))
  if (line.startsWith("BBOX") || line.startsWith("UNITS")) console.log(line);
const out = run("blender/render_worker.py")
  .split("\n")
  .find((l) => l.startsWith("STUDIO_RESULT "));
console.log(out ?? "✘ geen STUDIO_RESULT");
console.log("Bekijk:", join(dir, "out", "01-ooghoogte.png"));
process.exit(out ? 0 : 1);
