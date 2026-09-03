/**
 * Poster fallbacks for curated happy hours / lunch deals.
 * Prefer scraped editorial / Google photos when present on the event row;
 * these Unsplash URLs fill feed + detail cards until (or if) enrich runs.
 */

const U = (photoId: string, w = 960, h = 720) =>
  `https://images.unsplash.com/photo-${photoId}?auto=format&fit=crop&w=${w}&h=${h}&q=82`;

/** Thematic pool — keyword match on title / deal summary. */
const THEME_IMAGES = {
  cocktail: U("1470337458703-46ad1756a187"),
  bar: U("1514362545857-3bc16c4c7d1b"),
  oyster: U("1559339352-11d035aa65de"),
  sushi: U("1553621042-f6e147245754"),
  pizza: U("1513104890138-7c749659a591"),
  ramen: U("1569718212165-3a8278d5f624"),
  taco: U("1565299585323-38d6b0865b47"),
  seafood: U("1559339352-11d035aa65de"),
  italian: U("1551183053-bf91a1d81141"),
  dimsum: U("1563245372-f21724e3856d"),
  lunch: U("1414235077428-338989a2e8c0"),
  defaultHh: U("1572116469696-31de0f17cc34"),
} as const;

/** Optional per-deal overrides when thematic match is weak. */
export const CURATED_FOOD_DEAL_IMAGES: Readonly<Record<string, string>> = {
  // SF
  "horsefeather-hh": THEME_IMAGES.cocktail,
  "good-good-culture-club-hh": THEME_IMAGES.cocktail,
  // Chicago
  "violet-hour-hh": THEME_IMAGES.bar,
  "the-gage-hh": THEME_IMAGES.bar,
  "the-dawson-hh": THEME_IMAGES.cocktail,
  "lonesome-rose-hh": THEME_IMAGES.taco,
  "beatnik-hh": THEME_IMAGES.cocktail,
  "sky-pilsen-hh": THEME_IMAGES.cocktail,
  "kimski-late": THEME_IMAGES.bar,
  // LA
  "jon-vin-hh": THEME_IMAGES.italian,
  "republique-hh": THEME_IMAGES.bar,
  "redbird-hh": THEME_IMAGES.cocktail,
  "sunny-spot-hh": THEME_IMAGES.cocktail,
  "grand-central-market": THEME_IMAGES.lunch,
};

const THEME_RULES: Array<{ re: RegExp; key: keyof typeof THEME_IMAGES }> = [
  { re: /\boyster/i, key: "oyster" },
  { re: /\bsushi|sashimi|handroll/i, key: "sushi" },
  { re: /\bpizza|slice\b/i, key: "pizza" },
  { re: /\bramen\b/i, key: "ramen" },
  { re: /\btaco/i, key: "taco" },
  { re: /\bdim\s*sum\b/i, key: "dimsum" },
  { re: /\bceviche|seafood|cod\b|mussel|chowder|mariscos/i, key: "seafood" },
  { re: /\bpasta|italian|perbacco|bestia\b/i, key: "italian" },
  { re: /\bcocktail|wine|beer|bar\b/i, key: "cocktail" },
];

export function curatedFoodDealImageUrl(opts: {
  dealId?: string | null;
  title?: string | null;
  dealSummary?: string | null;
  dealKind?: string | null;
}): string {
  const id = opts.dealId?.trim();
  if (id && CURATED_FOOD_DEAL_IMAGES[id]) {
    return CURATED_FOOD_DEAL_IMAGES[id]!;
  }

  const blob = `${opts.title ?? ""} ${opts.dealSummary ?? ""}`;
  for (const rule of THEME_RULES) {
    if (rule.re.test(blob)) return THEME_IMAGES[rule.key];
  }

  return opts.dealKind === "lunch"
    ? THEME_IMAGES.lunch
    : THEME_IMAGES.defaultHh;
}

/** Fill missing posters for food_deals rows / feed cards. */
export function resolveFoodDealImageUrl(opts: {
  imageUrl?: string | null;
  dealId?: string | null;
  title?: string | null;
  dealSummary?: string | null;
  dealKind?: string | null;
}): string | null {
  const existing = opts.imageUrl?.trim();
  if (existing) return existing;
  return curatedFoodDealImageUrl(opts);
}

/** True when the URL is our Unsplash fallback (safe to replace with scraped photos). */
export function isCuratedFoodDealPlaceholderImage(
  imageUrl: string | null | undefined,
): boolean {
  const url = imageUrl?.trim();
  if (!url) return true;
  return /images\.unsplash\.com\/photo-/i.test(url);
}
