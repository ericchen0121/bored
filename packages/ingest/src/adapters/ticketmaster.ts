import { cityKeyFromLabel } from "@bored/shared";
import { finalizeTicketmasterEvents } from "@bored/shared/coalesce";
import {
  fetchJson,
  type AdapterFetchResult,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/** SF Civic Center — ~50mi covers SF + East Bay + Peninsula + South Bay. */
const SF_GEO = {
  latlong: "37.7749,-122.4194",
  radiusMiles: "50",
  timezone: "America/Los_Angeles",
  stateCodes: new Set(["CA"]),
};

/** Loop — ~40mi covers city + near-north / west suburbs. */
const CHI_GEO = {
  latlong: "41.8781,-87.6298",
  radiusMiles: "40",
  timezone: "America/Chicago",
  stateCodes: new Set(["IL"]),
};

const COMEDY_VENUE_KEYWORDS = /cobb|punch\s*line|punchline/i;

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  images?: { url: string; width?: number }[];
  dates?: {
    start?: { dateTime?: string; localDate?: string; localTime?: string };
  };
  priceRanges?: { min?: number; max?: number }[];
  classifications?: {
    segment?: { name?: string };
    genre?: { name?: string };
    subGenre?: { name?: string };
  }[];
  _embedded?: {
    venues?: {
      name?: string;
      city?: { name?: string };
      state?: { stateCode?: string; name?: string };
      country?: { countryCode?: string };
      address?: { line1?: string };
      location?: { latitude?: string; longitude?: string };
    }[];
    attractions?: { name?: string }[];
  };
};

type TmResponse = {
  _embedded?: { events?: TmEvent[] };
  page?: { totalPages?: number; number?: number };
};

/** Same-day coalesce + multi-day cap + orphan ids for runner GC. */
function tmFetchResult(events: NormalizedEvent[]): AdapterFetchResult {
  const { events: finalized, orphans } = finalizeTicketmasterEvents(events);
  const bySource = new Map<string, Set<string>>();
  for (const { source, sourceEventId } of orphans) {
    const set = bySource.get(source) ?? new Set<string>();
    set.add(sourceEventId);
    bySource.set(source, set);
  }
  const deleteSourceEventIds = [...bySource.entries()].map(([source, ids]) => ({
    source,
    ids: [...ids],
  }));

  return {
    events: finalized,
    deleteSourceEventIds: deleteSourceEventIds.length
      ? deleteSourceEventIds
      : undefined,
    purgeLegacyCoalesceSources: ["ticketmaster", "comedy_venue"],
  };
}

function createTicketmasterAdapter(opts: {
  adapterId: string;
  description: string;
  geo: typeof SF_GEO;
}): SourceAdapter {
  return {
    id: opts.adapterId,
    description: opts.description,
    async fetch() {
      const key = process.env.TICKETMASTER_API_KEY;
      if (!key) {
        console.warn(`[${opts.adapterId}] TICKETMASTER_API_KEY missing — skipping`);
        return {
          events: [],
          purgeLegacyCoalesceSources: ["ticketmaster", "comedy_venue"],
        };
      }

      const startDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const events: NormalizedEvent[] = [];
      const seen = new Set<string>();

      for (let page = 0; page < 5; page++) {
        const params = new URLSearchParams({
          apikey: key,
          latlong: opts.geo.latlong,
          radius: opts.geo.radiusMiles,
          unit: "miles",
          countryCode: "US",
          startDateTime,
          size: "100",
          page: String(page),
          sort: "date,asc",
        });
        const data = await fetchJson<TmResponse>(
          `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
        );
        const batch = data._embedded?.events ?? [];
        if (!batch.length) break;

        for (const ev of batch) {
          const normalized = normalizeTmEvent(ev, {
            timezone: opts.geo.timezone,
            stateCodes: opts.geo.stateCodes,
          });
          if (!normalized) continue;
          if (seen.has(normalized.sourceEventId)) continue;
          seen.add(normalized.sourceEventId);
          events.push(normalized);
        }
        if (batch.length < 100) break;
      }
      return tmFetchResult(events);
    },
  };
}

function normalizeTmEvent(
  ev: TmEvent,
  opts: {
    timezone: string;
    stateCodes: Set<string>;
  },
): NormalizedEvent | null {
  const venue = ev._embedded?.venues?.[0];
  const start =
    ev.dates?.start?.dateTime ??
    (ev.dates?.start?.localDate
      ? `${ev.dates.start.localDate}T${ev.dates.start.localTime ?? "20:00:00"}`
      : null);
  if (!start) return null;
  const startsAt = new Date(start);
  if (Number.isNaN(startsAt.getTime())) return null;
  if (startsAt.getTime() < Date.now() - 60 * 60 * 1000) return null;

  const stateCode = venue?.state?.stateCode?.toUpperCase();
  // Require a known in-market state — latlong alone still returns odd outliers.
  if (!stateCode || !opts.stateCodes.has(stateCode)) return null;
  if (venue?.country?.countryCode && venue.country.countryCode !== "US") {
    return null;
  }

  const venueCity = venue?.city?.name ?? null;
  const city = cityKeyFromLabel(venueCity);

  const segment = ev.classifications?.[0]?.segment?.name?.toLowerCase() ?? "";
  const genre = ev.classifications?.[0]?.genre?.name?.toLowerCase() ?? "";
  const venueName = venue?.name ?? "";
  const categories = mapTmCategories(segment, genre, venueName);
  const priceMin = ev.priceRanges?.[0]?.min ?? null;
  const priceMax = ev.priceRanges?.[0]?.max ?? null;
  const image =
    [...(ev.images ?? [])].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0]
      ?.url ?? null;

  const artists = (ev._embedded?.attractions ?? [])
    .map((a) => a.name?.trim())
    .filter((n): n is string => Boolean(n))
    .slice(0, 12);

  return {
    source: COMEDY_VENUE_KEYWORDS.test(venueName)
      ? "comedy_venue"
      : "ticketmaster",
    sourceEventId: ev.id,
    title: ev.name,
    startsAt,
    timezone: opts.timezone,
    venueName,
    address: venue?.address?.line1 ?? null,
    lat: venue?.location?.latitude ? Number(venue.location.latitude) : null,
    lng: venue?.location?.longitude ? Number(venue.location.longitude) : null,
    city,
    priceMin: priceMin != null ? Math.round(priceMin) : null,
    priceMax: priceMax != null ? Math.round(priceMax) : null,
    isFree: priceMin === 0,
    categories,
    // Segment is coarse TM taxonomy (e.g. "Arts & Theatre") — already mapped
    // into categories. Keep genre only when it adds signal beyond the category.
    tags: [
      ...tmGenreTags(genre, categories),
      ...(/sports/i.test(segment) ? ["sports"] : []),
    ],
    url: ev.url ?? null,
    imageUrl: image,
    rawPayload: {
      id: ev.id,
      name: ev.name,
      venue: venueName,
      venueCity,
      stateCode,
      ...(artists.length ? { artists } : {}),
    },
  };
}

export const ticketmasterAdapter = createTicketmasterAdapter({
  adapterId: "ticketmaster",
  description: "Ticketmaster Discovery SF Bay Area (latlong + 50mi)",
  geo: SF_GEO,
});

export const ticketmasterChicagoAdapter = createTicketmasterAdapter({
  adapterId: "ticketmaster_chi",
  description: "Ticketmaster Discovery Chicago (latlong + 40mi)",
  geo: CHI_GEO,
});

/** Dedicated Cobb's + Punch Line venue pulls (same TM API, filtered). */
function createComedyVenueAdapter(opts: {
  adapterId: string;
  description: string;
  geo: typeof SF_GEO;
  keywords: string[];
}): SourceAdapter {
  return {
    id: opts.adapterId,
    description: opts.description,
    async fetch() {
      const key = process.env.TICKETMASTER_API_KEY;
      if (!key) {
        console.warn(`[${opts.adapterId}] TICKETMASTER_API_KEY missing — skipping`);
        return {
          events: [],
          purgeLegacyCoalesceSources: ["ticketmaster", "comedy_venue"],
        };
      }

      const startDateTime = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
      const events: NormalizedEvent[] = [];
      const seen = new Set<string>();

      for (const keyword of opts.keywords) {
        const params = new URLSearchParams({
          apikey: key,
          keyword,
          latlong: opts.geo.latlong,
          radius: opts.geo.radiusMiles,
          unit: "miles",
          countryCode: "US",
          startDateTime,
          size: "50",
          sort: "date,asc",
        });
        const data = await fetchJson<TmResponse>(
          `https://app.ticketmaster.com/discovery/v2/events.json?${params}`,
        );
        for (const ev of data._embedded?.events ?? []) {
          const normalized = normalizeTmEvent(ev, {
            timezone: opts.geo.timezone,
            stateCodes: opts.geo.stateCodes,
          });
          if (!normalized) continue;
          const comedyEvent: NormalizedEvent = {
            ...normalized,
            source: "comedy_venue",
            categories: ["comedy.club"],
            tags: Array.from(
              new Set([...(normalized.tags ?? []), "standup", "ticketmaster"]),
            ),
            rawPayload: {
              ...(typeof normalized.rawPayload === "object" &&
              normalized.rawPayload
                ? normalized.rawPayload
                : {}),
              keyword,
            },
          };
          if (seen.has(comedyEvent.sourceEventId)) continue;
          seen.add(comedyEvent.sourceEventId);
          events.push(comedyEvent);
        }
      }
      return tmFetchResult(events);
    },
  };
}

export const comedyVenueAdapter = createComedyVenueAdapter({
  adapterId: "comedy_venue",
  description: "Cobb's and Punch Line via Ticketmaster keyword search",
  geo: SF_GEO,
  keywords: ["Cobb's Comedy Club", "Punch Line San Francisco"],
});

export const comedyVenueChicagoAdapter = createComedyVenueAdapter({
  adapterId: "comedy_venue_chi",
  description:
    "Zanies, Laugh Factory, Comedy Bar, Second City via Ticketmaster keyword search",
  geo: CHI_GEO,
  keywords: [
    "Zanies Comedy Club Chicago",
    "Laugh Factory Chicago",
    "The Comedy Bar Chicago",
    "Second City Chicago",
    "iO Chicago",
  ],
});

function mapTmCategories(segment: string, genre: string, venue: string): string[] {
  if (COMEDY_VENUE_KEYWORDS.test(venue) || /comedy/i.test(segment + genre)) {
    return ["comedy.club"];
  }
  const genreMusic =
    /music|rock|pop|jazz|hip hop|hip-hop|rap|country|folk|alternative|metal|punk|soul|r&b|latin|reggae|blues|electronic|dance|house|techno/i.test(
      genre,
    );
  if (/music/i.test(segment) || genreMusic) {
    if (/electronic|dance|house|techno/i.test(genre))
      return ["music.electronic", "nightlife"];
    if (/jazz/i.test(genre)) return ["music.jazz"];
    return ["music.live"];
  }
  if (/sports/i.test(segment)) {
    return ["outdoors"];
  }
  if (/arts|theatre|theater/i.test(segment)) return ["arts"];
  return ["nightlife"];
}

/** Genre tags that aren't redundant with the mapped category. */
function tmGenreTags(genre: string, categories: string[]): string[] {
  if (!genre) return [];
  const isComedyCat = categories.some((c) => c.startsWith("comedy."));
  if (isComedyCat && /comedy/i.test(genre)) return [];
  return [genre];
}
