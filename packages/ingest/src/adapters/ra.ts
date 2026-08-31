import { enrichCategoriesWithTags } from "@bored/shared";
import {
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const GRAPHQL_URL = "https://ra.co/graphql";

const RA_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Content-Type": "application/json",
  Accept: "application/json",
  Origin: "https://ra.co",
  Referer: "https://ra.co/",
} as const;

/** RA area ids (from areas(searchTerm) on ra.co/graphql) */
export const RA_AREA = {
  chicago: 17,
  sf: 218,
  la: 18,
} as const;

type RaArtist = { id?: string; name?: string };
type RaGenre = { name?: string };
type RaImage = { filename?: string; type?: string };
type RaVenue = {
  id?: string;
  name?: string;
  address?: string | null;
  area?: { id?: string; name?: string } | null;
  location?: { latitude?: number | null; longitude?: number | null } | null;
};

type RaEvent = {
  id: string;
  title?: string;
  content?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  contentUrl?: string | null;
  flyerFront?: string | null;
  cost?: string | null;
  minimumAge?: number | null;
  attending?: number | null;
  interestedCount?: number | null;
  images?: RaImage[] | null;
  venue?: RaVenue | null;
  artists?: RaArtist[] | null;
  genres?: RaGenre[] | null;
  promoters?: { name?: string }[] | null;
};

type ListingsResponse = {
  data?: {
    eventListings?: {
      totalResults?: number;
      data?: { event?: RaEvent | null }[];
    };
  };
  errors?: { message: string }[];
};

const LISTINGS_QUERY = `
query GET_EVENT_LISTINGS($filters: FilterInputDtoInput, $pageSize: Int, $page: Int) {
  eventListings(filters: $filters, pageSize: $pageSize, page: $page) {
    totalResults
    data {
      event {
        id
        title
        content
        date
        startTime
        endTime
        contentUrl
        flyerFront
        cost
        minimumAge
        attending
        interestedCount
        images { filename type }
        venue {
          id
          name
          address
          area { id name }
          location { latitude longitude }
        }
        artists { id name }
        genres { name }
        promoters { name }
      }
    }
  }
}`;

type RaRegion = {
  adapterId: string;
  description: string;
  areaId: number;
  city: string;
  timezone: string;
  /** Hours to add to local wall time to get UTC (CDT≈5, PDT≈7) */
  utcOffsetHours: number;
  referer: string;
};

async function raGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  referer: string,
): Promise<T> {
  const res = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: { ...RA_HEADERS, Referer: referer },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`RA GraphQL ${res.status}`);
  return (await res.json()) as T;
}

function flyerUrl(ev: RaEvent): string | null {
  const images = ev.images ?? [];
  const front = images.find((i) => i.type === "FLYERFRONT")?.filename;
  const any = images[0]?.filename;
  return front || ev.flyerFront || any || null;
}

const EVENT_FLYER_QUERY = `
query GET_EVENT_FLYER($id: ID!) {
  event(id: $id) {
    id
    flyerFront
    images { filename type }
  }
}`;

/** Single-event flyer for RA-linked listings (e.g. 19hz ticket URLs). */
export async function fetchRaFlyerUrl(
  eventId: string,
): Promise<string | null> {
  const payload = await raGraphql<{
    data?: { event?: RaEvent | null };
    errors?: { message: string }[];
  }>(EVENT_FLYER_QUERY, { id: eventId }, "https://ra.co/");
  if (payload.errors?.length) return null;
  const ev = payload.data?.event;
  return ev ? flyerUrl(ev) : null;
}

/**
 * RA returns naive local datetimes (`2026-08-25T20:00:00.000`).
 * Interpret in the region timezone via fixed UTC offset (DST approx).
 */
function parseRaLocal(
  raw: string | null | undefined,
  utcOffsetHours: number,
): Date | null {
  if (!raw) return null;
  const m = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/,
  );
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(
    Date.UTC(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3]),
      Number(m[4]) + utcOffsetHours,
      Number(m[5]),
      m[6] ? Number(m[6]) : 0,
    ),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseRaCost(cost: string | null | undefined): {
  priceMin: number | null;
  priceMax: number | null;
  isFree: boolean;
} {
  if (cost == null || !String(cost).trim()) {
    return { priceMin: null, priceMax: null, isFree: false };
  }
  const text = String(cost).trim();
  if (/^(free|0|\$0|£0)$/i.test(text)) {
    return { priceMin: 0, priceMax: 0, isFree: true };
  }
  // Prefer shared parsePrice for $ ranges; also handle bare numbers / £
  const normalized = text
    .replace(/£/g, "$")
    .replace(/(\d)\s*[-–]\s*(\$?\d)/g, "$1-$2");
  const parsed = parsePrice(normalized);
  if (parsed.priceMin != null || parsed.isFree) return parsed;
  const nums = [...text.matchAll(/(\d+(?:\.\d+)?)/g)].map((m) =>
    Math.round(Number(m[1])),
  );
  if (!nums.length) return { priceMin: null, priceMax: null, isFree: false };
  return {
    priceMin: Math.min(...nums),
    priceMax: Math.max(...nums),
    isFree: Math.min(...nums) === 0,
  };
}

function genreTags(ev: RaEvent): string[] {
  return (ev.genres ?? [])
    .map((g) => (g.name ?? "").trim().toLowerCase())
    .filter(Boolean);
}

function artistNames(ev: RaEvent): string[] {
  return (ev.artists ?? [])
    .map((a) => (a.name ?? "").trim())
    .filter(Boolean);
}

function toNormalized(ev: RaEvent, region: RaRegion): NormalizedEvent | null {
  if (!ev.id || !ev.title) return null;
  const startsAt =
    parseRaLocal(ev.startTime, region.utcOffsetHours) ??
    parseRaLocal(ev.date, region.utcOffsetHours);
  if (!startsAt) return null;
  if (startsAt.getTime() < Date.now() - 12 * 3600000) return null;

  const endsAt = parseRaLocal(ev.endTime, region.utcOffsetHours);
  const { priceMin, priceMax, isFree } = parseRaCost(ev.cost);
  const artists = artistNames(ev);
  const genres = genreTags(ev);
  // Genres only in tags (artist names are lineup, not genre chips)
  const tags = genres.slice(0, 12);
  const promoters = (ev.promoters ?? [])
    .map((p) => p.name?.trim())
    .filter(Boolean) as string[];

  const description = (ev.content ?? "").trim() || null;
  const age =
    ev.minimumAge != null && ev.minimumAge > 0
      ? `${ev.minimumAge}+`
      : null;

  return {
    source: "ra",
    sourceEventId: String(ev.id),
    title: ev.title.trim(),
    description,
    startsAt,
    endsAt,
    timezone: region.timezone,
    venueName: ev.venue?.name ?? null,
    address: ev.venue?.address ?? null,
    neighborhood: null,
    lat: ev.venue?.location?.latitude ?? null,
    lng: ev.venue?.location?.longitude ?? null,
    city: region.city,
    priceMin,
    priceMax,
    isFree,
    categories: enrichCategoriesWithTags(
      ["music.electronic", "nightlife"],
      genres,
    ),
    tags,
    ageRestriction: age,
    url: ev.contentUrl
      ? ev.contentUrl.startsWith("http")
        ? ev.contentUrl
        : `https://ra.co${ev.contentUrl}`
      : `https://ra.co/events/${ev.id}`,
    imageUrl: flyerUrl(ev),
    organizer: promoters[0] ?? artists[0] ?? null,
    rawPayload: {
      raId: ev.id,
      artists,
      genres: (ev.genres ?? []).map((g) => g.name).filter(Boolean),
      promoters,
      attending: ev.attending ?? null,
      interestedCount: ev.interestedCount ?? null,
      costRaw: ev.cost ?? null,
      minimumAge: ev.minimumAge ?? null,
      areaId: region.areaId,
    },
  };
}

function createRaAdapter(region: RaRegion): SourceAdapter {
  return {
    id: region.adapterId,
    description: region.description,
    async fetch() {
      const events: NormalizedEvent[] = [];
      const seen = new Set<string>();
      const now = new Date();
      const start = now.toISOString().slice(0, 10);
      const end = new Date(now.getTime() + 21 * 86400000)
        .toISOString()
        .slice(0, 10);

      for (let page = 1; page <= 6; page++) {
        let payload: ListingsResponse;
        try {
          payload = await raGraphql<ListingsResponse>(
            LISTINGS_QUERY,
            {
              filters: {
                areas: { eq: region.areaId },
                listingDate: { gte: start, lte: end },
              },
              pageSize: 50,
              page,
            },
            region.referer,
          );
        } catch (err) {
          console.warn(
            `[${region.adapterId}]`,
            err instanceof Error ? err.message : err,
          );
          break;
        }
        if (payload.errors?.length) {
          console.warn(
            `[${region.adapterId}] GraphQL:`,
            payload.errors[0]?.message,
          );
          break;
        }

        const batch = payload.data?.eventListings?.data ?? [];
        if (!batch.length) break;

        for (const row of batch) {
          const ev = row.event;
          if (!ev) continue;
          const normalized = toNormalized(ev, region);
          if (!normalized) continue;
          if (seen.has(normalized.sourceEventId)) continue;
          seen.add(normalized.sourceEventId);
          events.push(normalized);
        }

        if (batch.length < 50) break;
      }

      return { events: events.slice(0, 250) };
    },
  };
}

/** Resident Advisor Chicago listings (area 17). */
export const raChicagoAdapter = createRaAdapter({
  adapterId: "ra_chi",
  description: "Resident Advisor Chicago events (lineup + flyer + genres)",
  areaId: RA_AREA.chicago,
  city: "chicago",
  timezone: "America/Chicago",
  utcOffsetHours: 5,
  referer: "https://ra.co/events/us/chicago",
});

/** Resident Advisor SF/Oakland listings (area 218). */
export const raSfAdapter = createRaAdapter({
  adapterId: "ra_sf",
  description: "Resident Advisor SF/Oakland events (lineup + flyer + genres)",
  areaId: RA_AREA.sf,
  city: "sf",
  timezone: "America/Los_Angeles",
  utcOffsetHours: 7,
  referer: "https://ra.co/events/us/sanfrancisco",
});

/** Resident Advisor Los Angeles listings (area 18). */
export const raLaAdapter = createRaAdapter({
  adapterId: "ra_la",
  description: "Resident Advisor Los Angeles events (lineup + flyer + genres)",
  areaId: RA_AREA.la,
  city: "la",
  timezone: "America/Los_Angeles",
  utcOffsetHours: 7,
  referer: "https://ra.co/events/us/losangeles",
});
