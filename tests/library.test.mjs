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
import { join } from "node:path";
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
