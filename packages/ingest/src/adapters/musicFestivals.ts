import {
  CHI_DEFAULT,
  CURATED_MUSIC_FESTIVALS,
  SF_DEFAULT,
  fromZonedTime,
  type CuratedMusicFestival,
} from "@bored/shared";
import {
  CHI_GEO,
  SF_GEO,
  fetchMusicFestivalTmEvents,
  type MusicFestivalTmSearch,
} from "./ticketmaster.js";
import {
  contentHash,
  type AdapterFetchResult,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const TM_SEARCHES: MusicFestivalTmSearch[] = [
  {
    geo: CHI_GEO,
    keyword: "Lollapalooza",
    festivalId: "chi-lollapalooza-2026",
    slug: "lollapalooza",
  },
  {
    geo: CHI_GEO,
    keyword: "ARC Music Festival",
    festivalId: "chi-arc-2026",
    slug: "arc",
  },
  {
    geo: CHI_GEO,
    keyword: "North Coast Music Festival",
    festivalId: "chi-north-coast-2026",
    slug: "north_coast",
  },
  {
    geo: SF_GEO,
    keyword: "Portola Music Festival",
    festivalId: "sf-portola-2026",
    slug: "portola",
  },
];

const TIMEZONE_BY_CITY: Record<string, string> = {
  sf: SF_DEFAULT.timezone,
  chicago: CHI_DEFAULT.timezone,
};

function timezoneForCity(city: string): string {
  return TIMEZONE_BY_CITY[city] ?? SF_DEFAULT.timezone;
}

function tmByFestivalId(
  tmEvents: NormalizedEvent[],
): Map<string, NormalizedEvent> {
  const out = new Map<string, NormalizedEvent>();
  for (const ev of tmEvents) {
    const payload =
      ev.rawPayload && typeof ev.rawPayload === "object"
        ? (ev.rawPayload as Record<string, unknown>)
        : null;
    const festivalId =
      typeof payload?.festivalId === "string" ? payload.festivalId : null;
    if (!festivalId || out.has(festivalId)) continue;
    out.set(festivalId, ev);
  }
  return out;
}

function materializeCuratedFestival(
  festival: CuratedMusicFestival,
  tm?: NormalizedEvent,
): NormalizedEvent {
  const timeZone = timezoneForCity(festival.city);
  const [sy, sm, sd] = festival.startDate.split("-").map(Number);
  const [ey, em, ed] = festival.endDate.split("-").map(Number);
  const startsAt = fromZonedTime(
    sy!,
    sm!,
    sd!,
    festival.startHour ?? 12,
    festival.startMinute ?? 0,
    0,
    timeZone,
  );
  const endsAt = fromZonedTime(ey!, em!, ed!, 23, 59, 59, timeZone);

  return {
    source: "music_festival",
    sourceEventId: contentHash(["music_festival", festival.city, festival.id]),
    title: festival.title,
    description: festival.description.slice(0, 1500),
    startsAt,
    endsAt,
    timezone: timeZone,
    venueName: festival.venueName,
    address: festival.address,
    neighborhood: festival.neighborhood ?? null,
    lat: festival.lat,
    lng: festival.lng,
    city: festival.city,
    isFree: false,
    priceMin: tm?.priceMin ?? null,
    priceMax: tm?.priceMax ?? null,
    categories: festival.categories,
    tags: Array.from(
      new Set(["festival", "music_festival", ...(festival.tags ?? [])]),
    ),
    url: festival.url || tm?.url || null,
    imageUrl: festival.imageUrl ?? tm?.imageUrl ?? null,
    rawPayload: {
      festivalId: festival.id,
      curated: true,
      ...(tm?.sourceEventId ? { tmEventId: tm.sourceEventId } : {}),
    },
  };
}

/** Flagship music festivals — always curated; TM enriches tickets when available. */
export const musicFestivalAdapter: SourceAdapter = {
  id: "music_festival",
  description:
    "Major music festivals (Lollapalooza, ARC, North Coast, Portola) — curated listings",
  async fetch(): Promise<AdapterFetchResult> {
    const tmEvents = await fetchMusicFestivalTmEvents(
      "music_festival",
      TM_SEARCHES,
    );
    const tmLookup = tmByFestivalId(tmEvents);

    const events = CURATED_MUSIC_FESTIVALS.map((festival) =>
      materializeCuratedFestival(festival, tmLookup.get(festival.id)),
    );

    return {
      events,
      replaceForSource: "music_festival",
    };
  },
};

export { materializeCuratedFestival };
