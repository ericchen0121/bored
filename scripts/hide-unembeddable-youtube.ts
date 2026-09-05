/**
 * Hide YouTube listings that can't be embedded (owner disabled playback on
 * other sites → "Video unavailable / Watch on YouTube" in our player).
 *
 * Usage:
 *   DATABASE_URL=... pnpm exec tsx scripts/hide-unembeddable-youtube.ts
 *   DATABASE_URL=... pnpm exec tsx scripts/hide-unembeddable-youtube.ts --apply
 */
import "dotenv/config";
import postgres from "postgres";

const APPLY = process.argv.includes("--apply");

async function oembedOk(videoId: string): Promise<boolean> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    `https://www.youtube.com/watch?v=${videoId}`,
  )}&format=json`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return res.ok;
  } catch {
    return false;
  }
}

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
      source_event_id: string;
      title: string;
      url: string | null;
      raw_payload: { videoId?: string } | null;
    }[]>`
      select id, source_event_id, title, url, raw_payload
      from events
      where source = 'youtube'
        and hidden = false
    `;

    console.log(`Checking ${rows.length} visible YouTube events…`);
    const badIds: string[] = [];
    for (const row of rows) {
      const videoId =
        (typeof row.raw_payload?.videoId === "string"
          ? row.raw_payload.videoId
          : null) ?? row.source_event_id;
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
        badIds.push(row.id);
        console.log(`  bad id ${row.id} ${row.title.slice(0, 50)}`);
        continue;
      }
      const ok = await oembedOk(videoId);
      if (!ok) {
        badIds.push(row.id);
        console.log(`  unembeddable ${videoId} ${row.title.slice(0, 50)}`);
      }
    }

    console.log(`Found ${badIds.length} to hide`);
    if (!APPLY) {
      console.log("Dry run — pass --apply to hide");
      return;
    }
    if (!badIds.length) return;

    const updated = await sql`
      update events
      set hidden = true
      where id in ${sql(badIds)}
      returning id
    `;
    console.log(`Hidden ${updated.length} events`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
