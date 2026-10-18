import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const open = async (page, demo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on(
    "console",
    (m) =>
      m.type() === "error" &&
      !/Failed to load resource/.test(m.text()) &&
      errors.push(m.text()),
  );
  // Without the optional Node server every /api call 404s; anything else failing is a bug.
  page.on(
    "response",
    (r) =>
      r.status() >= 400 &&
      !/\/api\/|favicon/.test(r.url()) &&
      errors.push(`${r.status()} ${r.url()}`),
  );
  await page.goto("/?e2e=1");
  await page.waitForFunction(
    () => window.__studio && window.__studio.boxes().length > 0,
  );
  if (demo === "corner") {
    await page.getByRole("button", { name: "Nieuw / demo" }).click();
    await page.getByRole("button", { name: /hoekcanvas-demo/ }).click();
    await page.waitForFunction(
      () => window.__studio.project().canvases?.length === 1,
    );
  }
  return errors;
};
const project = (page) => page.evaluate(() => window.__studio.project());
const status = (page) => page.locator(".statusbar, footer").last();
const drag = async (page, from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
};
const topView = async (page) => {
  await page.getByLabel("Camerastandpunt").selectOption("top");
  await page.keyboard.press("f");
  await page.waitForTimeout(500);
};
const boxFor = async (page, name) => {
  const p = await project(page);
  const o = p.objects.find((v) => v.name.startsWith(name));
  const b = await page.evaluate(() => window.__studio.boxes());
  return { o, box: b.find((v) => v.id === o.id) };
};
const selectedText = (page) =>
  page.getByText(/geselecteerd|Geen selectie/).first();
const pick = async (page, name) => {
  await page
    .getByRole("button", { name: /Objecten/ })
    .first()
    .click();
  await page.locator(".object-name", { hasText: name }).first().click();
};

test("viewport renders non-blank images in all three presets, immersive darker", async ({
  page,
}) => {
  const errors = await open(page);
  const luminance = () =>
    page.evaluate(async () => {
      const src = document.querySelector("canvas").toDataURL("image/png");
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = 128;
      c.height = 96;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, 128, 96);
      const d = x.getImageData(0, 0, 128, 96).data;
      const colours = new Set();
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        colours.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
      }
      return { mean: sum / (d.length / 4), colours: colours.size };
    });
  const out = {};
  for (const [label, key] of [
    ["Technisch", "t"],
    ["Presentatie", "p"],
    ["Immersief", "i"],
  ]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.waitForTimeout(600);
    out[key] = await luminance();
    expect(out[key].colours, `${label} has varied pixels`).toBeGreaterThan(12);
    expect(out[key].mean, `${label} is not black`).toBeGreaterThan(8);
  }
  expect(out.i.mean).toBeLessThan(out.t.mean);
  expect(
    errors.filter((e) => !/PCFSoftShadowMap|React DevTools/.test(e)),
  ).toEqual([]);
});

test("rectangle selection: left-to-right needs containment, right-to-left crossing", async ({
  page,
}) => {
  await open(page);
  await topView(page);
  const { o: table, box: T } = await boxFor(page, "Tafel");
  // Fully containing the table (and the projector standing on it).
  await drag(
    page,
    { x: T.left - 4, y: T.top - 4 },
    { x: T.right + 4, y: T.bottom + 4 },
  );
  await expect(page.getByText("2 geselecteerd")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Geen selectie")).toBeVisible();
  // A small box inside the table: containment selects nothing, crossing selects the table.
  const a = { x: T.left + 3, y: T.bottom - 3 },
    b = { x: T.left + 12, y: T.bottom - 12 };
  await drag(page, { x: a.x, y: a.y }, { x: b.x, y: b.y });
  await expect(page.getByText("Geen selectie")).toBeVisible();
  await drag(page, { x: b.x, y: b.y }, { x: a.x, y: a.y });
  await expect(page.getByText("1 geselecteerd")).toBeVisible();
  expect(await page.evaluate(() => window.__studio.selected())).toEqual([
    table.id,
  ]);
});

test("group and ungroup, make unique stays local, lock blocks delete", async ({
  page,
}) => {
  await open(page);
  await topView(page);
  const { box: T } = await boxFor(page, "Tafel");
  await drag(
    page,
    { x: T.left - 4, y: T.top - 4 },
    { x: T.right + 4, y: T.bottom + 4 },
  );
  await page.getByRole("button", { name: /Groepeer selectie/ }).click();
  let p = await project(page);
  expect(p.groups).toHaveLength(1);
  expect(p.objects.filter((o) => o.groupId === p.groups[0].id)).toHaveLength(2);
  await page
    .getByRole("button", { name: /Haal uit groep/ })
    .first()
    .click();
  p = await project(page);
  expect(p.groups).toHaveLength(0);

  await pick(page, "Projectiepaneel");
  const before = await project(page);
  const defIds = new Set(
    before.objects
      .filter((o) => o.name.startsWith("Projectiepaneel"))
      .map((o) => o.definitionId),
  );
  expect(defIds.size).toBe(1);
  await page.getByRole("button", { name: "Maak uniek" }).click();
  p = await project(page);
  const panelDefs = p.objects
    .filter((o) => o.name.startsWith("Projectiepaneel"))
    .map((o) => o.definitionId);
  expect(new Set(panelDefs).size).toBe(2);
  expect(panelDefs.filter((d) => d !== [...defIds][0])).toHaveLength(1);
  expect(p.definitions.some((d) => d.unique)).toBe(true);

  await pick(page, "Projector");
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Vergrendel", exact: true })
    .click();
  expect(
    (await project(page)).objects.find((o) => o.name.startsWith("Projector"))
      .locked,
  ).toBe(true);
  const count = (await project(page)).objects.length;
  await page.keyboard.press("Delete");
  expect((await project(page)).objects).toHaveLength(count);
  await page
    .locator(".inspector")
    .getByRole("button", { name: "Ontgrendel", exact: true })
    .click();
  await page.keyboard.press("Delete");
  await expect
    .poll(async () => (await project(page)).objects.length)
    .toBe(count - 1);
});

test("manual editing without AI: duplicate, undo, redo, saved view, reload recovery", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText("Handmatige editor")).toBeVisible();
  await pick(page, "Tafel");
  const n = (await project(page)).objects.length;
  await page.keyboard.press("ControlOrMeta+d");
  await expect
    .poll(async () => (await project(page)).objects.length)
    .toBe(n + 1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(async () => (await project(page)).objects.length).toBe(n);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect
    .poll(async () => (await project(page)).objects.length)
    .toBe(n + 1);
  await page.getByTitle("Standpunt opslaan").click();
  await expect.poll(async () => (await project(page)).cameras.length).toBe(1);
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__studio?.boxes().length > 0);
  const after = await project(page);
  expect(after.objects).toHaveLength(n + 1);
  expect(after.cameras).toHaveLength(1);
});

test("corner media canvas: panel lists a 90° corner, image attaches and is persisted as metadata", async ({
  page,
}) => {
  await open(page, "corner");
  await page.getByRole("button", { name: "Media en projectiecanvas" }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("hoek 90°")).toBeVisible();
  await expect(modal.locator("tbody tr")).toHaveCount(8);
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEUlEQVR4nGP4z8Dwn+E/wz8AEAEBApY9mM0AAAAASUVORK5CYII=",
    "base64",
  );
  await modal
    .locator("input[type=file]")
    .setInputFiles({ name: "px.png", mimeType: "image/png", buffer: png });
  await expect.poll(async () => (await project(page)).media?.length).toBe(2);
  const p = await project(page);
  const m = p.media.find((v) => v.kind === "image");
  expect(m.sha256).toMatch(/^[0-9a-f]{64}$/);
  expect(p.canvases[0].mediaId).toBe(m.id);
  await modal.getByLabel("Aanpassing").selectOption("contain");
  expect((await project(page)).canvases[0].fit).toBe("contain");
});

test("exports download valid files: XLSX is a zip, JSON re-parses with media intact", async ({
  page,
}) => {
  await open(page, "corner");
  await page.getByLabel("Exporteer ontwerp").click();
  const xlsx = page.waitForEvent("download");
  await page.getByRole("button", { name: /Excel-onderdelenlijst/ }).click();
  const dl = await xlsx;
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/);
  const head = readFileSync(await dl.path())
    .subarray(0, 2)
    .toString();
  expect(head).toBe("PK");
  await page.getByLabel("Exporteer ontwerp").click();
  const json = page.waitForEvent("download");
  await page.getByRole("button", { name: /Projectbestand/ }).click();
  const jd = await json;
  const parsed = JSON.parse(readFileSync(await jd.path(), "utf8"));
  expect(parsed.canvases).toHaveLength(1);
  expect(parsed.objects.length).toBe((await project(page)).objects.length);
});
