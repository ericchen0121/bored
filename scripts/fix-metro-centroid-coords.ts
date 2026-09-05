/**
 * Re-resolve lat/lng for events stuck on feed-metro centroids (SF/LA/CHI downtown)
 * when venue/address/neighborhood names a more specific locality.
 *
 * Usage:
 *   pnpm exec tsx scripts/fix-metro-centroid-coords.ts
 *   pnpm exec tsx scripts/fix-metro-centroid-coords.ts --apply
 */
import "dotenv/config";
import { CHI_DEFAULT, LA_DEFAULT, resolveEventCoords, SF_DEFAULT } from "@bored/shared";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

const CENTROIDS = [
  { lat: SF_DEFAULT.lat, lng: SF_DEFAULT.lng, label: "sf" },
  { lat: LA_DEFAULT.lat, lng: LA_DEFAULT.lng, label: "la" },
  { lat: CHI_DEFAULT.lat, lng: CHI_DEFAULT.lng, label: "chicago" },
] as const;

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
      venue_name: string | null;
      address: string | null;
      neighborhood: string | null;
      city: string | null;
      lat: number | null;
      lng: number | null;
      source: string;
    }>`
      SELECT id, title, venue_name, address, neighborhood, city, lat, lng, source
      FROM events
      WHERE coalesce(hidden, false) = false
        AND lat IS NOT NULL
        AND lng IS NOT NULL
        AND (
          (abs(lat - ${SF_DEFAULT.lat}) < 0.0001 AND abs(lng - ${SF_DEFAULT.lng}) < 0.0001)
          OR (abs(lat - ${LA_DEFAULT.lat}) < 0.0001 AND abs(lng - ${LA_DEFAULT.lng}) < 0.0001)
          OR (abs(lat - ${CHI_DEFAULT.lat}) < 0.0001 AND abs(lng - ${CHI_DEFAULT.lng}) < 0.0001)
        )
    `;

    const updates: Array<{
      id: string;
      title: string;
      source: string;
      from: string;
      to: string;
      lat: number;
      lng: number;
    }> = [];

    for (const row of rows) {
      const resolved = resolveEventCoords({
        lat: row.lat,
        lng: row.lng,
        venueName: row.venue_name,
        title: row.title,
        address: row.address,
        city: row.city,
        neighborhood: row.neighborhood,
      });
      if (resolved.lat == null || resolved.lng == null) continue;
      if (
        Math.abs(resolved.lat - (row.lat ?? 0)) < 1e-4 &&
        Math.abs(resolved.lng - (row.lng ?? 0)) < 1e-4
      ) {
        continue;
      }
      const from =
        CENTROIDS.find(
          (c) =>
            Math.abs(c.lat - (row.lat ?? 0)) < 1e-4 &&
            Math.abs(c.lng - (row.lng ?? 0)) < 1e-4,
        )?.label ?? "metro";
      updates.push({
        id: row.id,
        title: row.title,
        source: row.source,
        from,
        to: resolved.geoSource ?? "inferred",
        lat: resolved.lat,
        lng: resolved.lng,
      });
    }

    console.log(
      `${APPLY ? "Applying" : "Dry-run"}: ${updates.length} / ${rows.length} metro-centroid rows can be refined`,
    );
    for (const u of updates.slice(0, 40)) {
      console.log(
        `  [${u.source}] ${u.from} → ${u.to}  ${u.title.slice(0, 72)}`,
      );
    }
    if (updates.length > 40) console.log(`  … +${updates.length - 40} more`);

    if (APPLY && updates.length) {
      for (const u of updates) {
        await sql`
          UPDATE events
          SET lat = ${u.lat}, lng = ${u.lng}
          WHERE id = ${u.id}::uuid
        `;
      }
      console.log(`Updated ${updates.length} events`);
    } else if (!APPLY) {
      console.log("Re-run with --apply to write.");
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
