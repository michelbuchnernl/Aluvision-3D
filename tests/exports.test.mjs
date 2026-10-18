import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  demoProject,
  emptyProject,
  makeUnique,
  definition,
  bom,
} from "../src/model.ts";
import { buildWorkbook, xlsxBytes, technicalPdf } from "../src/exports.ts";
test("Excel export opens and reconciles grouped and instance-level quantities", async () => {
  const p = demoProject();
  const bytes = await xlsxBytes(p);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.deepEqual(
    wb.worksheets.map((s) => s.name),
    ["Onderdelen", "Exemplaren", "Project"],
  );
  const sheet = wb.getWorksheet("Onderdelen");
  const expected = bom(p);
  assert.equal(sheet.rowCount, expected.length + 2);
  let n = 0;
  for (let row = 2; row < sheet.rowCount; row++)
    n += sheet.getCell(row, 4).value;
  assert.equal(n, p.objects.length);
  assert.equal(wb.getWorksheet("Exemplaren").rowCount - 1, p.objects.length);
  assert.equal(sheet.getCell(sheet.rowCount, 4).value.result, p.objects.length);
  assert.equal(
    sheet.getCell(sheet.rowCount, 4).value.formula,
    `SUM(D2:D${sheet.rowCount - 1})`,
  );
});
test("Excel distinguishes unique definitions and exact changed dimensions", () => {
  let p = demoProject();
  p = makeUnique(p, [p.objects[0].id]);
  definition(p, p.objects[0]).size.x = 91.5;
  const w = buildWorkbook(p),
    details = w.getWorksheet("Exemplaren");
  assert.equal(details.getCell(2, 10).value, 91.5);
  assert.equal(details.getCell(2, 3).value, p.objects[0].definitionId);
});
test("Empty project exports without invalid sum ranges or missing worksheets", () => {
  const p = emptyProject();
  const w = buildWorkbook(p);
  assert.equal(w.getWorksheet("Onderdelen").getCell(2, 4).value, 0);
  assert.equal(w.getWorksheet("Exemplaren").rowCount, 1);
});
test("Technical PDF contains three scaled views and a candid design-check page", () => {
  const pdf = technicalPdf(demoProject());
  assert.equal(pdf.getNumberOfPages(), 4);
  const output = pdf.output();
  assert.ok(output.startsWith("%PDF-"));
  assert.match(output, /Schaal 1:50/);
  assert.match(output, /Bovenaanzicht/);
  assert.match(output, /geen detail-/);
  assert.equal(Math.round(pdf.internal.pageSize.getWidth()), 297);
  assert.equal(Math.round(pdf.internal.pageSize.getHeight()), 210);
});
test("PDF flags invalid boundaries instead of silently modifying the scene", () => {
  const p = demoProject();
  p.objects[0].position.x = 900;
  const previous = JSON.stringify(p.objects[0]);
  const pdf = technicalPdf(p);
  assert.match(pdf.output(), /Grensfouten: 1/);
  assert.equal(JSON.stringify(p.objects[0]), previous);
});
