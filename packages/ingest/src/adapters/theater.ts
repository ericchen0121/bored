import {
  CHI_DEFAULT,
  CURATED_THEATER,
  LA_DEFAULT,
  SF_DEFAULT,
  suggestionStartsAt,
  type CuratedTheaterPick,
} from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const TIMEZONE_BY_CITY: Record<string, string> = {
  sf: SF_DEFAULT.timezone,
  chicago: CHI_DEFAULT.timezone,
  la: LA_DEFAULT.timezone,
  berkeley: SF_DEFAULT.timezone,
};

function timezoneForCity(city: string): string {
  return TIMEZONE_BY_CITY[city] ?? SF_DEFAULT.timezone;
}

function theaterTags(pick: CuratedTheaterPick): string[] {
  return [
    "theater",
    pick.showKind,
    ...(pick.tags ?? []),
  ];
}

function materializeTheaterPick(pick: CuratedTheaterPick): NormalizedEvent {
  const sourceEventId = contentHash(["theater", pick.city, pick.id]);

  return {
    source: "theater",
    sourceEventId,
    kind: "recommendation",
    title: pick.title,
    description: pick.description.slice(0, 1500),
    startsAt: suggestionStartsAt(sourceEventId, null),
    timezone: timezoneForCity(pick.city),
    venueName: pick.venueName,
    address: pick.address ?? null,
    neighborhood: pick.neighborhood ?? null,
    lat: pick.lat ?? null,
    lng: pick.lng ?? null,
    city: pick.city,
    isFree: false,
    categories: ["arts"],
    tags: theaterTags(pick),
    url: pick.url ?? null,
    imageUrl: pick.imageUrl ?? null,
    organizer: "Bored picks",
    rawPayload: {
      theaterId: pick.id,
      showKind: pick.showKind,
      imageSource: pick.imageUrl ? "curated" : null,
    },
  };
}

/** Curated evergreen theater — Broadway tours, resident musicals, local stages. */
export const theaterAdapter: SourceAdapter = {
  id: "theater",
  description: "Curated theater — Broadway tours, musicals, local stages",
  async fetch() {
    const events = CURATED_THEATER.map(materializeTheaterPick);
    return { events, replaceForSource: "theater" };
  },
};

export { materializeTheaterPick };
