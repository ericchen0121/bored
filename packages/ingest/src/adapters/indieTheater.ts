import * as cheerio from "cheerio";
import { decodeHtmlEntities } from "@bored/shared";
import { enrichFilm } from "../enrichFilm.js";
import {
  contentHash,
  fetchText,
  type NormalizedShowtimeBatch,
  type SourceAdapter,
} from "../types.js";

/** Phase 2: indie / specialty cinema calendars when TMS is thin. */
const THEATERS = [
  {
    id: "roxie",
    name: "Roxie Theater",
    url: "https://www.roxie.com/calendar/",
    neighborhood: "Mission",
    address: "3117 16th St, San Francisco, CA 94103",
    lat: 37.7647,
    lng: -122.4225,
    parse: parseRoxieCalendar,
  },
] as const;

/**
 * Keep showtimes inside a short horizon so one theater cannot dominate the feed.
 * Feed windows still filter further (tonight / weekend / for_you).
 */
const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;

export const indieTheaterAdapter: SourceAdapter = {
  id: "indie_theater",
  description: "Roxie calendar film strips → showtimes + posters",
  async fetch() {
    const batches: NormalizedShowtimeBatch[] = [];

    for (const theater of THEATERS) {
      try {
        const html = await fetchText(theater.url);
        batches.push(...(await theater.parse(html, theater)));
      } catch (err) {
        console.warn(`[indie_theater] ${theater.id}`, (err as Error).message);
      }
    }

    return { showtimes: batches };
  },
};

type TheaterMeta = {
  id: string;
  name: string;
  url: string;
  neighborhood: string;
  address: string;
  lat: number;
  lng: number;
};

type ParsedShow = {
  title: string;
  startsAt: Date;
  url: string;
  posterUrl: string | null;
  synopsis: string | null;
  showtimeId: string;
  timeText: string;
};

/**
 * Roxie day strips: `#day-YYYY-MM-DD` → `.film-strip` (thumb + title + showtimes).
 * Prefer this over the full-month grid — it has posters and only upcoming days.
 */
async function parseRoxieCalendar(
  html: string,
  theater: TheaterMeta,
): Promise<NormalizedShowtimeBatch[]> {
  const $ = cheerio.load(html);
  const now = Date.now();
  const horizon = now + HORIZON_MS;
  const byFilm = new Map<string, ParsedShow[]>();

  $("[id^=day-]").each((_, dayEl) => {
    const dayId = $(dayEl).attr("id") ?? "";
    const ymd = dayId.match(/^day-(\d{4})-(\d{2})-(\d{2})$/);
    if (!ymd) return;
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);

    $(dayEl)
      .find(".film-strip")
      .each((__, stripEl) => {
        const title = $(stripEl)
          .find(".film-strip__title a, .film-strip__title")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (!title || title.length < 2) return;

        const href =
          $(stripEl).find("a[href*='/film/']").first().attr("href") ??
          theater.url;
        const url = absoluteUrl(href, theater.url);
        const posterUrl = filmStripPoster($, stripEl);
        const synopsis =
          $(stripEl)
            .find(".film-strip__description")
            .first()
            .text()
            .replace(/\s+/g, " ")
            .trim() || null;

        const timeNodes = $(stripEl).find(".film-strip__showtimes a");
        const times =
          timeNodes.length > 0
            ? timeNodes.toArray()
            : $(stripEl).find(".film-showtime").toArray();

        for (const timeEl of times) {
          const timeText = $(timeEl).text().replace(/\s+/g, " ").trim();
          const startsAt = parseLaWallTime(year, month, day, timeText);
          if (!startsAt) continue;
          const t = startsAt.getTime();
          if (t < now - 60 * 60 * 1000 || t > horizon) continue;

          const showtimeId =
            $(timeEl).attr("id")?.trim() ||
            contentHash([theater.id, title, startsAt.toISOString()]);

          const key = url.includes("/film/")
            ? url.replace(/#.*$/, "").replace(/\/$/, "")
            : title.toLowerCase();
          const list = byFilm.get(key) ?? [];
          list.push({
            title,
            startsAt,
            url,
            posterUrl,
            synopsis,
            showtimeId,
            timeText,
          });
          byFilm.set(key, list);
        }
      });
  });

  const batches: NormalizedShowtimeBatch[] = [];
  for (const shows of byFilm.values()) {
    if (!shows.length) continue;
    const first = shows[0]!;
    const cleanTitle = decodeEntities(first.title);
    const enriched = await enrichFilm(cleanTitle);

    batches.push({
      source: "indie_theater",
      film: {
        title: cleanTitle,
        synopsis: first.synopsis,
        tmdbId: enriched.tmdbId,
        imdbId: enriched.imdbId,
        // Prefer Letterboxd/RT poster; fall back to venue still.
        posterUrl: enriched.posterUrl ?? first.posterUrl,
        backdropUrl: enriched.backdropUrl,
        trailerYoutubeId: enriched.trailerYoutubeId,
        genres: enriched.genres.length
          ? enriched.genres
          : ["Indie", "Arthouse"],
        ratings: enriched.ratings,
        letterboxdUrl: enriched.letterboxdUrl,
        rtUrl: enriched.rtUrl,
        rtConsensus: enriched.rtConsensus,
        reviews: enriched.reviews,
      },
      theater: {
        name: theater.name,
        chain: theater.id,
        neighborhood: theater.neighborhood,
        lat: theater.lat,
        lng: theater.lng,
        sourceTheatreId: theater.id,
        address: theater.address,
      },
      showtimes: dedupeShows(shows).map((s) => ({
        startsAt: s.startsAt,
        format: "Standard",
        ticketUrl: s.url.includes("#") ? s.url : `${s.url.replace(/\/$/, "")}/#showtimes`,
        sourceShowtimeId: s.showtimeId.startsWith("showtime-")
          ? `${theater.id}-${s.showtimeId}`
          : contentHash([theater.id, cleanTitle, s.startsAt.toISOString()]),
      })),
    });
  }

  return batches;
}

function dedupeShows(shows: ParsedShow[]): ParsedShow[] {
  const seen = new Set<string>();
  const out: ParsedShow[] = [];
  for (const s of shows.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
    const k = s.startsAt.toISOString();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function filmStripPoster($: cheerio.CheerioAPI, stripEl: unknown): string | null {
  const img = $(stripEl as never)
    .find(".film-strip__thumb img, img.attachment-film-thumb")
    .first();
  if (!img.length) return null;
  const candidates = [
    img.attr("data-src"),
    img.attr("src"),
    bestFromSrcset(img.attr("data-srcset") ?? img.attr("srcset")),
  ].filter((u): u is string => {
    if (!u) return false;
    return /^https?:\/\//.test(u) && !u.includes("data:image");
  });
  return candidates[0] ?? null;
}

function bestFromSrcset(srcset: string | undefined): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const m = part.trim().match(/^(https?:\/\/\S+)\s+(\d+)w$/);
    if (!m) continue;
    const w = Number(m[2]);
    // Prefer ~500–800w for feed thumbs
    if (!best || (w >= 300 && w <= 800 && w > best.w) || (best.w < 300 && w > best.w)) {
      best = { url: m[1]!, w };
    }
  }
  return best?.url ?? null;
}

/** Parse "1:15 pm" / "6:00 pm" / "8:40 pm *" as America/Los_Angeles → UTC Date. */
function parseLaWallTime(
  year: number,
  month: number,
  day: number,
  timeText: string,
): Date | null {
  const m = timeText
    .replace(/\s+/g, " ")
    .trim()
    .match(/^(\d{1,2}):(\d{2})\s*(am|pm)\b/i);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = Number(m[2]);
  const ampm = m[3]!.toLowerCase();
  if (hour < 1 || hour > 12 || minute > 59) return null;
  if (ampm === "pm" && hour !== 12) hour += 12;
  if (ampm === "am" && hour === 12) hour = 0;

  return fromZonedTime(year, month, day, hour, minute, "America/Los_Angeles");
}

/** Convert a wall-clock time in `timeZone` to a UTC Date. */
function fromZonedTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(
    dtf
      .formatToParts(new Date(utcGuess))
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return new Date(utcGuess + (utcGuess - asUtc));
}

function absoluteUrl(href: string, base: string): string {
  if (!href) return base;
  try {
    return new URL(href, base).toString().replace(/#.*$/, "").replace(/\/+$/, "/");
  } catch {
    return base;
  }
}

function decodeEntities(text: string): string {
  return decodeHtmlEntities(text);
}
