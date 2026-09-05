import { cityKeyFromLabel, fromZonedTime, textMentionsComedy } from "@bored/shared";
import {
  fetchText,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

/** Public discovery pages embed JSON in `__SERVER_DATA__` (search API was removed in 2019). */
const DISCOVERY_BASE = "https://www.eventbrite.com/d";

type EbTag = {
  prefix?: string;
  tag?: string;
  display_name?: string;
};

type EbVenue = {
  name?: string;
  address?: {
    city?: string;
    region?: string;
    country?: string;
    latitude?: string;
    longitude?: string;
    localized_address_display?: string;
    localized_multi_line_address_display?: string[];
  };
};

type EbLocation = {
  type?: string;
  name?: string;
};

type EbImage = {
  url?: string;
  image_sizes?: {
    medium?: string;
    small?: string;
  };
};

type EbEvent = {
  id?: string;
  eventbrite_event_id?: string;
  eid?: string;
  name?: string;
  summary?: string;
  full_description?: string | null;
  url?: string;
  start_date?: string;
  start_time?: string;
  end_date?: string;
  end_time?: string;
  timezone?: string;
  is_online_event?: boolean;
  is_cancelled?: boolean | null;
  tags?: EbTag[];
  image?: EbImage | null;
  primary_venue?: EbVenue | null;
  locations?: EbLocation[];
  tickets_url?: string | null;
};

type EbSearchPayload = {
  search_data?: {
    events?: {
      results?: EbEvent[];
      pagination?: {
        page_number?: number;
        page_count?: number;
      };
    };
  };
};

function parseServerData(html: string): EbSearchPayload | null {
  const marker = "__SERVER_DATA__ = ";
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = idx + marker.length;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') {
      inStr = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1)) as EbSearchPayload;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseWallClock(
  date: string | undefined,
  time: string | undefined,
  timezone: string,
): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const tm = (time ?? "19:00").match(/^(\d{1,2}):(\d{2})/);
  const hour = tm ? Number(tm[1]) : 19;
  const minute = tm ? Number(tm[2]) : 0;
  return fromZonedTime(y, m, d, hour, minute, 0, timezone);
}

function coordNum(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Feed-sized cover from Eventbrite imgix URLs. */
export function eventbriteFeedImageUrl(image: EbImage | null | undefined): string | null {
  const raw = image?.image_sizes?.medium ?? image?.image_sizes?.small ?? image?.url ?? null;
  if (!raw) return null;
  if (/[?&]w=\d+/.test(raw)) return raw;
  const sep = raw.includes("?") ? "&" : "?";
  return `${raw}${sep}w=400&h=400&fit=crop&auto=format`;
}

function organizerTags(tags: EbTag[] | undefined): string[] {
  const out: string[] = [];
  for (const t of tags ?? []) {
    if (t.prefix !== "OrganizerTag") continue;
    const label = t.display_name?.trim();
    if (label) out.push(label.toLowerCase());
  }
  return out;
}

function mapEbCategories(
  tags: EbTag[] | undefined,
  title: string,
  summary: string | null | undefined,
): string[] {
  const categories = new Set<string>();
  const text = `${title} ${summary ?? ""}`.toLowerCase();

  for (const t of tags ?? []) {
    if (t.prefix !== "EventbriteCategory") continue;
    const c = (t.display_name ?? "").toLowerCase();
    if (/music/.test(c)) categories.add("music.live");
    else if (/food|drink/.test(c)) categories.add("food");
    else if (/comedy|stand.?up/.test(c)) categories.add("comedy.showcase");
    else if (/performing|visual.?art|art|design/.test(c)) categories.add("arts");
    else if (/film|media|entertainment/.test(c)) categories.add("movies");
    else if (/sport|fitness|outdoor/.test(c)) categories.add("outdoors");
    else if (/family|education|school/.test(c)) categories.add("family");
    else if (/charity|community|holiday|hobbies|spirituality/.test(c)) {
      categories.add("nightlife");
    } else categories.add("nightlife");
  }

  if (textMentionsComedy(text)) categories.add("comedy.showcase");
  if (/concert|live music|dj\b|band\b/i.test(text) && !categories.has("comedy.showcase")) {
    categories.add("music.live");
  }
  if (/food|tasting|dinner|brunch/i.test(text)) categories.add("food");
  if (/workshop|lecture|talk|panel|networking|tech|startup|ai\b/i.test(text)) {
    categories.add("tech");
  }
  if (/tournament|game|gaming|esports/i.test(text)) categories.add("tech");

  if (!categories.size) categories.add("nightlife");
  return [...categories];
}

function neighborhoodFrom(locations: EbLocation[] | undefined): string | null {
  for (const loc of locations ?? []) {
    if (loc.type === "neighbourhood" || loc.type === "neighborhood") {
      return loc.name?.trim() || null;
    }
  }
  return null;
}

function toNormalized(
  ev: EbEvent,
  fallbackTimezone: string,
): NormalizedEvent | null {
  const title = ev.name?.trim();
  if (!title) return null;
  if (ev.is_online_event) return null;
  if (ev.is_cancelled) return null;

  const timezone = ev.timezone || fallbackTimezone;
  const startsAt = parseWallClock(ev.start_date, ev.start_time, timezone);
  if (!startsAt || Number.isNaN(startsAt.getTime())) return null;
  if (startsAt.getTime() < Date.now() - 3600000) return null;

  const endsAt = parseWallClock(
    ev.end_date ?? ev.start_date,
    ev.end_time,
    timezone,
  );

  const venue = ev.primary_venue;
  const addr = venue?.address;
  const city = cityKeyFromLabel(addr?.city);
  const orgTags = organizerTags(ev.tags);
  const summary = ev.summary?.trim() || null;

  return {
    source: "eventbrite",
    sourceEventId: String(ev.eventbrite_event_id ?? ev.eid ?? ev.id ?? title),
    title,
    description: summary,
    startsAt,
    endsAt:
      endsAt && !Number.isNaN(endsAt.getTime()) && endsAt > startsAt
        ? endsAt
        : null,
    timezone,
    venueName: venue?.name?.trim() || null,
    address:
      addr?.localized_address_display ??
      addr?.localized_multi_line_address_display?.join(", ") ??
      null,
    neighborhood: neighborhoodFrom(ev.locations),
    lat: coordNum(addr?.latitude),
    lng: coordNum(addr?.longitude),
    city,
    categories: mapEbCategories(ev.tags, title, summary),
    tags: ["eventbrite", ...orgTags],
    url: ev.url ?? ev.tickets_url ?? null,
    imageUrl: eventbriteFeedImageUrl(ev.image),
    rawPayload: ev,
  };
}

async function fetchDiscoveryPage(
  locationSlug: string,
  categorySlug: string,
  page: number,
): Promise<EbEvent[]> {
  let url = `${DISCOVERY_BASE}/${locationSlug}/${categorySlug}/`;
  if (page > 1) url += `?page=${page}`;
  const html = await fetchText(url);
  const data = parseServerData(html);
  return data?.search_data?.events?.results ?? [];
}

function createEventbriteAdapter(opts: {
  adapterId: string;
  description: string;
  locationSlugs: string[];
  categorySlug: string;
  fallbackTimezone: string;
  maxPagesPerLocation: number;
}): SourceAdapter {
  return {
    id: opts.adapterId,
    description: opts.description,
    async fetch() {
      const events: NormalizedEvent[] = [];
      const seen = new Set<string>();

      for (const slug of opts.locationSlugs) {
        for (let page = 1; page <= opts.maxPagesPerLocation; page++) {
          let batch: EbEvent[];
          try {
            batch = await fetchDiscoveryPage(slug, opts.categorySlug, page);
          } catch (err) {
            console.warn(
              `[${opts.adapterId}] ${slug} page ${page} failed:`,
              (err as Error).message,
            );
            break;
          }
          if (!batch.length) break;

          for (const raw of batch) {
            const normalized = toNormalized(raw, opts.fallbackTimezone);
            if (!normalized || seen.has(normalized.sourceEventId)) continue;
            seen.add(normalized.sourceEventId);
            events.push(normalized);
          }

          if (batch.length < 20) break;
        }
      }

      events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
      return { events };
    },
  };
}

/** Bay Area discovery — multiple city slugs, deduped by Eventbrite event id. */
export const eventbriteAdapter = createEventbriteAdapter({
  adapterId: "eventbrite",
  description: "Eventbrite Bay Area public discovery pages",
  locationSlugs: [
    "ca--san-francisco",
    "ca--oakland",
    "ca--san-jose",
    "ca--berkeley",
    "ca--alameda",
    "ca--san-rafael",
  ],
  categorySlug: "all-events",
  fallbackTimezone: "America/Los_Angeles",
  maxPagesPerLocation: 5,
});

export const eventbriteChicagoAdapter = createEventbriteAdapter({
  adapterId: "eventbrite_chi",
  description: "Eventbrite Chicago public discovery pages",
  locationSlugs: ["il--chicago"],
  categorySlug: "all-events",
  fallbackTimezone: "America/Chicago",
  maxPagesPerLocation: 8,
});

export const eventbriteLaAdapter = createEventbriteAdapter({
  adapterId: "eventbrite_la",
  description: "Eventbrite Los Angeles public discovery pages",
  locationSlugs: ["ca--los-angeles", "ca--santa-monica", "ca--pasadena"],
  categorySlug: "all-events",
  fallbackTimezone: "America/Los_Angeles",
  maxPagesPerLocation: 6,
});
