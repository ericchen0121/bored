import type { RegistrationStatus } from "@bored/shared";
import { cityKeyFromLabel } from "@bored/shared";
import {
  contentHash,
  fetchJson,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

const SF_PLACE_ID = "discplace-BDj7GNbGlsF7Cka";
const CHI_PLACE_ID = "discplace-NdGm35qFD0vaXNF";
const LA_PLACE_ID = "discplace-OgfEAh5KgfMzise";

type LumaPrice =
  | number
  | {
      cents?: number;
      currency?: string;
      min_cents?: number;
      is_flexible?: boolean;
    }
  | null
  | undefined;

type LumaTicketInfo = {
  is_free?: boolean;
  price?: LumaPrice;
  max_price?: LumaPrice;
  is_sold_out?: boolean;
  spots_remaining?: number | null;
  is_near_capacity?: boolean;
  require_approval?: boolean;
};

type LumaCoordinate = {
  latitude?: string | number;
  longitude?: string | number;
};

type LumaGeo = {
  mode?: string;
  city?: string;
  full_address?: string;
  address?: string;
  city_state?: string;
  sublocality?: string;
  latitude?: string | number;
  longitude?: string | number;
  place_coordinate?: LumaCoordinate;
};

type LumaEventCore = {
  api_id?: string;
  name?: string;
  start_at?: string;
  end_at?: string;
  timezone?: string;
  url?: string;
  cover_url?: string;
  geo_address_info?: LumaGeo;
  coordinate?: LumaCoordinate;
  waitlist_enabled?: boolean;
  waitlist_status?: string;
};

type LumaEntry = {
  event?: LumaEventCore;
  calendar?: { name?: string };
  hosts?: { name?: string }[];
  ticket_info?: LumaTicketInfo;
  registration_availability?: string;
  waitlist_active?: boolean;
  sold_out?: boolean;
  guest_count?: number;
};

type LumaResponse = {
  entries?: LumaEntry[];
  has_more?: boolean;
  next_cursor?: string;
};

type LumaRichTextNode = {
  type?: string;
  text?: string;
  content?: LumaRichTextNode[];
};

type LumaDescriptionDoc = {
  type?: string;
  content?: LumaRichTextNode[];
};

type LumaEventDetail = LumaEntry & {
  event?: LumaEventCore;
  description_mirror?: LumaDescriptionDoc | null;
};

/** TipTap / ProseMirror doc from Luma `event/get` → readable plain text. */
export function lumaDescriptionFromMirror(
  mirror: LumaDescriptionDoc | null | undefined,
): string | null {
  if (!mirror?.content?.length) return null;

  const blocks = mirror.content
    .map((node) => renderLumaBlock(node))
    .filter((block): block is string => Boolean(block?.trim()));

  const text = blocks.join("\n\n").trim();
  if (!text) return null;
  return text.length > 4000 ? text.slice(0, 4000) : text;
}

function renderLumaBlock(node: LumaRichTextNode): string | null {
  switch (node.type) {
    case "paragraph":
      return trimBlock(renderLumaInline(node.content));
    case "bullet_list":
      return renderLumaList(node.content, "•");
    case "ordered_list":
      return renderLumaList(node.content, null);
    case "horizontal_rule":
      return null;
    default:
      return trimBlock(renderLumaInline(node.content));
  }
}

function renderLumaList(
  items: LumaRichTextNode[] | undefined,
  marker: string | null,
): string | null {
  if (!items?.length) return null;

  const lines = items
    .map((item, index) => {
      const body = trimBlock(renderLumaInline(item.content));
      if (!body) return null;
      const prefix =
        marker === null ? `${index + 1}. ` : `${marker} `;
      return `${prefix}${body}`;
    })
    .filter((line): line is string => Boolean(line));

  return lines.length ? lines.join("\n") : null;
}

function renderLumaInline(nodes: LumaRichTextNode[] | undefined): string {
  if (!nodes?.length) return "";

  return nodes
    .map((node) => {
      if (node.type === "hard_break") return "\n";
      if (node.type === "text") return node.text ?? "";
      if (node.content?.length) return renderLumaInline(node.content);
      return "";
    })
    .join("");
}

function trimBlock(text: string): string | null {
  const trimmed = text.replace(/\n{3,}/g, "\n\n").trim();
  return trimmed || null;
}

function lumaDollars(price: LumaPrice): number | null {
  if (price == null) return null;
  if (typeof price === "number") return Math.round(price);
  if (typeof price === "object" && price.cents != null) {
    return Math.round(price.cents / 100);
  }
  return null;
}

/** Prefer a feed-sized CDN transform when Luma hosts the cover. */
export function lumaFeedImageUrl(coverUrl: string | null | undefined): string | null {
  if (!coverUrl) return null;
  if (coverUrl.includes("/cdn-cgi/image/")) return coverUrl;
  const marker = "images.lumacdn.com/";
  const idx = coverUrl.indexOf(marker);
  if (idx === -1) return coverUrl;
  const path = coverUrl.slice(idx + marker.length);
  return `https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=cover,dpr=2,quality=75,width=400,height=400/${path}`;
}

export function deriveLumaRegistrationStatus(opts: {
  registrationAvailability?: string | null;
  ticketInfo?: LumaTicketInfo | null;
  waitlistActive?: boolean | null;
  soldOut?: boolean | null;
}): RegistrationStatus {
  const avail = (opts.registrationAvailability ?? "").toLowerCase();
  if (avail === "sold-out" || avail === "sold_out") return "sold_out";
  if (avail === "waitlist") return "waitlist";
  if (opts.waitlistActive) return "waitlist";
  if (opts.soldOut || opts.ticketInfo?.is_sold_out) return "sold_out";
  if (opts.ticketInfo?.is_near_capacity) return "near_capacity";
  if (avail === "open" || avail === "available" || !avail) return "open";
  return "open";
}

function priceRange(ticket?: LumaTicketInfo | null): {
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
} {
  const isFree = ticket?.is_free ?? false;
  const min = lumaDollars(ticket?.price);
  const max = lumaDollars(ticket?.max_price) ?? min;
  if (isFree) return { isFree: true, priceMin: 0, priceMax: 0 };
  return { isFree: false, priceMin: min, priceMax: max };
}

function coordNum(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** City / neighborhood / coords from Luma geo (including obfuscated Atherton-style). */
export function lumaLocationFromEvent(ev: {
  geo_address_info?: LumaGeo;
  coordinate?: LumaCoordinate;
}): {
  city: string;
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
} {
  const geo = ev.geo_address_info;
  const cityLabel = geo?.city?.trim() || null;
  const city = cityKeyFromLabel(cityLabel);
  const sublocality = geo?.sublocality?.trim() || null;
  // For Peninsula/etc. with no neighborhood, surface the city name in the feed meta
  const neighborhood =
    sublocality || (city !== "sf" && cityLabel ? cityLabel : null);

  const place = geo?.place_coordinate;
  const pin = ev.coordinate;
  const lat =
    coordNum(pin?.latitude) ??
    coordNum(place?.latitude) ??
    coordNum(geo?.latitude);
  const lng =
    coordNum(pin?.longitude) ??
    coordNum(place?.longitude) ??
    coordNum(geo?.longitude);

  return {
    city,
    neighborhood,
    address: geo?.full_address ?? geo?.address ?? null,
    lat,
    lng,
  };
}

function entryToNormalized(
  entry: LumaEntry,
  checkedAt = new Date(),
  fallbackTimezone = "America/Los_Angeles",
): NormalizedEvent | null {
  const ev = entry.event;
  if (!ev?.name || !ev.start_at) return null;
  const startsAt = new Date(ev.start_at);
  if (startsAt.getTime() < Date.now() - 3600000) return null;

  const slug = ev.url ?? ev.api_id ?? contentHash([ev.name, ev.start_at]);
  const loc = lumaLocationFromEvent(ev);
  const { isFree, priceMin, priceMax } = priceRange(entry.ticket_info);
  const registrationStatus = deriveLumaRegistrationStatus({
    registrationAvailability: entry.registration_availability,
    ticketInfo: entry.ticket_info,
    waitlistActive: entry.waitlist_active,
    soldOut: entry.sold_out,
  });

  return {
    source: "luma",
    sourceEventId: String(ev.api_id ?? slug),
    title: ev.name,
    description: null,
    startsAt,
    endsAt: ev.end_at ? new Date(ev.end_at) : null,
    timezone: ev.timezone ?? fallbackTimezone,
    venueName: entry.calendar?.name ?? null,
    address: loc.address,
    neighborhood: loc.neighborhood,
    lat: loc.lat,
    lng: loc.lng,
    city: loc.city,
    priceMin,
    priceMax,
    isFree,
    categories: ["tech"],
    tags: ["luma"],
    url: `https://luma.com/${slug}`,
    imageUrl: lumaFeedImageUrl(ev.cover_url),
    organizer: entry.hosts?.[0]?.name ?? entry.calendar?.name ?? null,
    registrationStatus,
    registrationCheckedAt: checkedAt,
    rawPayload: entry,
  };
}

function createLumaAdapter(opts: {
  adapterId: string;
  description: string;
  placeId: string;
  fallbackTimezone: string;
}): SourceAdapter {
  return {
    id: opts.adapterId,
    description: opts.description,
    async fetch() {
      const events: NormalizedEvent[] = [];
      let cursor: string | undefined;
      const checkedAt = new Date();
      for (let page = 0; page < 6; page++) {
        const params = new URLSearchParams({
          discover_place_api_id: opts.placeId,
          pagination_limit: "50",
        });
        if (cursor) params.set("pagination_cursor", cursor);
        const data = await fetchJson<LumaResponse>(
          `https://api.lu.ma/discover/get-paginated-events?${params}`,
        );
        for (const entry of data.entries ?? []) {
          const normalized = entryToNormalized(
            entry,
            checkedAt,
            opts.fallbackTimezone,
          );
          if (normalized) events.push(normalized);
        }
        if (!data.has_more || !data.next_cursor) break;
        cursor = data.next_cursor;
      }
      return { events };
    },
  };
}

/**
 * Fresh registration + cover + geo for a single Luma event (detail-page refresh).
 * Uses `event/get` so we don't re-page the discover feed.
 */
export async function refreshLumaEvent(sourceEventId: string): Promise<{
  description: string | null;
  imageUrl: string | null;
  registrationStatus: RegistrationStatus;
  registrationCheckedAt: Date;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  city: string;
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
} | null> {
  const data = await fetchJson<LumaEventDetail>(
    `https://api.lu.ma/event/get?event_api_id=${encodeURIComponent(sourceEventId)}`,
  );
  if (!data.event?.api_id) return null;

  const checkedAt = new Date();
  const { isFree, priceMin, priceMax } = priceRange(data.ticket_info);
  const loc = lumaLocationFromEvent(data.event ?? {});
  return {
    description: lumaDescriptionFromMirror(data.description_mirror),
    imageUrl: lumaFeedImageUrl(data.event?.cover_url),
    registrationStatus: deriveLumaRegistrationStatus({
      registrationAvailability: data.registration_availability,
      ticketInfo: data.ticket_info,
      waitlistActive: data.waitlist_active,
      soldOut: data.sold_out,
    }),
    registrationCheckedAt: checkedAt,
    isFree,
    priceMin,
    priceMax,
    ...loc,
  };
}

export const lumaAdapter = createLumaAdapter({
  adapterId: "luma",
  description: "Luma public SF discover feed (covers + registration + city)",
  placeId: SF_PLACE_ID,
  fallbackTimezone: "America/Los_Angeles",
});

export const lumaChicagoAdapter = createLumaAdapter({
  adapterId: "luma_chi",
  description: "Luma public Chicago discover feed (covers + registration + city)",
  placeId: CHI_PLACE_ID,
  fallbackTimezone: "America/Chicago",
});

export const lumaLaAdapter = createLumaAdapter({
  adapterId: "luma_la",
  description: "Luma public Los Angeles discover feed (covers + registration + city)",
  placeId: LA_PLACE_ID,
  fallbackTimezone: "America/Los_Angeles",
});
