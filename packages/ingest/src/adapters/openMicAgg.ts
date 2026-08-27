import * as cheerio from "cheerio";
import { db, recurringShows } from "@bored/db";
import { eq, sql } from "drizzle-orm";
import { fetchText, type SourceAdapter } from "../types.js";

/** Hard cap on inactive open-mic proposals awaiting approval. */
export const MAX_INACTIVE_OPENMIC_PROPOSALS = 40;
/** New inactive rows allowed per ingest run. */
export const MAX_OPENMIC_PROPOSALS_PER_RUN = 8;

/**
 * Phase 2: scrape open-mic aggregator pages and propose recurring_shows rows.
 * New rooms are inserted as inactive for human approval (active=false).
 * Caps + venue/weekday dedupe keep the inactive queue from growing forever.
 */
export const openMicAggAdapter: SourceAdapter = {
  id: "openmic_agg",
  description: "Propose SF open mics from SFstandup / OpenMicX style pages",
  async fetch() {
    const proposals: {
      name: string;
      venueName: string;
      weekday: number | null;
      sourceUrl: string;
    }[] = [];

    try {
      const html = await fetchText("https://www.sfstandup.com/stagetime/");
      const $ = cheerio.load(html);
      $("table tr, li, p").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (!/open mic|comedy|showcase/i.test(text)) return;
        if (text.length < 12 || text.length > 200) return;
        const weekday = detectWeekday(text);
        const venueMatch = text.match(/at\s+([A-Z][^,\-|]{2,40})/);
        proposals.push({
          name: text.slice(0, 80),
          venueName: venueMatch?.[1]?.trim() ?? "SF venue",
          weekday,
          sourceUrl: "https://www.sfstandup.com/stagetime/",
        });
      });
    } catch (err) {
      console.warn("[openmic_agg] sfstandup failed", (err as Error).message);
    }

    try {
      const html = await fetchText("https://openmicx.com/san-francisco");
      const $ = cheerio.load(html);
      $("a, h2, h3, li").each((_, el) => {
        const text = $(el).text().replace(/\s+/g, " ").trim();
        if (!/open mic|comedy/i.test(text)) return;
        if (text.length < 8 || text.length > 100) return;
        proposals.push({
          name: text,
          venueName: text,
          weekday: detectWeekday(text),
          sourceUrl: "https://openmicx.com/san-francisco",
        });
      });
    } catch (err) {
      console.warn("[openmic_agg] openmicx failed", (err as Error).message);
    }

    const pruned = await pruneExcessInactiveProposals();
    if (pruned > 0) {
      console.log(`[openmic_agg] pruned ${pruned} excess inactive proposals`);
    }

    const [{ count: inactiveCount } = { count: 0 }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(recurringShows)
      .where(eq(recurringShows.active, false));

    const slotsLeft = Math.max(0, MAX_INACTIVE_OPENMIC_PROPOSALS - inactiveCount);
    const budget = Math.min(MAX_OPENMIC_PROPOSALS_PER_RUN, slotsLeft);

    const existing = await db.select().from(recurringShows);
    const knownKeys = new Set(existing.map((row) => proposalKey(row.name, row.venueName, row.weekday)));
    const knownNames = new Set(
      existing.map((row) => normalizeProposalText(row.name)),
    );

    const unique = dedupeProposals(proposals);
    let inserted = 0;
    for (const p of unique) {
      if (inserted >= budget) break;
      const key = proposalKey(p.name, p.venueName, p.weekday);
      const nameKey = normalizeProposalText(p.name);
      if (knownKeys.has(key) || knownNames.has(nameKey)) continue;

      await db.insert(recurringShows).values({
        name: p.name,
        venueName: p.venueName,
        weekday: p.weekday,
        hour: 20,
        minute: 0,
        comedySubtype: /open mic/i.test(p.name)
          ? "comedy.open_mic"
          : "comedy.showcase",
        sourceUrl: p.sourceUrl,
        trustWeight: 0.4,
        active: false, // requires approval
      });
      knownKeys.add(key);
      knownNames.add(nameKey);
      inserted++;
    }

    console.log(
      `[openmic_agg] proposed ${inserted} inactive recurring shows (${inactiveCount + inserted}/${MAX_INACTIVE_OPENMIC_PROPOSALS} inactive)`,
    );
    return { events: [] };
  },
};

function normalizeProposalText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function proposalKey(
  name: string,
  venueName: string,
  weekday: number | null,
): string {
  return `${normalizeProposalText(name)}|${normalizeProposalText(venueName)}|${weekday ?? ""}`;
}

function dedupeProposals<
  T extends { name: string; venueName: string; weekday: number | null },
>(proposals: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const p of proposals) {
    const key = proposalKey(p.name, p.venueName, p.weekday);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/** Keep inactive queue under the hard cap (oldest-by-id first). */
async function pruneExcessInactiveProposals(): Promise<number> {
  const deleted = await db.execute(sql`
    DELETE FROM recurring_shows
    WHERE id IN (
      SELECT id FROM recurring_shows
      WHERE active = false
      ORDER BY id
      OFFSET ${MAX_INACTIVE_OPENMIC_PROPOSALS}
    )
    RETURNING id
  `);
  const rows = Array.isArray(deleted)
    ? deleted
    : ((deleted as { rows?: unknown[] }).rows ?? []);
  return rows.length;
}

function detectWeekday(text: string): number | null {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  for (const [name, day] of Object.entries(map)) {
    if (new RegExp(name, "i").test(text)) return day;
  }
  return null;
}
