import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

const blender = !!process.env.BLENDER_PATH;

test("render panel: connect to the server, queue a render from the UI; with Blender watch it finish and download the PNG", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => document.querySelector("canvas"));
  // Save a viewpoint so the job has a named camera.
  await page.getByTitle("Standpunt opslaan").click();
  // Put the project on the server.
  await page.getByRole("button", { name: "Serverprojecten" }).click();
  await page.getByRole("button", { name: /Huidig ontwerp bewaren/ }).click();
  await expect(page.getByText("Nu op server bewaren")).toBeVisible();
  await page.getByRole("button", { name: "Dialoog sluiten" }).click();

  // Open the render panel from the export menu.
  await page.getByLabel("Exporteer ontwerp").click();
  await page.getByRole("button", { name: /Blender-render/ }).click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("Renderwachtrij")).toBeVisible();
  // Without BLENDER_PATH the panel must say so and the job must stay queued; with it, no warning.
  await expect(modal.getByText(/geen BLENDER_PATH/)).toHaveCount(
    blender ? 0 : 1,
  );
  // Small and fast: 1280×720, EEVEE, few samples.
  await modal.getByLabel("Samples").fill("8");
  await modal.getByLabel("Resolutie").selectOption({ label: "1280 × 720" });
  await modal
    .getByRole("button", { name: /Render in wachtrij zetten/ })
    .click();

  const job = modal.locator(".render-job").first();
  await expect(job).toBeVisible();
  if (!blender) {
    await expect(job.getByText("Wachtrij", { exact: true })).toBeVisible();
    await expect(job.getByRole("button", { name: /Annuleren/ })).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }
  await expect(job.getByText("Klaar", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(job).toContainText("poging 1");
  const download = page.waitForEvent("download");
  await job.getByRole("button", { name: /kB\)/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/\.png$/);
  const bytes = readFileSync(await file.path());
  expect([...bytes.subarray(0, 8)]).toEqual([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  expect(bytes.length).toBeGreaterThan(5000);
  expect(errors).toEqual([]);
});
