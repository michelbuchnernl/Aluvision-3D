/**
 * Deterministic model routing for design proposals. Picks a tier from observable signals, then the newest
 * model of that tier that the API key can actually use. No model names are assumed to exist: the caller
 * passes the verified-available ids, and any fallback is reported in the reason.
 */
export type Tier = "haiku" | "sonnet" | "opus";
export interface RouteSignals {
  promptChars: number;
  objectCount: number;
  groupCount: number;
  roomWords: boolean;
  numbers: number;
  clauses: number;
}
export interface RouteResult {
  model: string;
  tier: Tier;
  wantedTier: Tier;
  score: number;
  signals: string[];
  reason: string;
}
const ROOM =
  /\b(kamer|ruimte|room|layout|indeling|herindel\w*|verleng\w*|verbreed\w*|verhoog\w*|alles|volledig|opnieuw)\b/i;
export function routeSignals(
  prompt: string,
  project: { objects: unknown[]; groups: unknown[] },
): RouteSignals {
  return {
    promptChars: prompt.length,
    objectCount: project.objects.length,
    groupCount: project.groups.length,
    roomWords: ROOM.test(prompt),
    numbers: (prompt.match(/\d+([.,]\d+)?/g) ?? []).length,
    clauses: (prompt.match(/\b(en|and|ook|daarna|then|plus)\b|[;,]/gi) ?? [])
      .length,
  };
}
export function scoreTask(s: RouteSignals) {
  const why: string[] = [];
  let score = 0;
  const add = (n: number, text: string) => {
    score += n;
    why.push(`+${n} ${text}`);
  };
  if (s.promptChars > 800) add(2, "lange opdracht (>800 tekens)");
  else if (s.promptChars > 300) add(1, "middellange opdracht (>300 tekens)");
  if (s.roomWords) add(2, "raakt ruimte of indeling");
  if (s.objectCount > 60) add(1, "grote scène (>60 exemplaren)");
  if (s.numbers >= 4) add(1, "veel maten of aantallen");
  if (s.clauses >= 3) add(1, "meerdere deelopdrachten");
  if (!why.length) why.push("kleine, afgebakende wijziging");
  return { score, why };
}
export const tierForScore = (score: number): Tier =>
  score <= 1 ? "haiku" : score <= 3 ? "sonnet" : "opus";
const ID = /^claude-(haiku|sonnet|opus)-(\d+)-(\d+)$/;
function newest(available: string[], tier: Tier) {
  return available
    .map((id) => ({ id, m: ID.exec(id) }))
    .filter(
      (v): v is { id: string; m: RegExpExecArray } => !!v.m && v.m[1] === tier,
    )
    .sort(
      (a, b) =>
        Number(b.m[2]) - Number(a.m[2]) || Number(b.m[3]) - Number(a.m[3]),
    )[0]?.id;
}
const ORDER: Record<Tier, Tier[]> = {
  // Prefer a stronger model over a weaker one when the wanted tier is missing.
  haiku: ["haiku", "sonnet", "opus"],
  sonnet: ["sonnet", "opus", "haiku"],
  opus: ["opus", "sonnet", "haiku"],
};
export function routeModel(
  prompt: string,
  project: { objects: unknown[]; groups: unknown[] },
  available: string[],
): RouteResult {
  const signals = routeSignals(prompt, project),
    { score, why } = scoreTask(signals),
    wantedTier = tierForScore(score);
  for (const tier of ORDER[wantedTier]) {
    const model = newest(available, tier);
    if (!model) continue;
    const fallback =
      tier === wantedTier
        ? ""
        : ` ${wantedTier} is niet beschikbaar voor deze sleutel; terugval naar ${tier}.`;
    return {
      model,
      tier,
      wantedTier,
      score,
      signals: why,
      reason: `Complexiteit ${score} → ${wantedTier}: ${why.join("; ")}.${fallback}`,
    };
  }
  throw Error(
    "Geen haiku-, sonnet- of opusmodel beschikbaar voor deze sleutel.",
  );
}
