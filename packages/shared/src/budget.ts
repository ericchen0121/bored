/** User-facing price ceiling: $ cheap → $$$$ no practical cap. */
export const BUDGET_TIERS = [1, 2, 3, 4] as const;
export type BudgetTier = (typeof BUDGET_TIERS)[number];

export const BUDGET_TIER_LABELS: Record<BudgetTier, string> = {
  1: "$",
  2: "$$",
  3: "$$$",
  4: "$$$$",
};

/** Short hint under each chip (nights-out / ticketed). */
export const BUDGET_TIER_HINTS: Record<BudgetTier, string> = {
  1: "Free–cheap (≈ under $20)",
  2: "Moderate (≈ under $45)",
  3: "Spendy (≈ under $100)",
  4: "No ceiling",
};

/**
 * Map a USD floor price to a budget tier.
 * Ordinal food-style 1–4 values are handled separately via {@link resolveItemBudgetTier}.
 */
export function usdToBudgetTier(usd: number): BudgetTier {
  if (usd <= 0) return 1;
  if (usd <= 20) return 1;
  if (usd <= 45) return 2;
  if (usd <= 100) return 3;
  return 4;
}

/** USD ceiling stored for back-compat / reporting; $$$$ → null (unlimited). */
export function budgetTierToUsdCeiling(tier: BudgetTier): number | null {
  if (tier === 1) return 20;
  if (tier === 2) return 45;
  if (tier === 3) return 100;
  return null;
}

export function parseBudgetTier(
  value: unknown,
): BudgetTier | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  return BUDGET_TIERS.includes(rounded as BudgetTier)
    ? (rounded as BudgetTier)
    : null;
}

/** Infer tier from a legacy dollar `budget_max` column. */
export function legacyBudgetMaxToTier(
  budgetMax: number | null | undefined,
): BudgetTier | null {
  if (budgetMax == null || !Number.isFinite(budgetMax)) return null;
  // Old seeds used 1–4 as ordinal; treat as tier.
  if (budgetMax >= 1 && budgetMax <= 4 && Number.isInteger(budgetMax)) {
    return budgetMax as BudgetTier;
  }
  return usdToBudgetTier(budgetMax);
}

export type BudgetPricedItem = {
  isFree?: boolean;
  priceMin?: number | null;
  priceMax?: number | null;
  tags?: string[] | null;
  source?: string | null;
};

/**
 * Resolve an item's price band for budget filtering.
 * Returns null when price is unknown (item should not be hard-filtered).
 */
export function resolveItemBudgetTier(
  item: BudgetPricedItem,
): BudgetTier | null {
  if (item.isFree) return 1;

  const fromTag = (item.tags ?? []).find((t) => /^price_\$+$/.test(t));
  if (fromTag) {
    const n = fromTag.replace(/^price_/, "").length;
    return parseBudgetTier(n);
  }

  const min = item.priceMin;
  if (min == null || !Number.isFinite(min)) return null;

  // Infatuation-style ordinal stored as priceMin/priceMax in 1–4.
  if (
    min >= 1 &&
    min <= 4 &&
    Number.isInteger(min) &&
    (item.priceMax == null || item.priceMax === min) &&
    (item.source === "food" ||
      item.source === "food_editorial" ||
      item.source === "new_restaurants")
  ) {
    return min as BudgetTier;
  }

  // Generic ordinal when min===max in 1–4 (other food tips).
  if (
    min >= 1 &&
    min <= 4 &&
    Number.isInteger(min) &&
    item.priceMax === min
  ) {
    return min as BudgetTier;
  }

  return usdToBudgetTier(min);
}

export type BudgetFilterPrefs = {
  budgetEnabled?: boolean;
  budgetTier?: BudgetTier | null;
  /** @deprecated Prefer budgetEnabled + budgetTier */
  budgetMax?: number | null;
};

/**
 * True when the item should be hard-dropped for the user's budget filter.
 * Unknown prices never exceed (same as pre-tier behavior).
 */
export function exceedsBudget(
  item: BudgetPricedItem,
  prefs: BudgetFilterPrefs,
): boolean {
  const enabled =
    prefs.budgetEnabled === true ||
    (prefs.budgetEnabled == null &&
      prefs.budgetTier == null &&
      prefs.budgetMax != null);

  if (!enabled) return false;

  const ceiling =
    prefs.budgetTier ??
    legacyBudgetMaxToTier(prefs.budgetMax) ??
    null;
  if (ceiling == null) return false;
  if (ceiling >= 4) return false;

  const itemTier = resolveItemBudgetTier(item);
  if (itemTier == null) return false;
  return itemTier > ceiling;
}

/** Normalize API write body → columns to persist. */
export function normalizeBudgetPrefs(input: {
  budgetEnabled?: boolean;
  budgetTier?: BudgetTier | null;
  budgetMax?: number | null;
}): {
  budgetEnabled: boolean;
  budgetTier: BudgetTier | null;
  budgetMax: number | null;
} {
  const tier =
    input.budgetTier ?? legacyBudgetMaxToTier(input.budgetMax) ?? null;
  const enabled =
    input.budgetEnabled ??
    (input.budgetTier == null && input.budgetMax != null);
  return {
    budgetEnabled: Boolean(enabled),
    budgetTier: tier,
    budgetMax: tier != null ? budgetTierToUsdCeiling(tier) : null,
  };
}
