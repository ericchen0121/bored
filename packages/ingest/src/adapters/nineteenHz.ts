import * as cheerio from "cheerio";
import { db, events as eventsTable } from "@bored/db";
import {
  enrichCategoriesWithTags,
  extractRaEventId,
  parseLineupArtists,
} from "@bored/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  contentHash,
  fetchText,
  parsePrice,
  type NormalizedEvent,
  type SourceAdapter,
} from "../types.js";

type NineteenHzRegion = {
  /** Ingest run id (unique per listing page) */
  adapterId: string;
  description: string;
  listingUrl: string;
  /** UTC hour offset used when parsing wall-clock times (PDT≈7, CDT≈5) */
  utcOffsetHours: number;
  timezone: string;
  inferCity: (venue: string) => string;
};

function createNineteenHzAdapter(region: NineteenHzRegion): SourceAdapter {
  return {
    id: region.adapterId,
    description: region.description,
    async fetch() {
      const html = await fetchText(region.listingUrl);
      const $ = cheerio.load(html);
      const events: NormalizedEvent[] = [];
      const year = new Date().getFullYear();

      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 3) return;

        const dateText = $(cells[0]).text().replace(/\s+/g, " ").trim();
        const titleCell = $(cells[1]);
        const titleText = titleCell.text().replace(/\s+/g, " ").trim();
        if (!dateText || !titleText || /date\/time/i.test(dateText)) return;

        const tags = $(cells[2]).text().replace(/\s+/g, " ").trim();
        const priceText = cells.length > 3 ? $(cells[3]).text().trim() : "";
        const age = cells.length > 4 ? $(cells[4]).text().trim() : null;
        const organizers = cells.length > 5 ? $(cells[5]).text().trim() : null;
        const link =
          titleCell.find("a").attr("href") ??
          $(cells[cells.length - 1])
            .find("a")
            .attr("href") ??
          null;

        const atIdx = titleText.lastIndexOf(" @ ");
        const title = atIdx > 0 ? titleText.slice(0, atIdx).trim() : titleText;
        const venueName = atIdx > 0 ? titleText.slice(atIdx + 3).trim() : null;

        const startsAt = parse19hzDate(
          dateText,
          year,
          region.utcOffsetHours,
        );
        if (!startsAt || Number.isNaN(startsAt.getTime())) return;

        const { priceMin, priceMax, isFree } = parsePrice(priceText);
        const sourceEventId = contentHash([
          region.adapterId,
          dateText,
          title,
          venueName ?? "",
          tags,
        ]);

        const tagList = tags
          .split(/[,/|]/)
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 12);

        const artists = parseLineupArtists(title);

        events.push({
          // Shared provenance chip across metros; city/area filter scopes the feed.
          source: "19hz",
          sourceEventId,
          title,
          description: tags || null,
          startsAt,
          timezone: region.timezone,
          venueName,
          city: region.inferCity(venueName ?? ""),
          priceMin,
          priceMax,
          isFree,
          categories: enrichCategoriesWithTags(
            ["music.electronic", "nightlife"],
            tagList,
          ),
          tags: tagList,
          ageRestriction: age ? age.slice(0, 80) : null,
          url: link
            ? link.startsWith("http")
              ? link
              : `https://19hz.info/${link}`
            : region.listingUrl,
          organizer: organizers || null,
          rawPayload: {
            dateText,
            titleText,
            tags,
            priceText,
            listing: region.adapterId,
            artists: artists.length ? artists : undefined,
          },
        });
      });

      return finalizeNineteenHzEvents(events);
    },
  };
}

/** Skip 19hz rows that duplicate an existing RA listing (shared ra.co URL). */
async function finalizeNineteenHzEvents(parsed: NormalizedEvent[]) {
  const raIds = [
    ...new Set(
      parsed
        .map((ev) => extractRaEventId(ev.url))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (!raIds.length) {
    return { events: parsed.slice(0, 200) };
  }

  const existing = await db
    .select({ sourceEventId: eventsTable.sourceEventId })
    .from(eventsTable)
    .where(
      and(eq(eventsTable.source, "ra"), inArray(eventsTable.sourceEventId, raIds)),
    );

  const existingRa = new Set(existing.map((row) => row.sourceEventId));
  const kept: NormalizedEvent[] = [];
  const dropIds: string[] = [];

  for (const ev of parsed) {
    const raId = extractRaEventId(ev.url);
    if (raId && existingRa.has(raId)) {
      dropIds.push(ev.sourceEventId);
      continue;
    }
    kept.push(ev);
  }

  return {
    events: kept.slice(0, 200),
    deleteSourceEventIds: dropIds.length
      ? [{ source: "19hz", ids: dropIds }]
      : undefined,
  };
}

function inferBayCity(venue: string): string {
  const v = venue.toLowerCase();
  if (v.includes("oakland")) return "oakland";
  if (v.includes("berkeley")) return "berkeley";
  if (v.includes("san jose") || v.includes("sj ")) return "san_jose";
  return "sf";
}

function inferChicagoCity(venue: string): string {
  const v = venue.toLowerCase();
  if (v.includes("evanston")) return "evanston";
  if (v.includes("oak park")) return "oak_park";
  if (v.includes("naperville")) return "naperville";
  if (v.includes("schaumburg")) return "schaumburg";
  return "chicago";
}

function parse19hzDate(
  text: string,
  year: number,
  utcOffsetHours: number,
): Date | null {
  // Examples: "Aug 24 (Sun) 9pm-2am", "Aug 24 10pm", "Tue: Aug 25"
  const m = text.match(
    /([A-Za-z]{3})\s+(\d{1,2}).*?(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i,
  );
  if (!m) return null;
  const months: Record<string, number> = {
    jan: 0,
    feb: 1,
    mar: 2,
    apr: 3,
    may: 4,
    jun: 5,
    jul: 6,
    aug: 7,
    sep: 8,
    oct: 9,
    nov: 10,
    dec: 11,
  };
  const month = months[m[1]!.toLowerCase().slice(0, 3)];
  if (month == null) return null;
  let hour = Number(m[3]);
  const minute = m[4] ? Number(m[4]) : 0;
  const ap = m[5]!.toLowerCase();
  if (ap === "pm" && hour < 12) hour += 12;
  if (ap === "am" && hour === 12) hour = 0;

  const d = new Date(
    Date.UTC(year, month, Number(m[2]), hour + utcOffsetHours, minute),
  );
  const now = new Date();
  if (d.getTime() < now.getTime() - 2 * 86400000) {
    d.setUTCFullYear(year + 1);
  }
  return d;
}

/** Scrape 19hz Bay Area electronic music listings. */
export const nineteenHzAdapter = createNineteenHzAdapter({
  adapterId: "19hz",
  description: "19hz.info Bay Area electronic music events",
  listingUrl: "https://19hz.info/eventlisting_BayArea.php",
  utcOffsetHours: 7,
  timezone: "America/Los_Angeles",
  inferCity: inferBayCity,
});

/** Scrape 19hz Chicago electronic music listings. */
export const nineteenHzChicagoAdapter = createNineteenHzAdapter({
  adapterId: "19hz_chi",
  description: "19hz.info Chicago electronic music events",
  listingUrl: "https://19hz.info/eventlisting_CHI.php",
  utcOffsetHours: 5,
  timezone: "America/Chicago",
  inferCity: inferChicagoCity,
});
