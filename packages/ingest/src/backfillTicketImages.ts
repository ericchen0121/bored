/**
 * One-time / ops backfill: pull flyers for existing 19hz rows missing imageUrl.
 *
 *   pnpm --filter @bored/ingest exec tsx src/backfillTicketImages.ts
 *   pnpm --filter @bored/ingest exec tsx src/cli.ts --backfill-ticket-images --limit=400 --browser-cap=80
 *
 * Safe to re-run; only updates rows that still lack an image.
 * Uses the same twin → plain → Chromium pipeline as 19hz ingest.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { db, events } from "@bored/db";
import { and, eq, gt, or, sql } from "drizzle-orm";
import {
  browserImageScrapeCap,
  isBrowserImageHost,
} from "./browserOgImage.js";
import { enrichEventsWithTicketImages } from "./ticketImageEnrich.js";

config({ path: resolve(process.cwd(), "../../.env") });
config();

function argValue(argv: string[], flag: string): string | undefined {
  const hit = argv.find((a) => a.startsWith(`${flag}=`));
  return hit?.slice(flag.length + 1);
}

export async function runBackfillTicketImages(
  argv: string[] = process.argv.slice(2),
): Promise<void> {
  const limit = Math.min(Number(argValue(argv, "--limit") ?? 500) || 500, 2000);
  const browserCap = Math.min(
    Number(argValue(argv, "--browser-cap") ?? browserImageScrapeCap()) ||
      browserImageScrapeCap(),
    200,
  );
  const noBrowser = argv.includes("--no-browser");
  const source = argValue(argv, "--source") ?? "19hz";

  const cutoff = new Date(Date.now() - 1 * 86400000);
  const rows = await db
    .select({
      id: events.id,
      title: events.title,
      url: events.url,
      imageUrl: events.imageUrl,
    })
    .from(events)
    .where(
      and(
        eq(events.source, source),
        gt(events.startsAt, cutoff),
        or(sql`${events.imageUrl} is null`, sql`btrim(${events.imageUrl}) = ''`),
      ),
    )
    .orderBy(events.startsAt)
    .limit(limit);

  console.log(
    `[backfill-ticket-images] source=${source} missing=${rows.length} browserCap=${browserCap} browser=${!noBrowser}`,
  );

  if (!rows.length) {
    console.log("Nothing to do.");
    return;
  }

  const browserEligible = rows.filter(
    (r) => r.url && isBrowserImageHost(r.url),
  ).length;
  console.log(`[backfill-ticket-images] browser-eligible≈${browserEligible}`);

  const targets = rows.map((r) => ({
    id: r.id,
    title: r.title,
    url: r.url,
    imageUrl: null as string | null,
  }));

  const stats = await enrichEventsWithTicketImages(targets, {
    browserCap,
    useBrowser: !noBrowser,
    plainCap: limit,
  });

  let updated = 0;
  for (const row of targets) {
    if (!row.imageUrl) continue;
    await db
      .update(events)
      .set({ imageUrl: row.imageUrl })
      .where(eq(events.id, row.id));
    updated++;
  }

  const [coverage] = await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE image_url IS NOT NULL AND btrim(image_url) <> '') AS with_img,
      count(*) FILTER (WHERE image_url IS NULL OR btrim(image_url) = '') AS no_img,
      count(*) AS total
    FROM events
    WHERE source = ${source}
      AND starts_at > now() - interval '1 day'
  `);

  console.log(
    JSON.stringify(
      {
        updated,
        ...stats,
        coverage,
      },
      null,
      2,
    ),
  );
}

const invokedDirectly = /backfillTicketImages\.(ts|js|mjs)$/.test(
  process.argv[1] ?? "",
);

if (invokedDirectly) {
  runBackfillTicketImages().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
