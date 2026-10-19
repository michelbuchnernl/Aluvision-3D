import { validate } from "../src/model.ts";
import type { Project } from "../src/model.ts";
import { canvasLayout } from "../src/media.ts";
/**
 * Derived Markdown memory. SQLite stays the source of truth; nothing here deletes the original log.
 * Everything is deterministic, so the same project and events always give the same brief.
 */
export interface EventRow {
  kind: string;
  message: string;
  created_at: string;
}
const clean = (s: string) => s.replaceAll("\n", " ").replaceAll("\r", " ");
const DECISION_KINDS = new Set([
  "revision",
  "budget",
  "lease_takeover",
  "ai_routing",
  "ai_applied",
  "ai_rejected",
]);
export interface Distilled {
  total: number;
  byKind: Record<string, number>;
  decisions: EventRow[];
  latestRevisions: EventRow[];
  earlierRevisions: number;
}
export function distillEvents(rows: EventRow[]): Distilled {
  const byKind: Record<string, number> = {};
  for (const r of rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const revisions = rows.filter((r) => r.kind === "revision");
  const decisions = rows.filter(
    (r) => DECISION_KINDS.has(r.kind) && r.kind !== "revision",
  );
  return {
    total: rows.length,
    byKind,
    decisions: decisions.slice(-8),
    latestRevisions: revisions.slice(-5),
    earlierRevisions: Math.max(0, revisions.length - 5),
  };
}
export function buildContext(p: Project, revision: number, rows: EventRow[]) {
  const issues = validate(p),
    errors = issues.filter((i) => i.severity === "error"),
    warnings = issues.filter((i) => i.severity === "warning");
  const canvasIssues = (p.canvases ?? []).flatMap((c) =>
    canvasLayout(p, c)
      .issues.filter((i) => i.severity !== "info")
      .map((i) => `${c.name}: ${i.message}`),
  );
  const d = distillEvents(rows);
  const next: string[] = [];
  if (errors.length)
    next.push(
      `Los ${errors.length} grensfout(en) op; er wordt niets stilzwijgend verplaatst.`,
    );
  if (canvasIssues.length)
    next.push("Controleer de gemelde canvasnaden en pixelverhoudingen.");
  if ((p.media ?? []).some((m) => m.kind !== "test-pattern"))
    next.push(
      "Koppel mediabestanden opnieuw na laden; alleen metadata is opgeslagen.",
    );
  if (!p.cameras.length)
    next.push("Sla minstens één camerastandpunt op voor weergaven en renders.");
  if (!next.length)
    next.push("Geen openstaande controlepunten uit de automatische controle.");
  const list = (items: string[]) =>
    items.length ? items.map((i) => `- ${clean(i)}`).join("\n") : "- Geen";
  return [
    `# ${clean(p.name)}`,
    "",
    "## Brief",
    "",
    `Revisie: ${revision}`,
    "Eenheid: cm",
    `Ruimte X × Z × Y: ${p.room.length} × ${p.room.depth} × ${p.room.height}`,
    `Exemplaren: ${p.objects.length} · definities: ${p.definitions.length} · groepen: ${p.groups.length}`,
    `Projectiecanvassen: ${p.canvases?.length ?? 0} · camerastandpunten: ${p.cameras.length}`,
    "",
    "## Openstaande punten",
    "",
    list([
      ...errors.map((e) => e.message),
      ...warnings.slice(0, 8).map((w) => w.message),
      ...canvasIssues.slice(0, 8),
    ]),
    "",
    "## Beslissingen en goedkeuringen",
    "",
    list(d.decisions.map((r) => `${r.created_at.slice(0, 16)} ${r.message}`)),
    "",
    "## Recente revisies",
    "",
    list(
      d.latestRevisions.map((r) => `${r.created_at.slice(0, 16)} ${r.message}`),
    ),
    d.earlierRevisions
      ? `\n(+ ${d.earlierRevisions} eerdere revisies in LOG.md)`
      : "",
    "",
    "## Volgende acties",
    "",
    list(next),
    "",
    "## Bronnen",
    "",
    `Exacte staat en revisies staan in SQLite; LOG.md bevat alle ${d.total} gebeurtenissen ongewijzigd. Alle onderdelen zijn synthetisch en niet constructief beoordeeld.`,
    "",
  ].join("\n");
}
const words = (s: string) =>
  new Set(s.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/g) ?? []);
/** Picks the sections of a context brief that matter for a task, within a character budget. */
export function retrieveContext(
  markdown: string,
  query: string,
  maxChars = 1500,
) {
  const parts = markdown.split(/\n(?=## )/);
  const head = parts[0].startsWith("## ") ? "" : parts.shift()!;
  const q = words(query);
  const scored = parts
    .map((text, order) => {
      const w = words(text);
      let hits = 0;
      for (const t of q) if (w.has(t)) hits++;
      const name = text.split("\n")[0].replace(/^##\s*/, "");
      return { name, text, hits, order };
    })
    .sort((a, b) => b.hits - a.hits || a.order - b.order);
  const picked: typeof scored = [];
  let size = head.length;
  // Brief always goes first; the rest by relevance, then document order.
  const brief = scored.find((s) => s.name === "Brief");
  for (const s of brief
    ? [brief, ...scored.filter((v) => v !== brief)]
    : scored) {
    if (s !== brief && s.hits === 0) continue;
    if (size + s.text.length + 1 > maxChars) continue;
    picked.push(s);
    size += s.text.length + 1;
  }
  picked.sort((a, b) => a.order - b.order);
  return {
    text: [head, ...picked.map((s) => s.text)].filter(Boolean).join("\n"),
    sections: picked.map((s) => s.name),
    chars: size,
  };
}
export interface PlaybookIssue {
  line: number;
  rule: string;
  message: string;
}
const PATH = /[\w./-]+\.(?:mjs|ts|tsx|md|py|json)\b/g;
/**
 * Playbook rows are Regel | Status | Bewijs. A row may only claim tested/verified/observed status when its
 * evidence cites files that exist, so untested guesses cannot be promoted by wording alone.
 */
export function lintPlaybook(
  markdown: string,
  exists: (path: string) => boolean,
): PlaybookIssue[] {
  const issues: PlaybookIssue[] = [];
  markdown.split("\n").forEach((line, i) => {
    if (!line.startsWith("|")) return;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (
      cells.length !== 3 ||
      /^-+$/.test(cells[0].replaceAll(" ", "")) ||
      cells[0] === "Regel"
    )
      return;
    const [rule, status, evidence] = cells;
    // Only a negated *claim* ("niet getest", "ongeverifieerd") excuses missing evidence; an unrelated
    // "niet" elsewhere in the status must not switch the check off.
    const claims =
      /getest|geverifieerd|geobserveerd|bewezen|verified|tested/i.test(status);
    const negated =
      /(?:niet|nog niet|geen)\s+(?:\w+\s+)?(?:getest|geverifieerd|geobserveerd|bewezen)|ongeverifieerd|onbewezen|ongetest/i.test(
        status,
      );
    const paths = evidence.match(PATH) ?? [];
    if (!status)
      issues.push({ line: i + 1, rule, message: "Status ontbreekt." });
    else if (claims && !negated) {
      if (!paths.length)
        issues.push({
          line: i + 1,
          rule,
          message: "Status claimt bewijs maar noemt geen bestand.",
        });
      for (const p of paths)
        if (!exists(p))
          issues.push({
            line: i + 1,
            rule,
            message: `Bewijsbestand bestaat niet: ${p}`,
          });
    }
  });
  return issues;
}
