// Opt-in: runs the real worker in a real Blender. Skipped unless BLENDER_PATH is set.
//   BLENDER_PATH=/Applications/Blender.app/Contents/MacOS/Blender npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ProjectStore } from "../server/store.ts";
import {
  RenderQueue,
  RenderService,
  blenderRunner,
} from "../server/renders.ts";
import { buildRenderSpec } from "../src/renderSpec.ts";
import { glbBytes } from "../src/glb.ts";
import { mediaDemoProject } from "../src/model.ts";

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const blender = process.env.BLENDER_PATH;
const skip = blender
  ? false
  : "BLENDER_PATH niet gezet: echte Blender-test overgeslagen";
const worker = resolve("blender/render_worker.py");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function setup() {
  const p = mediaDemoProject();
  p.cameras.push({
    id: "c1",
    name: "Zicht",
    position: { x: -380, y: 165, z: 60 },
    target: { x: 200, y: 120, z: -40 },
    orthographic: false,
  });
  p.cameras.push({
    id: "c2",
    name: "Boven",
    position: { x: 0, y: 900, z: 1 },
    target: { x: 0, y: 0, z: 0 },
    orthographic: true,
    frustumHeight: 900,
  });
  const glb = Buffer.from(await glbBytes(p));
  const store = new ProjectStore();
  store.create(p);
  const dir = mkdtempSync(join(tmpdir(), "render-blender-"));
  const queue = new RenderQueue(store.db, dir);
  const spec = buildRenderSpec(
    p,
    1,
    { preset: "presentation", width: 480, height: 270, samples: 8 },
    {
      sha256: createHash("sha256").update(glb).digest("hex"),
      bytes: glb.length,
    },
  );
  return {
    queue,
    glb,
    spec,
    dir,
    done: () => (store.close(), rmSync(dir, { recursive: true, force: true })),
  };
}

test(
  "queue + real Blender: a two-camera job renders, is verified from disk and ends up done",
  { skip, timeout: 240000 },
  async () => {
    const t = await setup();
    const job = t.queue.enqueue(t.spec, t.glb);
    const service = new RenderService(
      t.queue,
      blenderRunner(blender, worker, 180000),
    );
    const done = await service.processNext();
    assert.equal(done.id, job.id);
    assert.equal(done.status, "done", done.message);
    assert.equal(done.attempts, 1);
    assert.equal(done.outputs.length, 2);
    for (const o of done.outputs) {
      const bytes = readFileSync(t.queue.outputPath(job.id, o.file));
      assert.ok(bytes.subarray(0, 8).equals(PNG));
      assert.equal(createHash("sha256").update(bytes).digest("hex"), o.sha256);
      assert.ok(bytes.length > 2000, `${o.file} is suspiciously small`);
    }
    // The perspective and orthographic views must differ, otherwise the camera setup is ignored.
    const [a, b] = done.outputs.map((o) => o.sha256);
    assert.notEqual(a, b);
    t.done();
  },
);

test(
  "queue + real Blender: a tampered scene is rejected by the worker; three attempts end in 'failed' with evidence",
  { skip, timeout: 240000 },
  async () => {
    const t = await setup();
    const job = t.queue.enqueue(t.spec, t.glb);
    const bad = Buffer.from(t.glb);
    bad[bad.length - 1] ^= 1;
    writeFileSync(join(t.queue.jobDir(job.id), "scene.glb"), bad);
    const service = new RenderService(
      t.queue,
      blenderRunner(blender, worker, 120000),
    );
    const states = [];
    for (let i = 0; i < 4; i++)
      states.push((await service.processNext())?.status);
    assert.deepEqual(states, ["queued", "queued", "failed", undefined]);
    const j = t.queue.get(job.id);
    assert.equal(j.attempts, 3);
    assert.match(j.message, /Mislukt na 3 pogingen/);
    assert.match(j.message, /checksum|STUDIO_ERROR/);
    t.done();
  },
);

test(
  "a missing Blender executable fails cleanly instead of hanging",
  { skip, timeout: 60000 },
  async () => {
    const t = await setup();
    const job = t.queue.enqueue(t.spec, t.glb);
    const service = new RenderService(
      t.queue,
      blenderRunner("/nonexistent/Blender", worker, 5000),
    );
    const r = await service.processNext();
    assert.equal(r.status, "queued");
    assert.match(r.message, /ENOENT|nonexistent/);
    assert.equal(t.queue.get(job.id).attempts, 1);
    t.done();
  },
);
