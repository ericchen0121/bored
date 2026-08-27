import { cityKeyFromLabel } from "@bored/shared";
import {
  contentHash,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type PartifulMapsInfo = {
  name?: string;
  addressLines?: string[];
  approximateLocation?: string;
  googleMapsUrl?: string;
};

type PartifulLocationInfo = {
  neighborhood?: string | null;
  mapsInfo?: PartifulMapsInfo;
  displayAddressLines?: string[];
};

type PartifulImage = {
  source?: string;
  type?: string;
  url?: string;
  upload?: { path?: string; url?: string };
  gif?: { images?: { original?: { url?: string }; fixed_width?: { url?: string } } };
};

type PartifulEvent = {
  id?: string;
  title?: string;
  description?: string | null;
  startDate?: string;
  endDate?: string | null;
  timezone?: string;
  image?: PartifulImage | null;
  location?: string | null;
  locationInfo?: PartifulLocationInfo | null;
  hostName?: string | null;
  isPublic?: boolean;
  status?: string;
};

const EXPLORE_URLS = ["https://partiful.com/explore/sf"] as const;

/** Feed-sized cover via Partiful's imgix when we have a storage path. */
export function partifulFeedImageUrl(image: PartifulImage | null | undefined): string | null {
  if (!image) return null;
  const path = image.upload?.path?.replace(/^\//, "");
  if (path) {
    return `https://partiful.imgix.net/${path}?w=400&h=400&fit=crop&auto=format`;
  }
  const raw =
    image.url ||
    image.upload?.url ||
    image.gif?.images?.fixed_width?.url ||
    image.gif?.images?.original?.url ||
    null;
  return raw || null;
}

function parseApproxCity(approx?: string | null): string {
  if (!approx) return "sf";
  // "San Francisco, CA" / "Oakland, CA" → city label before comma
  const city = approx.split(",")[0]?.trim() || approx;
  return cityKeyFromLabel(city);
}

function venueFrom(ev: PartifulEvent): {
  venueName: string | null;
  address: string | null;
  neighborhood: string | null;
  city: string;
} {
  const maps = ev.locationInfo?.mapsInfo;
  const lines = maps?.addressLines ?? ev.locationInfo?.displayAddressLines ?? [];
  const address =
    lines.length > 0
      ? lines.join(", ")
      : typeof ev.location === "string"
        ? ev.location
        : null;
  return {
    venueName: maps?.name ?? null,
    address,
    neighborhood: ev.locationInfo?.neighborhood ?? null,
    city: parseApproxCity(maps?.approximateLocation),
  };
}

function toNormalized(ev: PartifulEvent): NormalizedEvent | null {
  const title = ev.title?.trim();
  const start = ev.startDate;
  if (!title || !start) return null;
  if (ev.status && ev.status !== "PUBLISHED") return null;
  if (ev.isPublic === false) return null;

  const startsAt = new Date(start);
  if (Number.isNaN(startsAt.getTime())) return null;
  // Drop events that ended more than a day ago
  const endRaw = ev.endDate ? new Date(ev.endDate) : null;
  const endsAt =
    endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null;
  if ((endsAt ?? startsAt).getTime() < Date.now() - 86400000) return null;

  const id = String(ev.id ?? contentHash([title, start]));
  const place = venueFrom(ev);

  return {
    source: "partiful",
    sourceEventId: id,
    title,
    description: ev.description ?? null,
    startsAt,
    endsAt,
    timezone: ev.timezone || "America/Los_Angeles",
    venueName: place.venueName,
    address: place.address,
    neighborhood: place.neighborhood,
    city: place.city,
    isFree: false,
    categories: ["nightlife"],
    tags: ["partiful", "party"],
    url: `https://partiful.com/e/${id}`,
    imageUrl: partifulFeedImageUrl(ev.image),
    organizer: ev.hostName ?? null,
    rawPayload: ev,
  };
}

function collectPartifulEvents(node: unknown, out: PartifulEvent[] = []): PartifulEvent[] {
  if (!node || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    for (const item of node) collectPartifulEvents(item, out);
    return out;
  }
  const obj = node as Record<string, unknown>;
  // Prefer nested `.event` wrappers from feed/section items
  if (obj.event && typeof obj.event === "object") {
    collectPartifulEvents(obj.event, out);
  }
  const title = obj.title;
  const startDate = obj.startDate;
  const id = obj.id;
  if (
    typeof title === "string" &&
    typeof startDate === "string" &&
    (typeof id === "string" || typeof id === "number")
  ) {
    out.push(obj as PartifulEvent);
  }
  for (const [k, v] of Object.entries(obj)) {
    if (k === "event") continue;
    collectPartifulEvents(v, out);
  }
  return out;
}

async function fetchExplore(url: string): Promise<NormalizedEvent[]> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "BoredSFBot/0.1 (+https://github.com/bored)",
      Accept: "text/html",
    },
  });
  if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
  const html = await res.text();
  const match = html.match(
    /<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s,
  );
  if (!match?.[1]) return [];
  const data = JSON.parse(match[1]) as unknown;
  const found = collectPartifulEvents(data);
  const out: NormalizedEvent[] = [];
  const seen = new Set<string>();
  for (const raw of found) {
    const ev = toNormalized(raw);
    if (!ev || seen.has(ev.sourceEventId)) continue;
    seen.add(ev.sourceEventId);
    out.push(ev);
  }
  return out;
}

/** Partiful public explore (SF) via Next.js SSR payload — covers + end times. */
export const partifulAdapter: SourceAdapter = {
  id: "partiful",
  description: "Partiful SF public explore parties",
  async fetch() {
    const events: NormalizedEvent[] = [];
    for (const url of EXPLORE_URLS) {
      try {
        events.push(...(await fetchExplore(url)));
      } catch (err) {
        console.warn(`[partiful] ${url} failed:`, (err as Error).message);
      }
    }
    events.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return { events: events.slice(0, 120) };
  },
};
