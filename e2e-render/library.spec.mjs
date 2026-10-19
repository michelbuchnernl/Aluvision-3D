import { test, expect } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";

test.skip(
  !existsSync("library/aluvision/manifest.json"),
  "library/aluvision niet aanwezig",
);

const project = (page) => page.evaluate(() => window.__studio.project());

test("AluVision library: browse, add a model from the server, it survives a reload and travels as a reference in the package", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1");
  await page.waitForFunction(() => window.__studio);

  // The product starts empty: no synthetic catalog anywhere in the library.
  expect((await project(page)).definitions).toHaveLength(0);
  await expect(page.getByText(/DEMO-COLLECTIE/)).toHaveCount(0);
  await expect(page.getByText(/ALUVISION-BIBLIOTHEEK/)).toBeVisible();
  await expect(page.getByText(/\d+ beschikbaar/)).toBeVisible();
  for (const old of [
    "Frame 100 × 250",
    "Projectiepaneel 100 × 250",
    "Truss 200",
    "Projector proxy 40",
  ])
    await expect(page.getByText(old, { exact: false })).toHaveCount(0);

  // Search by the Warehouse description (article-number style text) and by name.
  await page.getByLabel("Onderdelen zoeken").fill("Omni-55 base");
  const card = page
    .locator(".catalog-card", { hasText: "Omni-55 base V11" })
    .first();
  await expect(card).toBeVisible();
  await card.click();
  await expect.poll(async () => (await project(page)).objects.length).toBe(1);
  let p = await project(page);
  const def = p.definitions[0];
  expect(def).toMatchObject({
    source: "imported",
    kind: "asset",
    decorative: false,
  });
  expect(def.asset.libraryFile).toMatch(/^Omni-55_base_V11__[0-9a-f]{8}\.glb$/);
  expect(def.asset.provenance).toMatch(
    /Aluvision Exhibits, SketchUp 3D Warehouse/,
  );
  expect(def.catalogId).toMatch(/^IMP-[0-9A-F]{8}$/);
  expect(def.size.x).toBeGreaterThan(40);
  expect(await page.evaluate(() => window.__studio.assetsLoaded())).toEqual([
    [def.asset.sha256, true],
  ]);

  // Reload: the model is fetched from the server again (library models are not kept in the browser).
  await page.waitForTimeout(1200);
  await page.evaluate(async () => {
    await new Promise((r) => {
      const req = indexedDB.deleteDatabase("boormester-assets");
      req.onsuccess = req.onerror = req.onblocked = () => r();
    });
  });
  await page.reload();
  await page.waitForFunction(() => window.__studio);
  await expect
    .poll(() => page.evaluate(() => window.__studio.assetsLoaded()))
    .toEqual([[def.asset.sha256, true]]);

  // Package: the library model is referenced (file + checksum), not embedded.
  await page.getByLabel("Exporteer ontwerp").click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Projectpakket/ }).click();
  const files = unzipSync(readFileSync(await (await download).path()));
  expect(Object.keys(files).some((n) => n.startsWith("assets/"))).toBe(false);
  const manifest = JSON.parse(strFromU8(files["manifest.json"]));
  expect(manifest.libraryAssets).toEqual([
    { file: def.asset.libraryFile, sha256: def.asset.sha256, name: def.name },
  ]);
  expect(errors).toEqual([]);
});

test("AluVision library: class chips group the models, sub-groups are headed, previews load as images", async ({
  page,
}) => {
  test.skip(
    !existsSync("library/aluvision/classes.json"),
    "classes.json niet aanwezig",
  );
  test.skip(
    !existsSync("library/aluvision/previews"),
    "previews niet aanwezig",
  );
  await page.goto("/?e2e=1");
  await page.waitForFunction(() => window.__studio);
  const klass = page.getByLabel("Klasse");
  await expect(klass).toBeVisible();
  expect(await klass.locator("option").count()).toBeGreaterThanOrEqual(10);
  // Without a class selected, models are headed by their class.
  await expect(page.locator(".library-group").first()).toBeVisible();

  await klass.selectOption("connections");
  const headings = await page.locator(".library-group").allInnerTexts();
  expect(headings.length).toBeGreaterThan(0);
  expect(
    headings.every((h) =>
      /verbindingsknopen|joining sets|framekleminen|hoekverbindingen/i.test(h),
    ),
  ).toBe(true);
  for (const name of ["connection", "joining set", "frame clamp"]) {
    const names = await page.locator(".catalog-card strong").allInnerTexts();
    expect(names.some((n) => n.toLowerCase().includes(name))).toBe(true);
  }
  // Thumbnails are real images served by the API.
  const img = page
    .locator('.catalog-card img[src*="/api/library/previews/"]')
    .first();
  await expect(img).toBeVisible();
  await expect
    .poll(() => img.evaluate((el) => el.complete && el.naturalWidth > 0))
    .toBe(true);

  // Selecting another class replaces the list; choosing "Alle klassen" clears the filter.
  await klass.selectOption("quixy");
  const quixy = await page.locator(".catalog-card strong").allInnerTexts();
  expect(quixy.length).toBeGreaterThan(10);
  expect(quixy.every((n) => /quixy/i.test(n))).toBe(true);
  await klass.selectOption("");
  await expect(page.locator(".library-group").first()).toBeVisible();
});
