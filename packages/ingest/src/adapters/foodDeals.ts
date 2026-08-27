import {
  CHI_DEFAULT,
  CURATED_FOOD_DEALS,
  SF_DEFAULT,
  nextFoodDealOccurrence,
  type CuratedFoodDeal,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const TIMEZONE_BY_CITY: Record<string, string> = {
  sf: SF_DEFAULT.timezone,
  chicago: CHI_DEFAULT.timezone,
};

function timezoneForCity(city?: string | null): string {
  return TIMEZONE_BY_CITY[city ?? "sf"] ?? SF_DEFAULT.timezone;
}

/**
 * One durable row per curated deal. Schedule lives in rawPayload; feed expands
 * matching days into the view. `startsAt` is the next occurrence for ranking.
 * Orphans pruned by runner via `replaceForSource`.
 */
export const foodDealsAdapter: SourceAdapter = {
  id: "food_deals",
  description:
    "Curated happy hours and lunch specials — one row per deal (SF + Chicago)",
  async fetch() {
    const now = new Date();
    const eventsOut: NormalizedEvent[] = [];

    for (const deal of CURATED_FOOD_DEALS) {
      const row = materializeDeal(deal, now);
      if (!row) continue;
      eventsOut.push(row);
    }

    return { events: eventsOut, replaceForSource: "food_deals" };
  },
};

/** Stable id for upsert — deal.id, not per-calendar-day hash. */
export function foodDealSourceEventId(dealId: string): string {
  return contentHash(["food_deal", dealId]);
}

export function materializeDeal(
  deal: CuratedFoodDeal,
  now: Date,
): NormalizedEvent | null {
  const next = nextFoodDealOccurrence(deal.schedule, now, 28);
  if (!next) return null;

  const timezone = timezoneForCity(deal.city);
  const sourceEventId = foodDealSourceEventId(deal.id);

  return {
    source: "food_deals",
    sourceEventId,
    title: deal.title,
    description: `${deal.dealSummary}. ${deal.description}`.slice(0, 1500),
    startsAt: next.startsAt,
    endsAt: next.endsAt,
    timezone,
    venueName: deal.venueName,
    address: deal.address ?? null,
    neighborhood: deal.neighborhood ?? null,
    lat: deal.lat ?? null,
    lng: deal.lng ?? null,
    city: deal.city ?? "sf",
    priceMin: deal.priceMin ?? null,
    priceMax: deal.priceMax ?? null,
    isFree: deal.priceMin === 0,
    categories: ["food"],
    tags: ["food_deal", deal.dealKind, ...deal.sources],
    url: deal.url ?? null,
    organizer: deal.sources.map((s) => s.replace(/_/g, " ")).join(", "),
    rawPayload: {
      dealId: deal.id,
      dealKind: deal.dealKind,
      dealSummary: deal.dealSummary,
      sources: deal.sources,
      rating: deal.rating ?? null,
      schedule: deal.schedule,
    },
  };
}

export { enrichFoodEventDetail as enrichFoodDealDetail } from "./foodEditorial.js";
