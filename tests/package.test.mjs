import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, unzipSync, strToU8 } from "fflate";
import { mediaDemoProject, demoProject } from "../src/model.ts";
import { glbBytes } from "../src/glb.ts";
import { xlsxBytes } from "../src/exports.ts";
import { buildPackage, readPackage, sha256Hex } from "../src/projectPackage.ts";

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
async function make(p = mediaDemoProject()) {
  const glb = new Uint8Array(await glbBytes(p)),
    xlsx = new Uint8Array(await xlsxBytes(p));
  return {
    p,
    zip: await buildPackage(p, { glb, xlsx }, "2026-10-19T10:00:00.000Z"),
    glb,
    xlsx,
  };
}
const tamper = (zip, fn) => {
  const files = unzipSync(zip);
  fn(files);
  return zipSync(files);
};

test("package round-trips: same project, GLB and BOM bytes, checksums listed for each file", async () => {
  const { p, zip, glb } = await make();
  const r = await readPackage(zip);
  assert.deepEqual(r.project.objects, p.objects);
  assert.deepEqual(r.project.canvases, p.canvases);
  assert.equal(r.manifest.counts.objects, p.objects.length);
  assert.deepEqual(r.manifest.files.map((f) => f.path).sort(), [
    "README.txt",
    "bom.xlsx",
    "project.json",
    "scene.glb",
  ]);
  const entry = r.manifest.files.find((f) => f.path === "scene.glb");
  assert.equal(entry.sha256, await sha256Hex(glb));
  assert.deepEqual(r.warnings, [], "test pattern needs no re-attach");
});

test("uploaded media is listed for re-attachment, not silently dropped", async () => {
  const p = mediaDemoProject();
  p.media.push({
    id: "m1",
    name: "show.mp4",
    kind: "video",
    widthPx: 1920,
    heightPx: 1080,
    bytes: 5,
    sha256: "a".repeat(64),
  });
  const { zip } = await make(p);
  const r = await readPackage(zip);
  assert.match(r.warnings[0], /show\.mp4/);
  assert.equal(r.manifest.mediaToReattach[0].sha256, "a".repeat(64));
  assert.deepEqual(
    r.project.media.map((m) => m.id),
    p.media.map((m) => m.id),
  );
});

test("any changed file is detected by its checksum", async () => {
  const { zip } = await make();
  const edited = tamper(zip, (f) => {
    const j = JSON.parse(new TextDecoder().decode(f["project.json"]));
    j.name = "Gewijzigd";
    f["project.json"] = strToU8(JSON.stringify(j));
  });
  await assert.rejects(
    readPackage(edited),
    /controlesom van project\.json|andere grootte/,
  );
  const glbEdited = tamper(zip, (f) => {
    const g = new Uint8Array(f["scene.glb"]);
    g[g.length - 1] ^= 1;
    f["scene.glb"] = g;
  });
  await assert.rejects(readPackage(glbEdited), /controlesom van scene\.glb/);
});

test("missing, extra, renamed or traversal entries are refused", async () => {
  const { zip } = await make();
  await assert.rejects(
    readPackage(tamper(zip, (f) => delete f["scene.glb"])),
    /scene\.glb ontbreekt/,
  );
  await assert.rejects(
    readPackage(tamper(zip, (f) => delete f["manifest.json"])),
    /manifest/,
  );
  await assert.rejects(
    readPackage(tamper(zip, (f) => (f["extra.txt"] = strToU8("x")))),
    /onverwacht/,
  );
  await assert.rejects(
    readPackage(tamper(zip, (f) => (f["../evil.json"] = strToU8("{}")))),
    /onverwacht/,
  );
  await assert.rejects(
    readPackage(new Uint8Array([1, 2, 3, 4])),
    /Ongeldig projectpakket/,
  );
});

test("manifest lies about counts or project id are refused", async () => {
  const { zip } = await make();
  const counts = tamper(zip, (f) => {
    const m = JSON.parse(new TextDecoder().decode(f["manifest.json"]));
    m.counts.objects += 1;
    f["manifest.json"] = strToU8(JSON.stringify(m));
  });
  await assert.rejects(readPackage(counts), /aantallen/);
  const id = tamper(zip, (f) => {
    const m = JSON.parse(new TextDecoder().decode(f["manifest.json"]));
    m.projectId = "ander";
    f["manifest.json"] = strToU8(JSON.stringify(m));
  });
  await assert.rejects(readPackage(id), /project-id/);
});

test("a package of a plain demo project reimports into a project the editor accepts", async () => {
  const { p, zip } = await make(demoProject());
  const r = await readPackage(zip);
  assert.equal(r.project.id, p.id);
  assert.equal(r.project.canvases, undefined);
});
