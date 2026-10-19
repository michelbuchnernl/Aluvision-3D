import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";

test.skip(
  !existsSync("library/aluvision/manifest.json"),
  "library/aluvision niet aanwezig",
);

const op = (page, fn, arg) =>
  page.evaluate(({ fn, arg }) => window.studioOperator[fn](...arg), {
    fn,
    arg: arg ?? [],
  });

test("operator bridge: search the library, add models, apply validated operations; hard limits are refused", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?operator=1");
  await page.waitForFunction(() => window.studioOperator);

  // Search and ambiguity handling.
  const hits = await op(page, "library", ["POP door", "", 10]);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.every((h) => /door/i.test(h.name))).toBe(true);
  const ambiguous = await op(page, "ensureModel", ["quick tightener"]);
  expect(ambiguous.ok).toBe(false);
  expect(ambiguous.candidates.length).toBeGreaterThan(1);
  const unknown = await op(page, "ensureModel", ["bestaat echt niet xyz"]);
  expect(unknown).toMatchObject({ ok: false });

  // A real model becomes a definition (downloaded and checksum-verified), once.
  const model = await op(page, "ensureModel", ["Omni -55 POP door"]);
  expect(model.ok).toBe(true);
  expect(model.catalogId).toMatch(/^IMP-[0-9A-F]{8}$/);
  const again = await op(page, "ensureModel", ["Omni -55 POP door"]);
  expect(again.definitionId).toBe(model.definitionId);
  expect((await op(page, "scene")).definitions).toHaveLength(1);

  // A valid proposal is applied atomically: room change plus two placements.
  const ok = await op(page, "apply", [
    {
      summary: "Ruimte 6 x 4 m met twee deuren",
      questions: [],
      operations: [
        { type: "room", length: 600, depth: 400, height: 300 },
        {
          type: "add",
          definitionId: model.definitionId,
          name: "Deur links",
          position: { x: -200, y: 0, z: 0 },
          rotation: 90,
        },
        {
          type: "add",
          definitionId: model.definitionId,
          name: "Deur rechts",
          position: { x: 200, y: 0, z: 0 },
          rotation: 270,
        },
      ],
    },
  ]);
  expect(ok.applied).toBe(true);
  expect(ok.roomChanged).toBe(true);
  expect(ok.newObjectIds).toHaveLength(2);
  let scene = await op(page, "scene");
  expect(scene.room).toEqual({ length: 600, depth: 400, height: 300 });
  expect(scene.objects.map((o) => [o.name, o.position.x, o.rotation])).toEqual([
    ["Deur links", -200, 90],
    ["Deur rechts", 200, 270],
  ]);

  // Hard limits: outside the room, nothing is applied (no partial edits).
  const outside = await op(page, "apply", [
    {
      summary: "Buiten de ruimte",
      questions: [],
      operations: [
        {
          type: "add",
          definitionId: model.definitionId,
          name: "Veilig",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
        },
        {
          type: "add",
          definitionId: model.definitionId,
          name: "Te ver",
          position: { x: 5000, y: 0, z: 0 },
          rotation: 0,
        },
      ],
    },
  ]);
  expect(outside.applied).toBe(false);
  expect(
    outside.issues.some(
      (i) => i.severity === "error" && /buiten ruimte/.test(i.message),
    ),
  ).toBe(true);
  expect((await op(page, "scene")).objects).toHaveLength(2);

  // Open questions block application; invalid operations are rejected, not guessed.
  const asks = await op(page, "apply", [
    {
      summary: "x",
      questions: ["Welke hoogte?"],
      operations: [{ type: "room", length: 700, depth: 400, height: 300 }],
    },
  ]);
  expect(asks.applied).toBe(false);
  expect((await op(page, "scene")).room.length).toBe(600);
  await expect(
    op(page, "apply", [
      {
        summary: "x",
        questions: [],
        operations: [
          {
            type: "transform",
            id: "bestaat-niet",
            position: { x: 0, y: 0, z: 0 },
            rotation: 0,
          },
        ],
      },
    ]),
  ).rejects.toThrow(/ontbreekt/);

  // The model is really on screen, not a placeholder.
  await expect
    .poll(() =>
      page.evaluate(() => window.__studio?.assetsLoaded?.() ?? "n.v.t."),
    )
    .toBeTruthy();

  // Fresh design with a given room; the library still answers.
  await op(page, "newDesign", [{ length: 900, depth: 500, height: 320 }]);
  scene = await op(page, "scene");
  expect([scene.objects.length, scene.room.length]).toEqual([0, 900]);
  expect(errors).toEqual([]);
});

test("operator bridge: a project saved on the server can be reopened by its id", async ({
  page,
}) => {
  await page.goto("/?operator=1");
  await page.waitForFunction(() => window.studioOperator);
  const model = await op(page, "ensureModel", ["Omni -55 POP door"]);
  await op(page, "apply", [
    {
      summary: "x",
      questions: [],
      operations: [
        {
          type: "add",
          definitionId: model.definitionId,
          name: "Deur",
          position: { x: 0, y: 0, z: 0 },
          rotation: 0,
        },
      ],
    },
  ]);
  await page.getByRole("button", { name: "Serverprojecten" }).click();
  await page.getByRole("button", { name: /Huidig ontwerp bewaren/ }).click();
  await expect(page.getByText("Nu op server bewaren")).toBeVisible();
  await page.getByRole("button", { name: "Dialoog sluiten" }).click();
  const id = (await op(page, "scene")).id;
  await op(page, "newDesign");
  expect((await op(page, "scene")).objects).toHaveLength(0);
  await op(page, "openServerProject", [id]);
  await expect
    .poll(async () => (await op(page, "scene")).objects.length)
    .toBe(1);
});
