/**
 * FOUND SF labels posts as `SECTION • Series` (e.g. `BARS • First Round`).
 * Infatuation scores are editorial ratings (e.g. 9.4), not random title noise.
 */

const FOUND_SECTION_KEYS = new Set([
  "restaurants",
  "getaways",
  "real estate",
  "work",
  "goods & services",
  "goods and services",
  "bars",
  "nightlife",
  "shopping",
  "on the market",
  "the nines",
  "found object",
]);

/** Non-hospitality FOUND sections — not “where to eat/drink” tips. */
export const FOUND_NON_FOOD_SECTIONS = new Set([
  "work",
  "real estate",
  "shopping",
  "goods & services",
  "goods and services",
  "on the market",
  "found object",
]);

export type FoundSectionHint = {
  sectionKey: string;
  section: string;
  series: string;
};

function titleCaseSection(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (lower === "the nines") return "The Nines";
  if (lower === "goods & services" || lower === "goods and services") {
    return "Goods & Services";
  }
  return lower.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Pull `BARS • First Round` / `WORK • Wednesday Routine` from subtitle or body.
 */
export function extractFoundSectionHint(
  text: string | null | undefined,
): FoundSectionHint | null {
  if (!text?.trim()) return null;
  const lines = text
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines.slice(0, 12)) {
    const m = line.match(
      /^([A-Za-z][A-Za-z0-9\s&/]{0,40}?)\s*[•·]\s*(.+)$/,
    );
    if (!m) continue;
    const left = m[1]!.trim();
    const right = m[2]!.trim().replace(/\s+/g, " ");
    const key = left.toLowerCase();
    if (!FOUND_SECTION_KEYS.has(key)) continue;
    if (right.length < 2 || right.length > 60) continue;
    return {
      sectionKey: key === "goods and services" ? "goods & services" : key,
      section: titleCaseSection(left),
      series: right,
    };
  }

  // Compact body scrape when newlines were stripped
  const flat = text.replace(/\s+/g, " ");
  const m = flat.match(
    /\b(RESTAURANTS|BARS|WORK|NIGHTLIFE|GETAWAYS|SHOPPING|REAL ESTATE|THE NINES|FOUND OBJECT|GOODS\s*&\s*SERVICES)\s*[•·]\s*([A-Za-z0-9][A-Za-z0-9\s'’&-]{1,50})/i,
  );
  if (!m) return null;
  const key = m[1]!.trim().toLowerCase().replace(/\s+/g, " ");
  const series = m[2]!.trim().replace(/\s+/g, " ");
  if (!FOUND_SECTION_KEYS.has(key) || series.length < 2) return null;
  return {
    sectionKey: key === "goods and services" ? "goods & services" : key,
    section: titleCaseSection(m[1]!),
    series,
  };
}

function sectionKindLabel(sectionKey: string | null | undefined): string {
  switch (sectionKey) {
    case "bars":
    case "nightlife":
      return "Bar";
    case "getaways":
      return "Getaway";
    case "the nines":
      return "The Nines";
    case "restaurants":
      return "Restaurant";
    default:
      return "Restaurant";
  }
}

/**
 * Short feed/detail framing from FOUND section · series (or tag fallbacks).
 * Examples: `Bar · First Round`, `Restaurant · The Nines`
 */
export function foodRecommendationLabel(opts: {
  tags?: string[] | null;
  rawPayload?: {
    section?: unknown;
    series?: unknown;
    sectionKey?: unknown;
    outlet?: unknown;
    proseTitle?: unknown;
    subtitle?: unknown;
  } | null;
  description?: string | null;
}): string | null {
  const payload = opts.rawPayload ?? null;
  let sectionKey =
    typeof payload?.sectionKey === "string"
      ? payload.sectionKey.toLowerCase()
      : null;
  let series =
    typeof payload?.series === "string" ? payload.series.trim() : null;

  if (!sectionKey || !series) {
    const blob = [
      typeof payload?.subtitle === "string" ? payload.subtitle : "",
      opts.description ?? "",
    ].join("\n");
    const hint = extractFoundSectionHint(blob);
    if (hint) {
      sectionKey = sectionKey ?? hint.sectionKey;
      series = series ?? hint.series;
    }
  }

  const tags = new Set((opts.tags ?? []).map((t) => t.toLowerCase()));
  if (!sectionKey) {
    if (tags.has("bars")) sectionKey = "bars";
    else if (tags.has("nines") || tags.has("the_nines")) sectionKey = "the nines";
  }

  if (!sectionKey && !series) return null;

  const kind = sectionKindLabel(sectionKey);
  if (series) return `${kind} · ${series}`;
  if (sectionKey === "bars" || sectionKey === "nightlife") return "Bar";
  if (sectionKey === "the nines") return "The Nines";
  return null;
}

/** Feed/detail meta when no FOUND section hint — or the hint itself when present. */
export function foodTipFallbackLabel(
  recommendationLabel: string | null | undefined,
): string {
  if (recommendationLabel?.trim()) return recommendationLabel.trim();
  return "Restaurant tip";
}

/**
 * Infatuation titles were historically `Place · 9.4`. Strip the score so the
 * UI can render it as a rating badge instead.
 */
export function stripInfatuationRatingTitle(
  title: string,
  rating?: number | null,
): string {
  if (rating != null && rating > 0) {
    const fixed = Number(rating).toFixed(1);
    const suffix = ` · ${fixed}`;
    if (title.endsWith(suffix)) return title.slice(0, -suffix.length).trim();
  }
  return title.replace(/\s+[·•]\s+\d\.\d\s*$/, "").trim();
}

export function categoriesForFoundSection(
  sectionKey: string | null | undefined,
): string[] {
  if (sectionKey === "bars" || sectionKey === "nightlife") {
    return ["food", "nightlife"];
  }
  return ["food"];
}

/** Food tips from editorial sources or Instagram influencer reels. */
export function isFoodRecommendationSource(
  source: string,
  categories?: string[] | null,
): boolean {
  if (source === "food") return true;
  if (source === "instagram" && categories?.includes("food")) return true;
  if (source === "youtube" && categories?.includes("food")) return true;
  return false;
}

/** Feed/detail framing for Instagram food reels and posts. */
export function igFoodRecommendationLabel(
  handle: string,
  mediaType?: string | null,
): string {
  const h = handle.replace(/^@/, "");
  if (mediaType === "REELS") return `Reel · @${h}`;
  if (mediaType === "VIDEO") return `Video · @${h}`;
  return `Instagram · @${h}`;
}

/**
 * Internal feed-window slot only — food tips are not timed events.
 * Spread across the next ~7 calendar mornings so re-ingest stays stable.
 */
export function suggestionStartsAt(
  stableId: string,
  published: Date | null,
): Date {
  const now = new Date();
  let hash = 0;
  for (let i = 0; i < stableId.length; i++) {
    hash = (hash * 31 + stableId.charCodeAt(i)) >>> 0;
  }
  let dayOffset = hash % 7;
  if (published) {
    const ageDays = (now.getTime() - published.getTime()) / 86400000;
    if (ageDays >= 0 && ageDays < 3) dayOffset = Math.min(dayOffset, 2);
  }
  const d = new Date(now);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + dayOffset);
  if (d.getTime() <= now.getTime() + 30 * 60000) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/** Whether an event row matches a feed source chip filter. */
export function matchesSourceFilter(
  row: { source: string; categories?: string[] | null },
  sourceFilter: Set<string> | null,
): boolean {
  if (!sourceFilter) return true;
  if (sourceFilter.has(row.source)) return true;
  if (
    sourceFilter.has("food") &&
    row.source === "instagram" &&
    row.categories?.includes("food")
  ) {
    return true;
  }
  if (
    sourceFilter.has("food") &&
    row.source === "youtube" &&
    row.categories?.includes("food")
  ) {
    return true;
  }
  if (sourceFilter.has("food") && row.source === "food_deals") {
    return true;
  }
  if (sourceFilter.has("food") && row.source === "new_restaurants") {
    return true;
  }
  return false;
}
