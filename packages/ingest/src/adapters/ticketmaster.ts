import {
  categoriesFromMusicGenreLabel,
  cityKeyFromLabel,
  dailyHoursFromClockLabels,
  fromZonedTime,
  TIME_TBA_TAG,
  type DailyHours,
} from "@bored/shared";
import { finalizeTicketmasterEvents } from "@bored/shared/coalesce";
import { createAttractionLinkCache } from "../tmAttractionLinks.js";
import {
  fetchJson,
  type AdapterFetchResult,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/**
 * TBA / pick-a-slot Ticketmaster products whose section names are departure
 * times. Discovery omits the wall clock; Host EDP embeds the catalog as
 * secnames (bot-walled). Keep a small title/venue hint for known multi-slot
 * runs — full inventory scrape is intentionally out of scope.
 */
const TM_TBA_HOURS_HINTS: {
  test: (title: string, venue: string) => boolean;
  /** Observed Host secname span (not “available today”). */
  hours: DailyHours;
  /** Example labels so hours stay parseable/tested via shared helper. */
  catalogLabels: string[];
}[] = [
  {
    test: (title, venue) =>
      /river cruise/i.test(title) &&
      /first lady|architecture center/i.test(`${title} ${venue}`),
    // Ticketmaster section catalog: 09:00AM … 8:00PM CRUISE
    hours: { open: "09:00", close: "20:00" },
    catalogLabels: ["09:00AM CRUISE", "8:00PM CRUISE"],
  },
];

function tmTbaDailyHours(title: string, venue: string): DailyHours | null {
  for (const hint of TM_TBA_HOURS_HINTS) {
    if (!hint.test(title, venue)) continue;
    return (
      dailyHoursFromClockLabels(hint.catalogLabels) ?? hint.hours
    );
  }
  return null;
}

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

/** Downtown LA — ~50mi covers basin + valleys. */
const LA_GEO = {
  latlong: "34.0522,-118.2437",
  radiusMiles: "50",
  timezone: "America/Los_Angeles",
  stateCodes: new Set(["CA"]),
};

const COMEDY_VENUE_KEYWORDS = /cobb|punch\s*line|punchline/i;

type TmEvent = {
  id: string;
  name: string;
  url?: string;
  /** Discovery “About” copy — prefer over pleaseNote (venue policy). */
  info?: string;
  pleaseNote?: string;
  images?: { url: string; width?: number; fallback?: boolean }[];
  dates?: {
    start?: {
      dateTime?: string;
      localDate?: string;
      localTime?: string;
      timeTBA?: boolean;
      noSpecificTime?: boolean;
    };
    timezone?: string;
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
    attractions?: { id?: string; name?: string; url?: string }[];
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
      const enriched = await enrichSportsAttractionLinks(events, key);
      return tmFetchResult(enriched);
    },
  };
}

/** Fill homepage / Instagram / wiki from TM attraction detail (sports only). */
async function enrichSportsAttractionLinks(
  events: NormalizedEvent[],
  apiKey: string,
): Promise<NormalizedEvent[]> {
  const cache = createAttractionLinkCache(apiKey);
  const out: NormalizedEvent[] = [];

  for (const ev of events) {
    if (!ev.tags?.includes("sports")) {
      out.push(ev);
      continue;
    }
    const payload =
      ev.rawPayload && typeof ev.rawPayload === "object"
        ? ({ ...(ev.rawPayload as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};
    const stubs = Array.isArray(payload.teams)
      ? payload.teams.filter(
          (t): t is { name?: string; attractionId?: string } =>
            Boolean(t) && typeof t === "object",
        )
      : [];
    if (!stubs.length) {
      out.push(ev);
      continue;
    }

    const teams = [];
    for (const stub of stubs.slice(0, 8)) {
      const name = typeof stub.name === "string" ? stub.name.trim() : "";
      const attractionId =
        typeof stub.attractionId === "string" ? stub.attractionId.trim() : "";
      if (!name) continue;
      if (!attractionId) {
        teams.push({ name, attractionId: null, homepageUrl: null, instagramUrl: null, wikiUrl: null });
        continue;
      }
      teams.push(await cache.resolveTeam(name, attractionId));
    }

    out.push({
      ...ev,
      rawPayload: {
        ...payload,
        artists: teams.map((t) => t.name),
        teams,
      },
    });
  }

  return out;
}

function resolveTmStartsAt(
  start: NonNullable<TmEvent["dates"]>["start"] | undefined,
  timeZone: string,
  dailyHours?: DailyHours | null,
): { startsAt: Date; endsAt: Date | null; timeTba: boolean } | null {
  if (!start) return null;

  const timeTba = Boolean(
    start.timeTBA ||
      start.noSpecificTime ||
      (!start.dateTime && start.localDate && !start.localTime),
  );

  if (timeTba) {
    if (!start.localDate) return null;
    const [y, m, d] = start.localDate.split("-").map(Number);
    if (!y || !m || !d) return null;
    if (dailyHours) {
      const [oh, om] = dailyHours.open.split(":").map(Number);
      const [ch, cm] = dailyHours.close.split(":").map(Number);
      return {
        startsAt: fromZonedTime(y, m, d, oh ?? 9, om ?? 0, 0, timeZone),
        endsAt: fromZonedTime(y, m, d, ch ?? 17, cm ?? 0, 0, timeZone),
        timeTba: true,
      };
    }
    // Noon local — day bucket only; UI suppresses clock time via time_tba.
    return {
      startsAt: fromZonedTime(y, m, d, 12, 0, 0, timeZone),
      endsAt: null,
      timeTba: true,
    };
  }

  if (start.dateTime) {
    const startsAt = new Date(start.dateTime);
    if (Number.isNaN(startsAt.getTime())) return null;
    return { startsAt, endsAt: null, timeTba: false };
  }

  if (start.localDate && start.localTime) {
    const [y, m, d] = start.localDate.split("-").map(Number);
    if (!y || !m || !d) return null;
    const [hh, mm, ss] = start.localTime.split(":").map(Number);
    return {
      startsAt: fromZonedTime(
        y,
        m,
        d,
        hh ?? 0,
        mm ?? 0,
        ss ?? 0,
        timeZone,
      ),
      endsAt: null,
      timeTba: false,
    };
  }

  return null;
}

/**
 * Prefer real flyers (`fallback: false`, often TicketWeb) over genre/category
 * placeholders — those are usually larger 16:9 assets under ticketm.net/dam/c/.
 */
function pickTmImage(images: TmEvent["images"]): string | null {
  if (!images?.length) return null;
  const ranked = [...images].sort((a, b) => {
    const aFb = a.fallback === true ? 1 : 0;
    const bFb = b.fallback === true ? 1 : 0;
    if (aFb !== bFb) return aFb - bFb;
    return (b.width ?? 0) - (a.width ?? 0);
  });
  return ranked[0]?.url ?? null;
}

/** Discovery “About” blurb; skip pleaseNote (scalping / door policy). */
function tmEventDescription(ev: TmEvent): string | null {
  const info = ev.info?.replace(/\s+/g, " ").trim();
  if (!info) return null;
  return info.length > 4000 ? info.slice(0, 4000) : info;
}

function normalizeTmEvent(
  ev: TmEvent,
  opts: {
    timezone: string;
    stateCodes: Set<string>;
  },
): NormalizedEvent | null {
  const venue = ev._embedded?.venues?.[0];
  const timeZone = ev.dates?.timezone || opts.timezone;
  const venueName = venue?.name ?? "";
  const tbaHours = tmTbaDailyHours(ev.name, venueName);
  const resolved = resolveTmStartsAt(
    ev.dates?.start,
    timeZone,
    // Only apply catalog hours when Discovery says time is TBA.
    ev.dates?.start?.timeTBA ||
      ev.dates?.start?.noSpecificTime ||
      (!ev.dates?.start?.dateTime &&
        ev.dates?.start?.localDate &&
        !ev.dates?.start?.localTime)
      ? tbaHours
      : null,
  );
  if (!resolved) return null;
  const { startsAt, endsAt, timeTba } = resolved;
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
  const categories = mapTmCategories(segment, genre, venueName);
  const priceMin = ev.priceRanges?.[0]?.min ?? null;
  const priceMax = ev.priceRanges?.[0]?.max ?? null;
  const image = pickTmImage(ev.images);

  const isSports = /sports/i.test(segment);
  const attractionRows = (ev._embedded?.attractions ?? [])
    .map((a) => ({
      name: a.name?.trim() ?? "",
      attractionId: a.id?.trim() || null,
    }))
    .filter((a) => a.name)
    .slice(0, 12);
  const artists = attractionRows.map((a) => a.name);

  const baseTags = [
    ...tmGenreTags(genre, categories),
    ...(isSports ? ["sports"] : []),
    ...(timeTba ? [TIME_TBA_TAG] : []),
  ];

  const dailyHours = timeTba ? tbaHours : null;

  return {
    source: COMEDY_VENUE_KEYWORDS.test(venueName)
      ? "comedy_venue"
      : "ticketmaster",
    sourceEventId: ev.id,
    title: ev.name,
    description: tmEventDescription(ev),
    startsAt,
    endsAt,
    timezone: timeZone,
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
    tags: baseTags,
    url: ev.url ?? null,
    imageUrl: image,
    rawPayload: {
      id: ev.id,
      name: ev.name,
      venue: venueName,
      venueCity,
      stateCode,
      ...(timeTba ? { timeTba: true } : {}),
      ...(dailyHours ? { dailyHours } : {}),
      ...(artists.length ? { artists } : {}),
      // Sports: stubs enriched later via /attractions/{id} externalLinks.
      ...(isSports && attractionRows.length
        ? {
            teams: attractionRows.map((a) => ({
              name: a.name,
              attractionId: a.attractionId,
              homepageUrl: null,
              instagramUrl: null,
              wikiUrl: null,
            })),
          }
        : {}),
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

export const ticketmasterLaAdapter = createTicketmasterAdapter({
  adapterId: "ticketmaster_la",
  description: "Ticketmaster Discovery Los Angeles (latlong + 50mi)",
  geo: LA_GEO,
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

export const comedyVenueLaAdapter = createComedyVenueAdapter({
  adapterId: "comedy_venue_la",
  description:
    "Comedy Store, Laugh Factory Hollywood, The Improv via Ticketmaster keyword search",
  geo: LA_GEO,
  keywords: [
    "The Comedy Store",
    "Laugh Factory Hollywood",
    "Hollywood Improv",
    "Dynasty Typewriter",
    "Upright Citizens Brigade",
  ],
});

function mapTmCategories(segment: string, genre: string, venue: string): string[] {
  if (COMEDY_VENUE_KEYWORDS.test(venue) || /comedy/i.test(segment + genre)) {
    return ["comedy.club"];
  }
  const fromGenre = categoriesFromMusicGenreLabel(genre);
  if (fromGenre.length) {
    if (
      fromGenre.includes("music.electronic") &&
      !fromGenre.includes("nightlife")
    ) {
      return [...fromGenre, "nightlife"];
    }
    return fromGenre;
  }

  const genreMusic =
    /music|rock|pop|jazz|hip hop|hip-hop|rap|country|folk|alternative|metal|punk|soul|r&b|latin|reggae|blues|electronic|dance|house|techno/i.test(
      genre,
    );
  if (/music/i.test(segment) || genreMusic) {
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
