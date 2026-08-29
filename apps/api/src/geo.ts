import {
  defaultAreaForCity,
  feedAreaForCoords,
  nearestFeedCity,
  type FeedArea,
  type FeedCity,
} from "@bored/shared";
import type { Context } from "hono";

export type GeoResult = {
  city: FeedCity;
  area: FeedArea;
  lat: number | null;
  lng: number | null;
  source: "coords" | "ip" | "default";
};

function isPrivateIp(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0") return true;
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) {
    return true;
  }
  const m = /^172\.(\d+)\./.exec(ip);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80")) {
    return true;
  }
  return false;
}

export function clientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-real-ip") ??
    c.req.header("x-client-ip") ??
    null
  );
}

async function coordsFromIp(
  ip: string,
): Promise<{ lat: number; lng: number } | null> {
  if (isPrivateIp(ip)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);
  try {
    // HTTPS JSON endpoint; free tier is fine for cold-start city pick.
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      latitude?: number;
      longitude?: number;
      error?: boolean;
    };
    if (body.error || body.latitude == null || body.longitude == null) {
      return null;
    }
    return { lat: body.latitude, lng: body.longitude };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function parseCoord(raw: string | undefined): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function resolveGeo(c: Context): Promise<GeoResult> {
  const lat = parseCoord(c.req.query("lat"));
  const lng = parseCoord(c.req.query("lng"));
  if (lat != null && lng != null) {
    const city = nearestFeedCity(lat, lng);
    return {
      city,
      area: defaultAreaForCity(city),
      lat,
      lng,
      source: "coords",
    };
  }

  const ip = clientIp(c);
  if (ip) {
    const coords = await coordsFromIp(ip);
    if (coords) {
      return {
        city: nearestFeedCity(coords.lat, coords.lng),
        area: feedAreaForCoords(coords.lat, coords.lng),
        lat: coords.lat,
        lng: coords.lng,
        source: "ip",
      };
    }
  }

  return {
    city: "sf",
    area: defaultAreaForCity("sf"),
    lat: null,
    lng: null,
    source: "default",
  };
}
