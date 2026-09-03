import { db, recurringShows } from "@bored/db";
import {
  CHI_DEFAULT,
  LA_DEFAULT,
  SF_DEFAULT,
  nextRecurringOccurrence,
  type RecurringSchedule,
} from "@bored/shared";
import { eq } from "drizzle-orm";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

function timezoneForCity(city: string | null | undefined): string {
  if (city === "chicago") return CHI_DEFAULT.timezone;
  if (city === "la") return LA_DEFAULT.timezone;
  return SF_DEFAULT.timezone;
}

/** Stable id — one durable feed row per recurring_shows template. */
export function recurringSourceEventId(showId: string): string {
  return contentHash(["recurring", showId]);
}

function tagsForRecurringCategory(category: string): string[] {
  const tags = new Set<string>(["recurring"]);
  if (category.startsWith("comedy.")) {
    tags.add("comedy");
    return [...tags];
  }
  if (category.startsWith("music.")) {
    tags.add("live_music");
    const genre = category.slice("music.".length);
    if (genre) tags.add(genre);
    return [...tags];
  }
  return [...tags];
}

/**
 * One durable row per active recurring room (comedy + local live music).
 * Schedule lives in rawPayload; feed expands matching days into tonight /
 * weekend / by-time.
 */
export const recurringComedyAdapter: SourceAdapter = {
  id: "recurring",
  description:
    "Curated recurring rooms — comedy + local live music (expand at feed read)",
  async fetch() {
    const shows = await db
      .select()
      .from(recurringShows)
      .where(eq(recurringShows.active, true));

    const now = new Date();
    const events: NormalizedEvent[] = [];

    for (const show of shows) {
      const schedule: RecurringSchedule = {
        weekday: show.weekday,
        nthWeekday: show.nthWeekday,
        hour: show.hour,
        minute: show.minute,
      };
      const next = nextRecurringOccurrence(schedule, now);
      if (!next) continue;

      const city = show.city ?? "sf";
      const sourceEventId = recurringSourceEventId(show.id);
      const category = show.comedySubtype;

      events.push({
        source: "recurring",
        sourceEventId,
        title: show.name,
        description: `${show.name} at ${show.venueName}${show.priceHint ? ` — ${show.priceHint}` : ""}`,
        startsAt: next.startsAt,
        timezone: timezoneForCity(city),
        venueName: show.venueName,
        address: show.address,
        neighborhood: show.neighborhood,
        lat: show.lat,
        lng: show.lng,
        city,
        isFree: /free/i.test(show.priceHint ?? ""),
        categories: [category],
        tags: tagsForRecurringCategory(category),
        url: show.sourceUrl,
        recurringShowId: show.id,
        rawPayload: {
          recurringShowId: show.id,
          schedule,
          priceHint: show.priceHint ?? null,
        },
      });
    }

    return {
      events,
      replaceForSource: "recurring",
    };
  },
};
