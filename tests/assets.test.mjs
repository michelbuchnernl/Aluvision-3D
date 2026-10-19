import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  readGlbContainer,
  inspectGlb,
  sizeInCm,
  normalizeAsset,
  importedDefinition,
  MAX_ASSET_BYTES,
} from "../src/assetImport.ts";
import { AssetRegistry, assetRegistry, sha256OfBytes } from "../src/assets.ts";
import { createPart } from "../src/sceneGeometry.ts";
import { glbBytes } from "../src/glb.ts";
import {
  demoProject,
  parseProject,
  serialize,
  bom,
  decorativeBom,
  decorativeCount,
  newInstance,
  validate,
} from "../src/model.ts";
import { buildWorkbook } from "../src/exports.ts";

globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((b) => {
      this.result = b;
      this.onloadend?.();
    });
  }
};
const near = (a, b, e = 1e-3) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

async function boxGlb(w = 2, h = 1, d = 0.5, at = [5, 3, -2]) {
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: "#3366cc" }),
  );
  mesh.position.set(...at);
  scene.add(mesh);
  return new GLTFExporter().parseAsync(scene, { binary: true });
}
/** Hand-built GLB (JSON chunk only) for container-level checks. */
function craft(json, { lie = 0 } = {}) {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (text.length % 4)) % 4;
  const jsonBytes = new Uint8Array(text.length + pad).fill(0x20);
  jsonBytes.set(text);
  const out = new ArrayBuffer(20 + jsonBytes.length);
  const v = new DataView(out);
  v.setUint32(0, 0x46546c67, true);
  v.setUint32(4, 2, true);
  v.setUint32(8, out.byteLength + lie, true);
  v.setUint32(12, jsonBytes.length, true);
  v.setUint32(16, 0x4e4f534a, true);
  new Uint8Array(out, 20).set(jsonBytes);
  return out;
}
const minimal = (extra = {}) => ({
  asset: { version: "2.0" },
  meshes: [{ primitives: [] }],
  ...extra,
});

test("container checks refuse truncated, wrong-version, lying-length and external-reference files", () => {
  assert.throws(() => readGlbContainer(new ArrayBuffer(8)), /te klein/);
  const notGlb = new ArrayBuffer(40);
  assert.throws(() => readGlbContainer(notGlb), /magic/);
  const v1 = craft(minimal());
  new DataView(v1).setUint32(4, 1, true);
  assert.throws(() => readGlbContainer(v1), /versie 2/);
  assert.throws(() => readGlbContainer(craft(minimal(), { lie: 4 })), /lengte/);
  assert.throws(
    () =>
      readGlbContainer(
        craft(
          minimal({
            buffers: [{ uri: "http://evil.example/x.bin", byteLength: 4 }],
          }),
        ),
      ),
    /extern bestand/,
  );
  assert.throws(
    () => readGlbContainer(craft(minimal({ images: [{ uri: "tex.png" }] }))),
    /externe afbeelding/,
  );
  assert.throws(
    () =>
      readGlbContainer(
        craft(minimal({ extensionsRequired: ["KHR_draco_mesh_compression"] })),
      ),
    /compressie/,
  );
  assert.throws(
    () => readGlbContainer(craft({ asset: { version: "2.0" } })),
    /geen meshes/,
  );
  assert.throws(
    () => readGlbContainer(craft({ asset: {}, meshes: [{}] })),
    /asset\.version/,
  );
  assert.throws(
    () => readGlbContainer(new ArrayBuffer(MAX_ASSET_BYTES + 1)),
    /groter dan/,
  );
  const ok = readGlbContainer(
    craft(minimal({ cameras: [{}], animations: [{}] })),
  );
  assert.match(ok.warnings.join(" "), /genegeerd/);
});

test("inspection reports file-unit size, triangles and refuses flat or empty geometry", async () => {
  const bytes = await boxGlb();
  const i = await inspectGlb(bytes);
  near(i.size.x, 2);
  near(i.size.y, 1);
  near(i.size.z, 0.5);
  assert.equal(i.triangles, 12);
  assert.equal(i.meshes, 1);
  const flat = new THREE.Scene();
  flat.add(
    new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshStandardMaterial(),
    ),
  );
  const flatBytes = await new GLTFExporter().parseAsync(flat, { binary: true });
  await assert.rejects(inspectGlb(flatBytes), /nul of onbepaald/);
});

test("units are explicit: the same file is 200, 2 or 0.2 cm wide depending on the choice", async () => {
  const i = await inspectGlb(await boxGlb());
  near(sizeInCm(i.size, "m").x, 200);
  near(sizeInCm(i.size, "cm").x, 2);
  near(sizeInCm(i.size, "mm").x, 0.2);
});

test("normalisation puts the model on the floor, centred, in centimetres", async () => {
  const i = await inspectGlb(await boxGlb());
  const g = normalizeAsset(i.scene, "m");
  const b = new THREE.Box3().setFromObject(g, true);
  near(b.min.y, 0);
  near((b.min.x + b.max.x) / 2, 0);
  near((b.min.z + b.max.z) / 2, 0);
  near(b.max.x - b.min.x, 200);
  near(b.max.y - b.min.y, 100);
});

const file = async (bytes) => ({
  sha256: await sha256OfBytes(bytes),
  bytes: bytes.byteLength,
  fileName: "kist.glb",
});
async function projectWithAsset(role) {
  const bytes = await boxGlb();
  const f = await file(bytes);
  const i = await assetRegistry.add(f.sha256, bytes, false);
  const p = demoProject();
  const def = importedDefinition(
    "imp-1",
    { name: "Kist", units: "m", role, provenance: "Eigen model" },
    i,
    f,
  );
  p.definitions.push(def);
  return { p, def, f, i };
}

test("imported definition: explicit provenance, honest status, no invented SKU", async () => {
  const { def } = await projectWithAsset("custom");
  assert.equal(def.source, "imported");
  assert.equal(def.kind, "asset");
  assert.match(def.catalogId, /^IMP-[0-9A-F]{8}$/);
  assert.deepEqual(def.size, { x: 200, y: 100, z: 50 });
  assert.equal(def.decorative, false);
  const bytes = await boxGlb();
  const f = await file(bytes);
  const i = await inspectGlb(bytes);
  assert.throws(
    () =>
      importedDefinition(
        "x",
        { name: " ", units: "m", role: "custom", provenance: "ok!" },
        i,
        f,
      ),
    /naam/,
  );
  assert.throws(
    () =>
      importedDefinition(
        "x",
        { name: "A", units: "m", role: "custom", provenance: "" },
        i,
        f,
      ),
    /herkomst/,
  );
  assert.throws(
    () =>
      importedDefinition(
        "x",
        { name: "A", units: "km", role: "custom", provenance: "ok!" },
        i,
        f,
      ),
    /eenheden/,
  );
  assert.throws(
    () =>
      importedDefinition(
        "x",
        { name: "A", units: "m", role: "custom", provenance: "ok!" },
        { ...i, size: { x: 9e5, y: 1, z: 1 } },
        f,
      ),
    /1 km/,
  );
});

test("project validation accepts complete imports and refuses tampered or half-specified ones", async () => {
  const { p, def } = await projectWithAsset("custom");
  const again = parseProject(serialize(p));
  assert.deepEqual(
    again.definitions.find((d) => d.id === "imp-1"),
    def,
  );
  const mutate = (fn) => {
    const q = JSON.parse(serialize(p));
    fn(q.definitions.find((d) => d.id === "imp-1"));
    return () => parseProject(JSON.stringify(q));
  };
  assert.throws(
    mutate((d) => (d.asset.sha256 = "xyz")),
    /definitie/,
  );
  assert.throws(
    mutate((d) => delete d.asset),
    /definitie/,
  );
  assert.throws(
    mutate((d) => (d.asset.provenance = "")),
    /definitie/,
  );
  assert.throws(
    mutate((d) => (d.asset.units = "km")),
    /definitie/,
  );
  assert.throws(
    mutate((d) => (d.decorative = "ja")),
    /definitie/,
  );
  assert.throws(
    mutate((d) => (d.kind = "frame")),
    /definitie/,
  );
  const q = JSON.parse(serialize(demoProject()));
  q.definitions[0].asset = { sha256: "a".repeat(64) };
  assert.throws(
    () => parseProject(JSON.stringify(q)),
    /definitie/,
    "synthetic parts cannot carry assets",
  );
});

test("decorative objects stay out of the structural BOM and are listed separately; counts reconcile", async () => {
  const { p } = await projectWithAsset("decorative");
  const before = bom(p).reduce((n, r) => n + r.quantity, 0);
  p.objects.push(
    newInstance(p, "imp-1", { x: 100, y: 0, z: 100 }),
    newInstance(p, "imp-1", { x: -100, y: 0, z: 100 }),
  );
  assert.equal(decorativeCount(p), 2);
  assert.equal(
    bom(p).reduce((n, r) => n + r.quantity, 0),
    before,
    "structural total unchanged",
  );
  assert.ok(!bom(p).some((r) => r.definitionId === "imp-1"));
  const dec = decorativeBom(p);
  assert.equal(dec.length, 1);
  assert.equal(dec[0].quantity, 2);
  assert.equal(dec[0].status, "Decoratief · buiten BOM");
  assert.equal(before + decorativeCount(p), p.objects.length);
});

test("a custom (non-decorative) import is in the BOM with an unverified status", async () => {
  const { p } = await projectWithAsset("custom");
  p.objects.push(newInstance(p, "imp-1", { x: 100, y: 0, z: 100 }));
  const row = bom(p).find((r) => r.definitionId === "imp-1");
  assert.equal(row.quantity, 1);
  assert.equal(row.status, "Geïmporteerd · niet geverifieerd");
  assert.equal(row.kind, "asset");
});

test("Excel: structural sheets exclude decorative parts, a separate sheet lists them, totals reconcile", async () => {
  const { p } = await projectWithAsset("decorative");
  p.objects.push(newInstance(p, "imp-1", { x: 100, y: 0, z: 100 }));
  const w = buildWorkbook(p);
  const names = w.worksheets.map((s) => s.name);
  assert.ok(names.includes("Decoratief"), names.join());
  const parts = w.getWorksheet("Onderdelen"),
    inst = w.getWorksheet("Exemplaren"),
    dec = w.getWorksheet("Decoratief");
  const text = (ws) => JSON.stringify(ws.getSheetValues());
  assert.ok(!text(parts).includes("Kist"));
  assert.ok(!text(inst).includes("Kist"));
  assert.ok(text(dec).includes("Kist"));
  assert.equal(
    inst.rowCount - 1,
    p.objects.length - 1,
    "instances sheet = structural only",
  );
  assert.match(text(w.getWorksheet("Project")), /Decoratief: 1/);
});

test("rendering: loaded model matches the declared size exactly; a missing model is a visible placeholder", async () => {
  const { def } = await projectWithAsset("custom");
  const part = createPart(def, new THREE.MeshBasicMaterial());
  const b = new THREE.Box3().setFromObject(part, true);
  near(b.min.y, 0);
  near(b.max.x - b.min.x, def.size.x);
  near(b.max.y - b.min.y, def.size.y);
  near(b.max.z - b.min.z, def.size.z);
  // Resizing the definition stretches the model; bounds follow the declared size.
  const stretched = createPart(
    { ...def, size: { x: 100, y: 100, z: 100 } },
    new THREE.MeshBasicMaterial(),
  );
  const sb = new THREE.Box3().setFromObject(stretched, true);
  near(sb.max.x - sb.min.x, 100);
  const missing = createPart(
    { ...def, asset: { ...def.asset, sha256: "f".repeat(64) } },
    new THREE.MeshBasicMaterial(),
  );
  assert.equal(missing.userData.assetMissing, true);
  const mb = new THREE.Box3().setFromObject(missing, true);
  near(mb.max.x - mb.min.x, def.size.x);
});

test("an imported part past the room limit is reported like any other physical object", async () => {
  const { p } = await projectWithAsset("decorative");
  p.objects.push(newInstance(p, "imp-1", { x: 380, y: 0, z: 0 })); // 200 cm wide, centred at 380 → outside
  assert.ok(
    validate(p).some(
      (i) => i.severity === "error" && /buiten ruimte/.test(i.message),
    ),
  );
});

test("GLB export carries imported parts with their flags; a missing asset blocks the export", async () => {
  const { p } = await projectWithAsset("decorative");
  p.objects.push(newInstance(p, "imp-1", { x: 100, y: 0, z: 100 }));
  const gltf = await new GLTFLoader().parseAsync(await glbBytes(p), "");
  const nodes = [];
  gltf.scene.traverse((n) => n.userData.imported && nodes.push(n));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].userData.decorative, true);
  assert.equal(nodes[0].userData.kind, "asset");
  const gone = JSON.parse(serialize(p));
  gone.definitions.find((d) => d.id === "imp-1").asset.sha256 = "e".repeat(64);
  await assert.rejects(
    glbBytes(parseProject(JSON.stringify(gone))),
    /niet geladen/,
  );
});

test("registry refuses to serve what it could not parse and keeps shared textures alive", async () => {
  const reg = new AssetRegistry();
  await assert.rejects(
    reg.add("a".repeat(64), new ArrayBuffer(64), false),
    /Ongeldig GLB/,
  );
  assert.equal(reg.has("a".repeat(64)), false);
  const bytes = await boxGlb();
  const sha = await sha256OfBytes(bytes);
  await reg.add(sha, bytes, false);
  assert.ok(reg.has(sha));
  assert.equal(reg.bytesFor(sha).byteLength, bytes.byteLength);
  let notified = 0;
  reg.subscribe(() => notified++);
  await reg.ensure([sha, "b".repeat(64)]);
  assert.equal(
    notified,
    0,
    "ensure() does not reload what is present or missing from storage",
  );
});
