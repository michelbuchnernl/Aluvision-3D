import test from "node:test";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  mediaDemoProject,
  demoProject,
  parseProject,
  serialize,
  removeObjects,
  validate,
  collisionWarnings,
} from "../src/model.ts";
import {
  canvasLayout,
  chainSurfaces,
  fitRect,
  sliceUv,
  defaultCanvasPixels,
  projectionSurface,
} from "../src/media.ts";

const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, `${a} ≉ ${b}`);

test("corner demo is valid and stays inside the room", () => {
  const p = mediaDemoProject();
  assert.deepEqual(
    validate(p).filter((i) => i.severity === "error"),
    [],
  );
  assert.equal(p.canvases.length, 1);
});

test("unrolled canvas covers 800 cm and turns exactly 90° with a closed seam", () => {
  const p = mediaDemoProject(),
    c = p.canvases[0],
    l = canvasLayout(p, c);
  assert.equal(l.surfaces.length, 8);
  near(l.developedWidthCm, 800);
  near(l.heightCm, 250);
  assert.equal(l.seams.length, 7);
  assert.deepEqual(
    l.seams.map((s) => s.cornerDeg),
    [0, 0, 0, 0, 0, 0, 90],
  );
  assert.ok(
    l.seams.every((s) => s.gapCm === 0),
    JSON.stringify(l.seams),
  );
  assert.equal(l.seams.at(-1).uPx, 2100);
  assert.equal(l.surfaces[0].facing, "+Z");
  assert.equal(l.surfaces.at(-1).facing, "−X");
  assert.equal(l.surfaces.at(-1).face, "-z");
  near(l.surfaces.at(-1).u0, 0.875);
  near(l.surfaces.at(-1).u1, 1);
  near(l.pxPerCmX, 3);
  near(l.pxPerCmY, 3);
  assert.deepEqual(
    l.issues.map((i) => i.severity),
    ["info"],
    "only the corner note is expected",
  );
});

test("chain ordering recovers wall order from a shuffled selection and flags unlinked panels", () => {
  const p = mediaDemoProject(),
    ids = p.canvases[0].surfaceIds;
  const shuffled = [
    ids[5],
    ids[7],
    ids[0],
    ids[3],
    ids[6],
    ids[1],
    ids[4],
    ids[2],
  ];
  assert.deepEqual(chainSurfaces(p, shuffled).order, ids);
  const stray = p.objects.find(
    (o) => o.definitionId === "panel-100" && o.position.z > 0,
  );
  const r = chainSurfaces(p, [...shuffled, stray.id]);
  assert.deepEqual(r.unlinked.length, 1);
  assert.equal(r.unlinked[0], stray.id);
});

test("a gap between panels is reported in exact centimetres, never closed silently", () => {
  const p = mediaDemoProject();
  const second = p.objects.find((o) => o.id === p.canvases[0].surfaceIds[1]);
  second.position.x += 4;
  const l = canvasLayout(p, p.canvases[0]);
  assert.equal(l.seams[0].gapCm, 4);
  assert.equal(l.seams[1].gapCm, 4);
  assert.ok(
    l.issues.some((i) => i.severity === "warning" && /4 cm/.test(i.message)),
  );
  near(l.developedWidthCm, 800);
});

test("non-square canvas pixels are warned about with both densities", () => {
  const p = mediaDemoProject(),
    c = { ...p.canvases[0], widthPx: 1920, heightPx: 1080 };
  const l = canvasLayout(p, c);
  const w = l.issues.find((i) => /niet vierkant/.test(i.message));
  assert.ok(w && /2.4 px\/cm/.test(w.message) && /4.32 px\/cm/.test(w.message));
});

test("both long walls face inward: right vectors run in opposite directions", () => {
  const p = demoProject(),
    panels = p.objects.filter((o) => o.definitionId === "panel-100");
  const a = projectionSurface(
      p,
      panels.find((o) => o.position.z < 0),
    ),
    b = projectionSurface(
      p,
      panels.find((o) => o.position.z > 0),
    );
  assert.deepEqual([a.normal.z, b.normal.z], [1, -1]);
  assert.deepEqual([a.right.x, b.right.x], [1, -1]);
  assert.deepEqual([a.face, b.face], ["+z", "-z"]);
});

test("fit modes keep aspect ratio exactly", () => {
  const media = { w: 1920, h: 1080 },
    canvas = { w: 2400, h: 750 };
  assert.deepEqual(fitRect(media, canvas, "stretch").dw, 2400);
  const contain = fitRect(media, canvas, "contain");
  near(contain.dh, 750);
  near(contain.dw / contain.dh, 1920 / 1080);
  near(contain.dx * 2 + contain.dw, 2400);
  const cover = fitRect(media, canvas, "cover");
  near(cover.sw / cover.sh, 2400 / 750);
  near(cover.sw, 1920);
  near(cover.sy * 2 + cover.sh, 1080);
});

test("slice UVs map box-face corners onto the panel's share of the canvas", () => {
  const s = { u0: 0.25, u1: 0.375, v0: 0, v1: 1 };
  assert.deepEqual(sliceUv(s, 0, 0), { u: 0.25, v: 0 });
  assert.deepEqual(sliceUv(s, 1, 1), { u: 0.375, v: 1 });
  assert.deepEqual(defaultCanvasPixels(800, 250), {
    widthPx: 2400,
    heightPx: 750,
  });
  assert.deepEqual(defaultCanvasPixels(5000, 250, 3), {
    widthPx: 4096,
    heightPx: 205,
  });
});

test("deleting a surface prunes it from the canvas without removing the canvas", () => {
  const p = mediaDemoProject(),
    gone = p.canvases[0].surfaceIds[3];
  const n = removeObjects(p, [gone]);
  assert.equal(n.canvases[0].surfaceIds.length, 7);
  assert.ok(!n.canvases[0].surfaceIds.includes(gone));
  assert.equal(p.canvases[0].surfaceIds.length, 8, "original untouched");
});

test("media and canvases survive JSON roundtrip; broken references are refused", () => {
  const p = mediaDemoProject();
  const again = parseProject(serialize(p));
  assert.deepEqual(again.canvases, p.canvases);
  assert.deepEqual(again.media, p.media);
  const bad = JSON.parse(serialize(p));
  bad.canvases[0].surfaceIds.push("ghost");
  assert.throws(() => parseProject(JSON.stringify(bad)), /canvas/i);
  const bad2 = JSON.parse(serialize(p));
  bad2.canvases[0].mediaId = "missing";
  assert.throws(() => parseProject(JSON.stringify(bad2)), /canvas/i);
  const bad3 = JSON.parse(serialize(p));
  bad3.canvases[0].fit = "tile";
  assert.throws(() => parseProject(JSON.stringify(bad3)), /canvas/i);
  const legacy = parseProject(serialize(demoProject()));
  assert.equal(legacy.canvases, undefined);
});

test("collision warnings stay free of the corner demo's touching panels", () => {
  const p = mediaDemoProject();
  const w = collisionWarnings(p);
  assert.ok(Array.isArray(w));
});

test("the shipped example file parses and matches the generated corner demo", () => {
  const file = parseProject(
    readFileSync(
      new URL("../examples/corner-canvas-demo.json", import.meta.url),
      "utf8",
    ),
  );
  assert.equal(file.canvases[0].surfaceIds.length, 8);
  assert.equal(canvasLayout(file, file.canvases[0]).seams.at(-1).cornerDeg, 90);
});
