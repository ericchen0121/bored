/**
 * Evergreen activity recommendations — parks, hikes, local gems.
 * Same feed UX as food tips: not timed events, stable suggestion slots.
 */

export type ActivityAudience = "iconic" | "local_gem";

export type ActivityKind =
  | "hike"
  | "park"
  | "walk"
  | "play"
  | "shop"
  | "food_yard"
  | "murals"
  | "viewpoint";

export type CuratedActivity = {
  id: string;
  city: string;
  title: string;
  description: string;
  venueName?: string;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  url?: string;
  /** Feed/detail card image */
  imageUrl?: string;
  audience: ActivityAudience;
  activityKind: ActivityKind;
  /** Interest categories — defaults derived from kind when omitted */
  categories?: string[];
  tags?: string[];
  isFree?: boolean;
};

const ACTIVITY_KIND_LABELS: Record<ActivityKind, string> = {
  hike: "Hike",
  park: "Park",
  walk: "Walk",
  play: "Activity",
  shop: "Shop",
  food_yard: "Food yard",
  murals: "Murals",
  viewpoint: "Viewpoint",
};

const AUDIENCE_LABELS: Record<ActivityAudience, string> = {
  iconic: "Classic",
  local_gem: "Local gem",
};

/** Default interest categories when not set on the row */
export function categoriesForActivityKind(
  kind: ActivityKind,
  extra?: string[],
): string[] {
  const base = new Set<string>(extra ?? []);
  switch (kind) {
    case "hike":
    case "park":
    case "walk":
    case "viewpoint":
      base.add("outdoors");
      break;
    case "murals":
      base.add("arts");
      base.add("outdoors");
      break;
    case "shop":
      base.add("arts");
      break;
    case "food_yard":
      base.add("food");
      base.add("outdoors");
      break;
    case "play":
      base.add("outdoors");
      base.add("family");
      break;
  }
  if (
    kind === "park" ||
    kind === "hike" ||
    kind === "walk" ||
    kind === "viewpoint" ||
    kind === "murals"
  ) {
    base.add("free");
  }
  return [...base];
}

export function isActivityRecommendationSource(source: string): boolean {
  return source === "activities";
}

/** Feed/detail framing: `Local gem · Arcade bar`, `Classic · Park` */
export function activityRecommendationLabel(opts: {
  rawPayload?: {
    audience?: unknown;
    activityKind?: unknown;
    playKind?: unknown;
  } | null;
}): string | null {
  const payload = opts.rawPayload ?? null;
  const audience =
    payload?.audience === "iconic" || payload?.audience === "local_gem"
      ? payload.audience
      : null;
  const kind =
    typeof payload?.activityKind === "string" &&
    payload.activityKind in ACTIVITY_KIND_LABELS
      ? (payload.activityKind as ActivityKind)
      : null;
  const playKind =
    typeof payload?.playKind === "string" ? payload.playKind.trim() : null;

  let kindLabel = kind ? ACTIVITY_KIND_LABELS[kind] : null;
  if (playKind) {
    kindLabel = playKind
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  if (audience && kindLabel) {
    return `${AUDIENCE_LABELS[audience]} · ${kindLabel}`;
  }
  if (audience) return AUDIENCE_LABELS[audience];
  if (kindLabel) return kindLabel;
  return null;
}

export function activityTipFallbackLabel(
  recommendationLabel: string | null | undefined,
): string {
  if (recommendationLabel?.trim()) return recommendationLabel.trim();
  return "Activity tip";
}

/** Food tips + activity tips + new restaurants share untimed recommendation UX */
export function isEvergreenRecommendationSource(
  source: string,
  categories?: string[] | null,
  kind?: string | null,
): boolean {
  if (kind === "recommendation") return true;
  if (source === "activities") return true;
  if (source === "theater") return true;
  if (source === "new_restaurants") return true;
  if (source === "food") return true;
  if (source === "instagram" && categories?.includes("food")) return true;
  if (source === "youtube" && categories?.includes("food")) return true;
  return false;
}

/** Resolve stored/feed kind for a listing. */
export function resolveEventKind(opts: {
  kind?: string | null;
  source: string;
  categories?: string[] | null;
}): "event" | "recommendation" {
  if (opts.kind === "recommendation" || opts.kind === "event") {
    return opts.kind;
  }
  return isEvergreenRecommendationSource(opts.source, opts.categories)
    ? "recommendation"
    : "event";
}
