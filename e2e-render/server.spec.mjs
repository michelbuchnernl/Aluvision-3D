import { test, expect } from "@playwright/test";

const count = (page) =>
  page.evaluate(() => window.__studio.project().objects.length);

test("server round trip in the browser: save, edit + autosave, reload, open from the server, restore a revision", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?e2e=1");
  await page.waitForFunction(() => window.__studio?.boxes().length > 0);
  const base = await count(page);

  await page.getByRole("button", { name: "Serverprojecten" }).click();
  await page.getByRole("button", { name: /Huidig ontwerp bewaren/ }).click();
  await expect(page.getByText("Nu op server bewaren")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Serverprojecten" }),
  ).toContainText("1");
  await page.getByRole("button", { name: "Dialoog sluiten" }).click();

  // Edit (duplicate the table); the editor autosaves to revision 2 after a moment.
  await page
    .getByRole("button", { name: /Objecten/ })
    .first()
    .click();
  await page.locator(".object-name", { hasText: "Tafel" }).first().click();
  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(() => count(page)).toBe(base + 1);
  await expect(
    page.getByRole("button", { name: "Serverprojecten" }),
  ).toContainText("2", { timeout: 15000 });

  // A page reload: the editor reopens its local copy; the server list is how it gets the stored revision back.
  await page.reload();
  await page.waitForFunction(() => window.__studio?.boxes().length > 0);
  await page.getByRole("button", { name: "Serverprojecten" }).click();
  const row = page.locator(".server-project-row", { hasText: "Revisie 2" });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Open" }).click();
  // The reloaded tab is a new editor identity, so the previous tab's 30 s edit lock is still held: the UI says
  // so and offers an explicit takeover instead of silently overriding it.
  await expect(page.getByText("Bewerking vergrendeld")).toBeVisible();
  await page.getByRole("button", { name: "Bewerking overnemen" }).click();
  await expect.poll(() => count(page)).toBe(base + 1);

  // Restore revision 1: the duplicate is gone again, and the restore itself becomes a new revision.
  await page
    .locator(".server-project-row", { hasText: "Revisie 1" })
    .getByRole("button", { name: "Herstel" })
    .click();
  await expect.poll(() => count(page)).toBe(base);
  await expect(
    page.locator(".server-project-row", { hasText: /Revisie 3/ }).first(),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
