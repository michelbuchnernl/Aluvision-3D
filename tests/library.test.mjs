import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Library } from "../server/library.ts";
import { ProjectStore } from "../server/store.ts";
import { createStudioServer } from "../server/http.ts";
import { StudioClient } from "../src/serverClient.ts";

const sha = (b) => createHash("sha256").update(b).digest("hex");
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "lib-test-"));
  mkdirSync(join(dir, "glb"));
  const files = {
    "Kist__aaaaaaaa.glb": Buffer.from("glTF-fake-one"),
    "Zwaar__bbbbbbbb.glb": Buffer.from("glTF-fake-two-is-longer"),
  };
  for (const [n, b] of Object.entries(files))
    writeFileSync(join(dir, "glb", n), b);
  const entry = (file, extra = {}) => ({
    warehouseId: "aaaaaaaa-0000-0000-0000-000000000000",
    name: "Kist",
    status: "ready",
    file: "glb/" + file,
    bytes: files[file]?.length ?? 5,
    sha256: sha(files[file] ?? "x"),
    triangles: 12,
    sizeCm: { x: 10, y: 20, z: 30 },
    provenance:
      "Aluvision Exhibits, SketchUp 3D Warehouse: https://3dwarehouse.sketchup.com/model.html?id=aaaa",
    warehouse: {
      description: "49-34-0211\n",
      domain: "FilmAndStage",
      url: "https://3dwarehouse.sketchup.com/model.html?id=aaaa",
    },
    notes: ["let op"],
    ...extra,
  });
  const manifest = {
    source: "Aluvision Exhibits, SketchUp 3D Warehouse",
    summary: { ready: 1, refused: 1, missing: 3 },
    models: [
      entry("Kist__aaaaaaaa.glb"),
      entry("Zwaar__bbbbbbbb.glb", {
        name: "Zwaar",
        status: "refused",
        reason: "groter dan 25 MB",
      }),
      entry("Kist__aaaaaaaa.glb", { file: "glb/../../etc/passwd.glb" }),
      entry("Kist__aaaaaaaa.glb", { sha256: "nope" }),
      entry("Kist__aaaaaaaa.glb", { sizeCm: { x: 0, y: 1, z: 1 } }),
      entry("Kist__aaaaaaaa.glb", {
        file: "glb/Anders__cccccccc.glb",
        warehouse: { url: "https://evil.example/x" },
      }),
      null,
    ],
  };
  writeFileSync(join(dir, "manifest.json"), JSON.stringify(manifest));
  return {
    dir,
    files,
    done: () => rmSync(dir, { recursive: true, force: true }),
  };
}

test("listing keeps only well-formed entries, passes provenance through and drops non-Warehouse URLs", () => {
  const f = fixture();
  const l = new Library(f.dir).listing();
  assert.equal(l.available, true);
  assert.deepEqual(
    l.models.map((m) => [m.file, m.status]),
    [
      ["Kist__aaaaaaaa.glb", "ready"],
      ["Zwaar__bbbbbbbb.glb", "refused"],
      ["Anders__cccccccc.glb", "ready"],
    ],
  );
  assert.equal(l.models[1].reason, "groter dan 25 MB");
  assert.match(
    l.models[0].provenance,
    /Aluvision Exhibits, SketchUp 3D Warehouse/,
  );
  assert.equal(
    l.models[0].url?.startsWith("https://3dwarehouse.sketchup.com/"),
    true,
  );
  assert.equal(l.models[2].url, undefined, "foreign URL is not passed on");
  assert.deepEqual(l.summary, { ready: 2, refused: 1, missing: 3 });
  f.done();
});

test("only ready, unchanged files are served; traversal, refused and changed files are not", () => {
  const f = fixture();
  const lib = new Library(f.dir);
  assert.ok(lib.pathFor("Kist__aaaaaaaa.glb"));
  assert.equal(lib.pathFor("Zwaar__bbbbbbbb.glb"), undefined, "refused");
  assert.equal(
    lib.pathFor("Anders__cccccccc.glb"),
    undefined,
    "listed but absent on disk",
  );
  assert.equal(lib.pathFor("../manifest.json"), undefined);
  assert.equal(lib.pathFor("..%2Fmanifest.json"), undefined);
  assert.equal(lib.pathFor("manifest.json"), undefined);
  writeFileSync(
    join(f.dir, "glb", "Kist__aaaaaaaa.glb"),
    Buffer.from("changed after the manifest was built"),
  );
  assert.equal(
    lib.pathFor("Kist__aaaaaaaa.glb"),
    undefined,
    "size no longer matches the manifest",
  );
  f.done();
});

test("missing or broken manifest reports unavailable with a hint instead of failing", () => {
  const dir = mkdtempSync(join(tmpdir(), "lib-empty-"));
  assert.match(new Library(dir).listing().hint, /build_manifest/);
  writeFileSync(join(dir, "manifest.json"), "{ not json");
  assert.equal(new Library(dir).listing().available, false);
  rmSync(dir, { recursive: true, force: true });
});

test("HTTP: listing and file download work through the studio API; refused and traversal paths give 404", async () => {
  const f = fixture();
  const store = new ProjectStore(),
    app = createStudioServer({ store, library: new Library(f.dir) });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  const l = await client.request("/library");
  assert.equal(l.models.length, 3);
  const ok = await client.blob("/library/files/Kist__aaaaaaaa.glb");
  assert.deepEqual(
    Buffer.from(await ok.arrayBuffer()),
    f.files["Kist__aaaaaaaa.glb"],
  );
  const raw = await fetch(base + "/api/library/files/Kist__aaaaaaaa.glb", {
    headers: { cookie, "x-studio-client": client.clientId },
  });
  assert.equal(
    raw.headers.get("x-content-sha256"),
    sha(f.files["Kist__aaaaaaaa.glb"]),
  );
  assert.equal(raw.headers.get("content-type"), "model/gltf-binary");
  await raw.arrayBuffer();
  for (const bad of ["Zwaar__bbbbbbbb.glb", "..%2Fmanifest.json", "nope.glb"]) {
    const r = await fetch(base + "/api/library/files/" + bad, {
      headers: { cookie, "x-studio-client": client.clientId },
    });
    assert.equal(r.status, 404, bad);
    await r.text();
  }
  await new Promise((r) => app.server.close(r));
  store.close();
  f.done();
});

test("HTTP without a library says so", async () => {
  const store = new ProjectStore(),
    app = createStudioServer({ store });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  const l = await client.request("/library");
  assert.equal(l.available, false);
  await new Promise((r) => app.server.close(r));
  store.close();
});

// The real library is local-only and git-ignored; these checks run when it is present.
const real = "library/aluvision";
const hasReal = existsSync(join(real, "manifest.json"));
test(
  "real library: manifest entries exist on disk, match their checksums and stay within importer limits",
  { skip: hasReal ? false : "library/aluvision niet aanwezig" },
  () => {
    const lib = new Library(real),
      l = lib.listing();
    const ready = l.models.filter((m) => m.status === "ready");
    assert.ok(ready.length >= 500, `only ${ready.length} ready`);
    assert.equal(
      new Set(ready.map((m) => m.file)).size,
      ready.length,
      "file names are unique",
    );
    for (const m of ready) {
      assert.ok(m.bytes <= 25_000_000, `${m.file} exceeds the importer limit`);
      assert.ok(m.triangles > 0 && m.triangles <= 500_000, m.file);
      const hit = lib.pathFor(m.file);
      assert.ok(hit, `${m.file} missing or changed`);
      assert.equal(sha(readFileSync(hit.path)), m.sha256, `${m.file} checksum`);
    }
    assert.ok(
      l.models.filter((m) => m.status === "refused").every((m) => m.reason),
    );
  },
);

test("file names with '+' (real library has many) are listed, served and URL-encoded correctly", async () => {
  const dir = mkdtempSync(join(tmpdir(), "lib-plus-"));
  mkdirSync(join(dir, "glb"));
  const bytes = Buffer.from("glTF-plus-file");
  writeFileSync(join(dir, "glb", "Omni-55+_A1__abcdef01.glb"), bytes);
  writeFileSync(
    join(dir, "manifest.json"),
    JSON.stringify({
      summary: { missing: 0 },
      models: [
        {
          name: "Omni-55+ A1",
          status: "ready",
          file: "glb/Omni-55+_A1__abcdef01.glb",
          bytes: bytes.length,
          sha256: sha(bytes),
          triangles: 1,
          sizeCm: { x: 1, y: 1, z: 1 },
          provenance: "p",
        },
      ],
    }),
  );
  const store = new ProjectStore(),
    app = createStudioServer({ store, library: new Library(dir) });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  let cookie = "";
  const client = new StudioClient(async (path, init) => {
    const r = await fetch(base + path, {
      ...init,
      headers: { ...init.headers, ...(cookie ? { cookie } : {}) },
    });
    const set = r.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0];
    return r;
  });
  const l = await client.request("/library");
  assert.equal(l.models[0].file, "Omni-55+_A1__abcdef01.glb");
  const blob = await client.blob(
    "/library/files/" + encodeURIComponent(l.models[0].file),
  );
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()), bytes);
  await new Promise((r) => app.server.close(r));
  store.close();
  rmSync(dir, { recursive: true, force: true });
});

test("the library's binaries can never be committed by accident: the folder is git-ignored and untracked", () => {
  const run = (...args) => spawnSync("git", args, { encoding: "utf8" });
  if (run("rev-parse", "--is-inside-work-tree").status !== 0) return; // no git here
  assert.equal(
    run("check-ignore", "-q", "library/aluvision/glb/x.glb").status,
    0,
    "library/ must be ignored",
  );
  assert.equal(
    run("ls-files", "library").stdout.trim(),
    "",
    "no library file may be tracked",
  );
  assert.notEqual(
    run("check-ignore", "-q", "scripts/library/build_manifest.py").status,
    0,
    "scripts stay trackable",
  );
});

// ---- classes and previews ----
function classFixture() {
  const f = fixture();
  mkdirSync(join(f.dir, "previews"));
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from("fake-png"),
  ]);
  writeFileSync(join(f.dir, "previews", "Kist__aaaaaaaa.png"), png);
  writeFileSync(
    join(f.dir, "classes.json"),
    JSON.stringify({
      classes: [
        { id: "stands", label: "Standconcepten", description: "x" },
        { id: "connections", label: "Verbindingen", description: "y" },
        { id: "empty", label: "Leeg", description: "z" },
        { id: "other", label: "Overig", description: "w" },
        { id: "BAD ID", label: "Kapot", description: "" },
      ],
      models: {
        "Kist__aaaaaaaa.glb": { class: "connections", group: "Joining sets" },
        "Anders__cccccccc.glb": { class: "nonexistent" },
        "../evil.glb": { class: "stands" },
      },
    }),
  );
  return { ...f, png };
}

test("classes: files are grouped, unknown classes fall back to 'other', empty classes disappear, bad ids are ignored", () => {
  const f = classFixture();
  const l = new Library(f.dir).listing();
  const kist = l.models.find((m) => m.file === "Kist__aaaaaaaa.glb");
  assert.deepEqual([kist.class, kist.group], ["connections", "Joining sets"]);
  assert.equal(
    l.models.find((m) => m.file === "Anders__cccccccc.glb").class,
    "other",
  );
  assert.equal(
    l.models.find((m) => m.file === "Zwaar__bbbbbbbb.glb").class,
    "other",
    "unlisted files also fall back",
  );
  assert.deepEqual(
    l.classes.map((c) => [c.id, c.count]),
    [
      ["connections", 1],
      ["other", 1],
    ],
    "only classes with ready models, counted",
  );
  assert.ok(!l.classes.some((c) => c.id === "BAD ID" || c.id === "empty"));
  f.done();
});

test("without classes.json everything still lists, ungrouped", () => {
  const f = fixture();
  const l = new Library(f.dir).listing();
  assert.deepEqual(l.classes, []);
  assert.ok(l.models.every((m) => m.class === ""));
  f.done();
});

test("previews: flagged by existence, served without the tab header, traversal and unlisted names give 404", async () => {
  const f = classFixture();
  const lib = new Library(f.dir);
  const byFile = Object.fromEntries(
    lib.listing().models.map((m) => [m.file, m.preview]),
  );
  assert.equal(byFile["Kist__aaaaaaaa.glb"], true);
  assert.equal(byFile["Zwaar__bbbbbbbb.glb"], false);
  assert.ok(lib.previewPathFor("Kist__aaaaaaaa.png"));
  assert.ok(lib.previewPathFor("Kist__aaaaaaaa.glb"));
  assert.equal(lib.previewPathFor("../manifest.png"), undefined);
  assert.equal(
    lib.previewPathFor("Zwaar__bbbbbbbb.png"),
    undefined,
    "listed but no image",
  );
  const store = new ProjectStore(),
    app = createStudioServer({ store, library: lib });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const session = await fetch(base + "/api/session");
  const cookie = session.headers.get("set-cookie").split(";")[0];
  await session.text();
  const ok = await fetch(base + "/api/library/previews/Kist__aaaaaaaa.png", {
    headers: { cookie },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await ok.arrayBuffer()), f.png);
  for (const bad of [
    "Zwaar__bbbbbbbb.png",
    "..%2Fmanifest.png",
    "%E0%A4%A",
    "nope.png",
  ]) {
    const r = await fetch(base + "/api/library/previews/" + bad, {
      headers: { cookie },
    });
    assert.equal(r.status, 404, bad);
    await r.text();
  }
  const noSession = await fetch(
    base + "/api/library/previews/Kist__aaaaaaaa.png",
  );
  assert.equal(noSession.status, 401, "no session cookie, no image");
  await noSession.text();
  await new Promise((r) => app.server.close(r));
  store.close();
  f.done();
});

test("classify.py: representative names land in the intended classes and nothing is lost", () => {
  const dir = mkdtempSync(join(tmpdir(), "classify-"));
  mkdirSync(join(dir, "library", "aluvision"), { recursive: true });
  const names = {
    "6x3P 001": ["stands", "6×3 m"],
    "Essential Collection 3": ["stands", "Collecties"],
    "connection 4P 90° LS30": ["connections", "Verbindingsknopen"],
    "Fab-55 frame clamp D30 G": ["connections", "Framekleminen"],
    "quick tightener D6*100 A": ["fasteners", "Quick tighteners"],
    "QuiXy wall unit 992*2418 A": ["quixy", null],
    "Hi-LED PRO 496x496 P1.9/P1.5 OR": ["led", null],
    "Omni -55 POP door": ["doors", null],
    "Basic-55 base V7 L": ["bases", null],
    "Step ON profile /m A": ["floors", "Step-podia"],
    "Flexbox railing module": ["flex", "Flexbox"],
    "Omni-55 A1/A3": ["frames", "Frames"],
    "folderholder D15 L G": ["interior", null],
    "Benta!": ["furniture", "Balies & bars"],
    "quick tightener door-to-door I": ["fasteners", "Quick tighteners"],
    "cover Omni-55 90° wall reinforcement": ["covers", null],
    "base clamp D30 quickfix v2": ["connections", "Framekleminen"],
    "Omni-55 A3 wall reinforcement 180° L": ["rigging", null],
    "Zonder Bekende Woorden": ["other", null],
  };
  const models = Object.keys(names).map((name, i) => ({
    name,
    status: "ready",
    file: `glb/f${i}__abcdef0${i % 10}.glb`,
  }));
  writeFileSync(
    join(dir, "library", "aluvision", "manifest.json"),
    JSON.stringify({ models }),
  );
  const run = spawnSync(
    "python3",
    ["-B", "-I", resolve("scripts/library/classify.py")],
    { cwd: dir, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(
    readFileSync(join(dir, "library", "aluvision", "classes.json"), "utf8"),
  );
  models.forEach((m) => {
    const got = out.models[m.file.replace("glb/", "")];
    assert.deepEqual([got.class, got.group], names[m.name], m.name);
  });
  assert.equal(Object.keys(out.models).length, models.length);
  assert.ok(out.classes.every((c) => c.id && c.label));
  rmSync(dir, { recursive: true, force: true });
});

test(
  "real library: every ready model has a class and few fall into 'other'",
  {
    skip:
      hasReal && existsSync(join(real, "classes.json"))
        ? false
        : "classes.json niet aanwezig",
  },
  () => {
    const l = new Library(real).listing();
    const ready = l.models.filter((m) => m.status === "ready");
    assert.ok(
      ready.every((m) => m.class),
      "unclassified model present",
    );
    const other = ready.filter((m) => m.class === "other").length;
    assert.ok(
      other <= Math.max(5, ready.length * 0.05),
      `${other} models in 'other'`,
    );
    assert.ok(l.classes.length >= 8, "expected a real taxonomy");
  },
);
