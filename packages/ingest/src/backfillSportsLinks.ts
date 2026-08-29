/**
 * Backfill `rawPayload.teams` + TM attraction externalLinks for existing
 * sports Ticketmaster rows (homepage / Instagram / wiki).
 *
 *   pnpm --filter @bored/ingest exec tsx src/cli.ts --backfill-sports-links
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { and, eq, sql } from "drizzle-orm";
import { db, events } from "@bored/db";
import { fetchJson } from "./types.js";
import {
  createAttractionLinkCache,
} from "./tmAttractionLinks.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

type TmEventLite = {
  id?: string;
  _embedded?: {
    attractions?: { id?: string; name?: string }[];
  };
};

function isSportsTags(tags: unknown): boolean {
  return (
    Array.isArray(tags) &&
    tags.some((t) => typeof t === "string" && t.toLowerCase() === "sports")
  );
}

export async function runBackfillSportsLinks(argv: string[] = []): Promise<void> {
  const key = process.env.TICKETMASTER_API_KEY;
  if (!key) {
    throw new Error("TICKETMASTER_API_KEY missing");
  }

  const limitArg = argv.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const limit = Math.min(
    Math.max(Number(limitArg) || 200, 1),
    1000,
  );

  const rows = await db
    .select({
      id: events.id,
      sourceEventId: events.sourceEventId,
      title: events.title,
      tags: events.tags,
      rawPayload: events.rawPayload,
    })
    .from(events)
    .where(
      and(
        eq(events.source, "ticketmaster"),
        sql`${events.tags} @> '["sports"]'::jsonb`,
      ),
    )
    .limit(limit);

  const cache = createAttractionLinkCache(key);
  let updated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!isSportsTags(row.tags)) {
      skipped++;
      continue;
    }

    let attractions: { id?: string; name?: string }[] = [];
    const payload =
      row.rawPayload && typeof row.rawPayload === "object"
        ? ({ ...(row.rawPayload as Record<string, unknown>) } as Record<
            string,
            unknown
          >)
        : {};

    const existingTeams = Array.isArray(payload.teams) ? payload.teams : [];
    const hasLinks = existingTeams.some(
      (t) =>
        t &&
        typeof t === "object" &&
        (typeof (t as { homepageUrl?: unknown }).homepageUrl === "string" ||
          typeof (t as { instagramUrl?: unknown }).instagramUrl === "string"),
    );
    if (hasLinks && !argv.includes("--force")) {
      skipped++;
      continue;
    }

    if (
      existingTeams.length &&
      existingTeams.every(
        (t) =>
          t &&
          typeof t === "object" &&
          typeof (t as { attractionId?: unknown }).attractionId === "string",
      )
    ) {
      attractions = existingTeams.map((t) => {
        const r = t as { name?: string; attractionId?: string };
        return { id: r.attractionId, name: r.name };
      });
    } else {
      try {
        const ev = await fetchJson<TmEventLite>(
          `https://app.ticketmaster.com/discovery/v2/events/${encodeURIComponent(row.sourceEventId)}.json?apikey=${encodeURIComponent(key)}`,
        );
        attractions = ev._embedded?.attractions ?? [];
      } catch (err) {
        console.warn(
          `[backfill-sports-links] event ${row.sourceEventId} fetch failed:`,
          err instanceof Error ? err.message : err,
        );
        skipped++;
        continue;
      }
    }

    const teams = [];
    for (const a of attractions.slice(0, 8)) {
      const name = a.name?.trim();
      const attractionId = a.id?.trim();
      if (!name) continue;
      if (!attractionId) {
        teams.push({
          name,
          attractionId: null,
          homepageUrl: null,
          instagramUrl: null,
          wikiUrl: null,
        });
        continue;
      }
      teams.push(await cache.resolveTeam(name, attractionId));
    }

    if (!teams.length) {
      skipped++;
      continue;
    }

    await db
      .update(events)
      .set({
        rawPayload: {
          ...payload,
          artists: teams.map((t) => t.name),
          teams,
        },
      })
      .where(eq(events.id, row.id));

    updated++;
    console.log(
      `[backfill-sports-links] ${row.title.slice(0, 60)} → ${teams
        .map((t) => `${t.name}${t.homepageUrl ? "*" : ""}`)
        .join(", ")}`,
    );
  }

  console.log(
    `[backfill-sports-links] updated=${updated} skipped=${skipped} scanned=${rows.length}`,
  );
}
