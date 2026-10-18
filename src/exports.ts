import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import {
  bom,
  definition,
  effectiveMaterial,
  MATERIALS,
  bounds,
  isVisible,
  validate,
} from "./model.ts";
import type { Project, Vec3 } from "./model.ts";
export function buildWorkbook(p: Project) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Boormester Immersive Studio";
  wb.created = new Date(p.updatedAt);
  wb.title = p.name;
  wb.subject = "Synthetische demo-onderdelen; geen fabrikantcatalogus";
  const summary = wb.addWorksheet("Onderdelen");
  summary.columns = [
    { header: "Code", key: "code", width: 19 },
    { header: "Omschrijving", key: "description", width: 36 },
    { header: "Type", key: "kind", width: 15 },
    { header: "Aantal", key: "quantity", width: 10 },
    { header: "Lengte (cm)", key: "x", width: 14 },
    { header: "Hoogte (cm)", key: "y", width: 14 },
    { header: "Diepte (cm)", key: "z", width: 14 },
    { header: "Materiaal", key: "material", width: 19 },
    { header: "Groep", key: "group", width: 20 },
    { header: "Status", key: "status", width: 28 },
    { header: "Definitie-ID", key: "id", width: 40 },
  ];
  bom(p).forEach((r) =>
    summary.addRow({
      ...r,
      x: r.size.x,
      y: r.size.y,
      z: r.size.z,
      material: MATERIALS[r.material].name,
      id: r.definitionId,
    }),
  );
  const lastData = summary.rowCount;
  const total = summary.addRow({
    description: "Totaal exemplaren",
    quantity:
      lastData > 1
        ? { formula: `SUM(D2:D${lastData})`, result: p.objects.length }
        : 0,
  });
  total.font = { bold: true };
  const detail = wb.addWorksheet("Exemplaren");
  detail.columns = [
    { header: "Exemplaar-ID", key: "id", width: 40 },
    { header: "Naam", key: "name", width: 36 },
    { header: "Definitie-ID", key: "definitionId", width: 40 },
    { header: "Code", key: "code", width: 18 },
    { header: "Type", key: "kind", width: 15 },
    { header: "X (cm)", key: "px", width: 14 },
    { header: "Y onderzijde (cm)", key: "py", width: 20 },
    { header: "Z (cm)", key: "pz", width: 14 },
    { header: "Rotatie Y (graden)", key: "rotation", width: 20 },
    { header: "Lengte (cm)", key: "x", width: 14 },
    { header: "Hoogte (cm)", key: "y", width: 14 },
    { header: "Diepte (cm)", key: "z", width: 14 },
    { header: "Materiaal", key: "material", width: 18 },
    { header: "Groep", key: "group", width: 20 },
    { header: "Laag", key: "tag", width: 22 },
    { header: "Zichtbaar object", key: "visible", width: 20 },
    { header: "Status", key: "status", width: 28 },
  ];
  for (const o of p.objects) {
    const d = definition(p, o);
    detail.addRow({
      ...o,
      px: o.position.x,
      py: o.position.y,
      pz: o.position.z,
      x: d.size.x,
      y: d.size.y,
      z: d.size.z,
      kind: d.kind,
      code: d.catalogId,
      material: MATERIALS[effectiveMaterial(p, o)].name,
      group: p.groups.find((g) => g.id === o.groupId)?.name ?? "",
      tag: p.tags.find((t) => t.id === o.tag)?.name ?? o.tag,
      visible: o.visible ? "Ja" : "Nee",
      status: d.unique ? "Synthetisch - uniek" : "Synthetische demo",
    });
  }
  const meta = wb.addWorksheet("Project");
  meta.columns = [
    { header: "Eigenschap", key: "key", width: 32 },
    { header: "Waarde", key: "value", width: 90 },
  ];
  [
    { key: "Project", value: p.name },
    { key: "Project-ID", value: p.id },
    { key: "Revisietijd UTC", value: p.updatedAt },
    { key: "Eenheid", value: "cm; positie = midden van onderzijde" },
    { key: "Ruimte lengte X", value: p.room.length },
    { key: "Ruimte diepte Z", value: p.room.depth },
    { key: "Ruimte hoogte Y", value: p.room.height },
    { key: "Exemplaren", value: p.objects.length },
    {
      key: "Herkomst",
      value: "Proceduraal gegenereerde synthetische demo-onderdelen",
    },
    {
      key: "Constructieve status",
      value:
        "Niet constructief beoordeeld; geen fabrikantproducten of certificering",
    },
    {
      key: "Verborgen objecten",
      value: "Tellen mee in onderdelenlijst en details",
    },
    {
      key: "Controlefouten",
      value: validate(p).filter((i) => i.severity === "error").length,
    },
  ].forEach((r) => meta.addRow(r));
  for (const sheet of [summary, detail, meta]) {
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.getRow(1).height = 25;
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF227D72" },
    };
    sheet.getRow(1).alignment = { vertical: "middle" };
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: {
        row: sheet === summary ? lastData : sheet.rowCount,
        column: sheet.columnCount,
      },
    };
    sheet.eachRow((row, n) => {
      if (n > 1) {
        row.height = 21;
        row.eachCell((c) => {
          c.font = { ...c.font, size: 10 };
          if (n % 2 === 0)
            c.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF2F6F3" },
            };
        });
      }
    });
  }
  // Reconciliation before returning any workbook.
  const count = bom(p).reduce((n, r) => n + r.quantity, 0);
  if (count !== p.objects.length || detail.rowCount - 1 !== p.objects.length)
    throw Error("Onderdelenexport wijkt af van de scene.");
  return wb;
}
export async function xlsxBytes(p: Project) {
  return new Uint8Array(await buildWorkbook(p).xlsx.writeBuffer());
}
const ascii = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .slice(0, 180);
export function technicalPdf(p: Project, screenshot?: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const w = 297,
    h = 210,
    margin = 18;
  const errors = validate(p).filter((i) => i.severity === "error");
  const header = (title: string, scale?: number) => {
    pdf.setDrawColor(210, 224, 218);
    pdf.setLineWidth(0.3);
    pdf.line(margin, 35, w - margin, 35);
    pdf.setTextColor(40, 83, 69);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("BOORMESTER / IMMERSIVE STUDIO", margin, 18);
    pdf.setTextColor(110, 135, 125);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8);
    pdf.text(ascii(p.name), margin, 25);
    pdf.setTextColor(55, 85, 75);
    pdf.setFontSize(11);
    pdf.text(title, w - margin, 24, { align: "right" });
    pdf.setFontSize(7);
    pdf.setTextColor(120, 140, 132);
    pdf.text(
      `Concept - synthetische onderdelen | ${scale ? `Schaal 1:${scale} bij afdruk op 100%` : "Aanvullende documentatie - niet op schaal"}`,
      margin,
      193,
    );
    pdf.text(
      `Revisie ${p.updatedAt.slice(0, 19)} UTC | cm | ${errors.length} grensfouten`,
      margin,
      198,
    );
    pdf.text(`${pdf.getNumberOfPages()}`, w - margin, 198, { align: "right" });
    pdf.setDrawColor(215, 227, 221);
    pdf.line(margin, 187, w - margin, 187);
  };
  const dim = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    label: string,
    horizontal: boolean,
  ) => {
    pdf.setDrawColor(120, 150, 135);
    pdf.setLineWidth(0.15);
    pdf.line(x1, y1, x2, y2);
    if (horizontal) {
      pdf.line(x1, y1 - 2, x1, y1 + 2);
      pdf.line(x2, y2 - 2, x2, y2 + 2);
    } else {
      pdf.line(x1 - 2, y1, x1 + 2, y1);
      pdf.line(x2 - 2, y2, x2 + 2, y2);
    }
    pdf.setTextColor(89, 125, 105);
    pdf.setFontSize(8);
    pdf.text(
      label,
      (x1 + x2) / 2 + (horizontal ? 0 : 4),
      (y1 + y2) / 2 + (horizontal ? -2 : 0),
      { align: horizontal ? "center" : "left" },
    );
  };
  const views = [
    {
      name: "Bovenaanzicht (X / Z)",
      a: "x",
      b: "z",
      length: p.room.length,
      height: p.room.depth,
      originA: -p.room.length / 2,
      originB: -p.room.depth / 2,
    },
    {
      name: "Vooraanzicht (X / Y)",
      a: "x",
      b: "y",
      length: p.room.length,
      height: p.room.height,
      originA: -p.room.length / 2,
      originB: 0,
    },
    {
      name: "Rechterzijaanzicht (Z / Y)",
      a: "z",
      b: "y",
      length: p.room.depth,
      height: p.room.height,
      originA: -p.room.depth / 2,
      originB: 0,
    },
  ] as const;
  views.forEach((view, index) => {
    if (index) pdf.addPage();
    const required = Math.max(
      (view.length * 10) / 230,
      (view.height * 10) / 112,
    );
    const scale =
      [10, 20, 25, 50, 100, 200, 500, 1000, 2000, 5000, 10000].find(
        (s) => s >= required,
      ) ?? Math.ceil(required / 1000) * 1000;
    header(view.name, scale);
    const k = 10 / scale;
    const left = margin + (240 - view.length * k) / 2,
      top = 47 + (120 - view.height * k) / 2;
    const project = (a: number, b: number) => ({
      x: left + (a - view.originA) * k,
      y: top + (view.height - (b - view.originB)) * k,
    });
    pdf.setDrawColor(90, 125, 110);
    pdf.setLineWidth(0.35);
    pdf.rect(left, top, view.length * k, view.height * k);
    for (const o of p.objects.filter((o) => isVisible(p, o))) {
      const d = definition(p, o),
        b = bounds(p, o);
      const bad = errors.some((e) => e.objectId === o.id);
      pdf.setDrawColor(bad ? 195 : 135, bad ? 90 : 155, bad ? 75 : 150);
      pdf.setLineWidth(d.kind === "frame" ? 0.3 : 0.15);
      if (view.b === "z") {
        const a = (o.rotation * Math.PI) / 180;
        const corners = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
          [-1, -1],
        ].map(([x, z]) => {
          const dx = (x * d.size.x) / 2,
            dz = (z * d.size.z) / 2;
          return project(
            o.position.x + dx * Math.cos(a) + dz * Math.sin(a),
            o.position.z - dx * Math.sin(a) + dz * Math.cos(a),
          );
        });
        for (let i = 1; i < corners.length; i++)
          pdf.line(
            corners[i - 1].x,
            corners[i - 1].y,
            corners[i].x,
            corners[i].y,
          );
      } else {
        const a = project(b.min[view.a], b.max[view.b]),
          c = project(b.max[view.a], b.min[view.b]);
        pdf.rect(a.x, a.y, c.x - a.x, c.y - a.y);
      }
    }
    dim(
      left,
      top + view.height * k + 8,
      left + view.length * k,
      top + view.height * k + 8,
      `${view.length} cm`,
      true,
    );
    dim(
      left + view.length * k + 8,
      top,
      left + view.length * k + 8,
      top + view.height * k,
      `${view.height} cm`,
      false,
    );
    pdf.setFontSize(7);
    pdf.setTextColor(140, 150, 144);
    pdf.text(
      "Conceptuele omhullingen; geen detail- of fabricagetekening. Alleen zichtbare onderdelen zijn getekend.",
      margin,
      179,
    );
  });
  if (screenshot) {
    pdf.addPage();
    header("Huidig standpunt");
    try {
      const image = pdf.getImageProperties(screenshot);
      const rw = 260,
        rh = Math.min(140, (rw * image.height) / image.width),
        width = Math.min(rw, (rh * image.width) / image.height);
      pdf.addImage(screenshot, "PNG", (w - width) / 2, 42, width, rh);
    } catch {
      pdf.setFontSize(10);
      pdf.text("Browserbeeld kon niet worden toegevoegd.", margin, 60);
    }
  }
  pdf.addPage();
  header("Ontwerpcontrole en aannames");
  pdf.setFontSize(10);
  pdf.setTextColor(70, 95, 82);
  const lines = [
    `Ruimte: ${p.room.length} x ${p.room.depth} x ${p.room.height} cm (X x Z x Y).`,
    `Aantal fysieke exemplaren: ${p.objects.length}.`,
    `Grensfouten: ${errors.length}.`,
    `Hoogte 300 cm is een demo-aanname, tenzij door de gebruiker gewijzigd.`,
    `Alle onderdelen zijn synthetisch: geen fabrikantcatalogus, certificering of constructieve goedkeuring.`,
    `Aanzichten tonen conceptuele omhullingen, geen toleranties, verbindingen of productiedetails.`,
    `Excel bevat ook onzichtbare onderdelen; PDF-tekeningen volgen de zichtbare scene.`,
    `Posities en maten komen uit revisie ${p.updatedAt}.`,
    ...errors.slice(0, 12).map((e) => ascii(e.message)),
  ];
  let y = 49;
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(ascii(line), 255);
    pdf.text(wrapped, margin, y);
    y += wrapped.length * 5 + 4;
  }
  pdf.setProperties({
    title: ascii(p.name),
    subject: "Conceptueel ruimteontwerp - geen constructieberekening",
    author: "Boormester Immersive Studio",
  });
  return pdf;
}
export function saveBytes(name: string, bytes: Uint8Array, mime: string) {
  const data = new Uint8Array(bytes);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type: mime }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
