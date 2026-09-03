/**
 * Evergreen theater recommendations — Broadway tours, long-running musicals,
 * and flagship local stages. Same feed UX as food/activity tips.
 */

export type TheaterShowKind =
  | "broadway"
  | "musical"
  | "play"
  | "opera"
  | "venue";

export type CuratedTheaterPick = {
  id: string;
  city: string;
  title: string;
  description: string;
  venueName: string;
  neighborhood?: string;
  address?: string;
  lat?: number;
  lng?: number;
  url?: string;
  imageUrl?: string;
  showKind: TheaterShowKind;
  tags?: string[];
};

const SHOW_KIND_LABELS: Record<TheaterShowKind, string> = {
  broadway: "Broadway",
  musical: "Musical",
  play: "Play",
  opera: "Opera",
  venue: "Theater",
};

export function isTheaterRecommendationSource(source: string): boolean {
  return source === "theater";
}

/** Feed/detail framing: `Broadway · Musical`, `Theater · Play` */
export function theaterRecommendationLabel(opts: {
  rawPayload?: {
    showKind?: unknown;
  } | null;
}): string | null {
  const kind =
    typeof opts.rawPayload?.showKind === "string" &&
    opts.rawPayload.showKind in SHOW_KIND_LABELS
      ? (opts.rawPayload.showKind as TheaterShowKind)
      : null;
  if (!kind) return "Theater pick";
  return `${SHOW_KIND_LABELS[kind]} · Theater`;
}

export function theaterTipFallbackLabel(
  recommendationLabel: string | null | undefined,
): string {
  if (recommendationLabel?.trim()) return recommendationLabel.trim();
  return "Theater pick";
}
