/**
 * Retag Funcheap / 19hz events wrongly stored as city=sf when title/venue
 * clearly names another Bay Area city (e.g. Funcheap "… (Redwood City)").
 *
 * Usage:
 *   pnpm exec tsx scripts/retag-bay-cities-from-title.ts
 *   pnpm exec tsx scripts/retag-bay-cities-from-title.ts --apply
 */
import "dotenv/config";
import { inferBayCityFromText } from "@bored/shared";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");
/** Sources that historically defaulted unknown venues to sf. */
const SOURCES = ["funcheap", "19hz"] as const;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL required");
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    const rows = await sql<{
      id: string;
      title: string;
      city: string | null;
      neighborhood: string | null;
      venue_name: string | null;
      source: string;
    }>`
      SELECT id, title, city, neighborhood, venue_name, source
      FROM events
      WHERE coalesce(city, 'sf') IN ('sf', 'san_francisco', 'san francisco')
        AND coalesce(hidden, false) = false
        AND source IN ${sql(SOURCES)}
    `;

    const updates: Array<{
      id: string;
      title: string;
      source: string;
      from: string;
      to: string;
    }> = [];

    for (const row of rows) {
      // Funcheap: city is usually in the title. 19hz: prefer venue.
      const text =
        row.source === "19hz"
          ? [row.venue_name, row.title, row.neighborhood]
              .filter(Boolean)
              .join(" ")
          : [row.title, row.venue_name, row.neighborhood]
              .filter(Boolean)
              .join(" ");
      const inferred = inferBayCityFromText(text, "sf");
      if (inferred === "sf" || inferred === "san_francisco") continue;
      updates.push({
        id: row.id,
        title: row.title,
        source: row.source,
        from: row.city ?? "sf",
        to: inferred,
      });
    }

    console.log(
      `${APPLY ? "Applying" : "Dry-run"}: ${updates.length} event(s) to retag`,
    );
    for (const u of updates.slice(0, 40)) {
      console.log(`  [${u.source}] ${u.from} → ${u.to}: ${u.title}`);
    }
    if (updates.length > 40) {
      console.log(`  … and ${updates.length - 40} more`);
    }

    if (APPLY && updates.length) {
      for (const u of updates) {
        await sql`UPDATE events SET city = ${u.to} WHERE id = ${u.id}`;
      }
      console.log(`Updated ${updates.length} rows`);
    } else if (!APPLY) {
      console.log("Re-run with --apply to write changes");
    }
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
