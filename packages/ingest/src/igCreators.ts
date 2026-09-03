/**
 * Curated Instagram scrape targets — seed list (code) + admin-managed DB rows.
 * Ingest scrapes the merged active set per metro (`sf` | `chicago` | `la`).
 *
 * Seed rule: only Graph-reachable Business/Creator handles (no guessed usernames).
 */
import {
  db,
  events,
  igCreatorScrapes,
  igCreators,
} from "@bored/db";
import { and, count, eq, isNotNull } from "drizzle-orm";
import { resolveIgAccessToken } from "./instagramAccessToken.js";

export const IG_FEED_CITIES = ["sf", "chicago", "la"] as const;
export type IgFeedCity = (typeof IG_FEED_CITIES)[number];

export type IgCreatorAccount = {
  handle: string;
  city: IgFeedCity;
  categories: string[];
  foodInfluencer?: boolean;
  cityGuide?: boolean;
  localOutlet?: boolean;
};

export type IgCreatorScrapeStatus = {
  lastScrapedAt: string | null;
  lastOk: boolean | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  mediaFetched: number;
  eventsEmitted: number;
  profilePictureUrl: string | null;
};

export type IgCreatorRow = IgCreatorAccount & {
  id: string | null;
  source: "seed" | "admin";
  active: boolean;
  notes: string | null;
  updatedAt: string | null;
  /** Listings currently in DB tagged with this handle. */
  listingCount: number;
  /** Cached Graph profile pic (from last successful lookup/scrape). */
  profilePictureUrl: string | null;
  scrape: IgCreatorScrapeStatus;
};

/** Built-in scrape list — always present unless disabled via admin. */
export const SEED_IG_CREATORS: IgCreatorAccount[] = [
  // ── San Francisco / Bay (Graph-proven + active listings) ──
  { handle: "eater_sf", city: "sf", categories: ["food"], localOutlet: true },
  { handle: "tablehopper", city: "sf", categories: ["food"], localOutlet: true },
  {
    handle: "sfchronicle_food",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "onlyinsf",
    city: "sf",
    categories: ["food", "outdoors"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "sfstandard",
    city: "sf",
    categories: ["arts", "food"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "funcheap",
    city: "sf",
    categories: ["free", "arts", "food"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "brokeassstuart",
    city: "sf",
    categories: ["food", "nightlife", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "7x7bayarea",
    city: "sf",
    categories: ["food", "nightlife", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "sfgate",
    city: "sf",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "missionlocal",
    city: "sf",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "thebolditalic",
    city: "sf",
    categories: ["food", "arts", "nightlife"],
    cityGuide: true,
    localOutlet: true,
  },
  { handle: "sherryeatworld", city: "sf", categories: ["food"], foodInfluencer: true },
  {
    handle: "cheycheyfromthebay",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  { handle: "violetwitchel", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "thesnacksensei", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "eatwithslay", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "pastrywithjenn", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "festusfeasts", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "oishiimoments", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "jor.favfoodie", city: "sf", categories: ["food"], foodInfluencer: true },
  { handle: "angelinahong_", city: "sf", categories: ["food"], foodInfluencer: true },
  {
    handle: "confession.of.a.foodie",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
  },
  { handle: "allie.eats", city: "sf", categories: ["food"], foodInfluencer: true },
  {
    handle: "taratastessf",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  { handle: "neverendingflavor", city: "sf", categories: ["food"], foodInfluencer: true },
  {
    handle: "bayareabites",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "sfbites",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "eatdrinksf",
    city: "sf",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },

  // ── Chicago (Graph-proven + researched creators) ──
  {
    handle: "timeoutchicago",
    city: "chicago",
    categories: ["food", "nightlife", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "choosechicago",
    city: "chicago",
    categories: ["food", "arts", "outdoors"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "do312",
    city: "chicago",
    categories: ["nightlife", "arts", "food"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "chicagofoodauthority",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "chicagofoodie",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "blockclubchi",
    city: "chicago",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "chicagotribune",
    city: "chicago",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "chicagomag",
    city: "chicago",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "chicagofoodgirl",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "bestfoodchicago",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "eatlikeachi",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  // Researched (lists / local coverage) — Graph-verified before ship
  {
    handle: "erica_eatseverything",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
  },
  {
    handle: "chicityeating",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
  },
  {
    handle: "chicityfoodie",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
  },
  {
    handle: "chicagofoodhq",
    city: "chicago",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },

  // ── Los Angeles (Graph-proven + researched creators) ──
  { handle: "eater_la", city: "la", categories: ["food"], localOutlet: true },
  {
    handle: "discoverla",
    city: "la",
    categories: ["food", "arts", "outdoors"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "lafoodie",
    city: "la",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  { handle: "hungry4munchies", city: "la", categories: ["food"], foodInfluencer: true },
  {
    handle: "latimesfood",
    city: "la",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "lamag",
    city: "la",
    categories: ["food", "arts"],
    cityGuide: true,
    localOutlet: true,
  },
  {
    handle: "bestfoodla",
    city: "la",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  {
    handle: "laeats",
    city: "la",
    categories: ["food"],
    foodInfluencer: true,
    localOutlet: true,
  },
  { handle: "tastingtable", city: "la", categories: ["food"], foodInfluencer: true },
  // Researched (Pearl Club / Eater / local lists) — Graph-verified before ship
  { handle: "lisaeatsla", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "hungryinla", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "lafoodjunkie", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "lafoodieguy", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "snacks_with_steph", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "tffny.eats", city: "la", categories: ["food"], foodInfluencer: true },
  { handle: "wonhophoto", city: "la", categories: ["food"], localOutlet: true },
];

const SEED_BY_HANDLE = new Map(
  SEED_IG_CREATORS.map((c) => [c.handle.toLowerCase(), c]),
);

export function normalizeIgHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function isIgFeedCity(v: string): v is IgFeedCity {
  return (IG_FEED_CITIES as readonly string[]).includes(v);
}

type DbCreator = typeof igCreators.$inferSelect;

const EMPTY_SCRAPE: IgCreatorScrapeStatus = {
  lastScrapedAt: null,
  lastOk: null,
  lastHttpStatus: null,
  lastError: null,
  mediaFetched: 0,
  eventsEmitted: 0,
  profilePictureUrl: null,
};

function accountFromDb(row: DbCreator): IgCreatorAccount {
  return {
    handle: row.handle,
    city: row.city as IgFeedCity,
    categories: Array.isArray(row.categories) ? row.categories : ["food"],
    foodInfluencer: row.foodInfluencer || undefined,
    cityGuide: row.cityGuide || undefined,
    localOutlet: row.localOutlet || undefined,
  };
}

function scrapeFromRow(
  row: typeof igCreatorScrapes.$inferSelect | undefined,
): IgCreatorScrapeStatus {
  if (!row) return EMPTY_SCRAPE;
  return {
    lastScrapedAt: row.lastScrapedAt.toISOString(),
    lastOk: row.lastOk,
    lastHttpStatus: row.lastHttpStatus,
    lastError: row.lastError,
    mediaFetched: row.mediaFetched,
    eventsEmitted: row.eventsEmitted,
    profilePictureUrl: row.profilePictureUrl ?? null,
  };
}

export type RecordIgCreatorScrapeInput = {
  handle: string;
  ok: boolean;
  httpStatus?: number | null;
  error?: string | null;
  mediaFetched?: number;
  eventsEmitted?: number;
  profilePictureUrl?: string | null;
};

/** Upsert last Graph scrape outcome for a handle. */
export async function recordIgCreatorScrape(
  input: RecordIgCreatorScrapeInput,
): Promise<void> {
  const handle = normalizeIgHandle(input.handle);
  if (!handle) return;
  const now = new Date();
  const profilePictureUrl = input.profilePictureUrl?.trim() || null;
  const values = {
    handle,
    lastScrapedAt: now,
    lastOk: input.ok,
    lastHttpStatus: input.httpStatus ?? null,
    lastError: input.error?.trim().slice(0, 500) || null,
    mediaFetched: input.mediaFetched ?? 0,
    eventsEmitted: input.eventsEmitted ?? 0,
    profilePictureUrl,
  };
  try {
    await db
      .insert(igCreatorScrapes)
      .values(values)
      .onConflictDoUpdate({
        target: igCreatorScrapes.handle,
        set: {
          lastScrapedAt: values.lastScrapedAt,
          lastOk: values.lastOk,
          lastHttpStatus: values.lastHttpStatus,
          lastError: values.lastError,
          mediaFetched: values.mediaFetched,
          eventsEmitted: values.eventsEmitted,
          ...(profilePictureUrl
            ? { profilePictureUrl }
            : {}),
        },
      });
  } catch (err) {
    console.warn(
      `[igCreators] scrape status write failed for @${handle}:`,
      (err as Error).message,
    );
  }
}

/** Active accounts for ingest (seed − disabled + admin additions). */
export async function listActiveIgCreators(): Promise<IgCreatorAccount[]> {
  const rows = await loadDbCreators();
  const disabled = new Set(
    rows.filter((r) => !r.active).map((r) => r.handle.toLowerCase()),
  );
  const adminActive = rows.filter((r) => r.active);

  const out = new Map<string, IgCreatorAccount>();
  for (const seed of SEED_IG_CREATORS) {
    const key = seed.handle.toLowerCase();
    if (disabled.has(key)) continue;
    out.set(key, seed);
  }
  for (const row of adminActive) {
    out.set(row.handle.toLowerCase(), accountFromDb(row));
  }
  return [...out.values()].sort((a, b) => {
    if (a.city !== b.city) return a.city.localeCompare(b.city);
    return a.handle.localeCompare(b.handle);
  });
}

async function loadDbCreators(): Promise<DbCreator[]> {
  try {
    return await db.select().from(igCreators);
  } catch {
    return [];
  }
}

async function loadScrapeByHandle(): Promise<
  Map<string, typeof igCreatorScrapes.$inferSelect>
> {
  try {
    const rows = await db.select().from(igCreatorScrapes);
    return new Map(rows.map((r) => [r.handle.toLowerCase(), r]));
  } catch {
    return new Map();
  }
}

async function listingCountsByHandle(): Promise<Map<string, number>> {
  try {
    const rows = await db
      .select({
        organizer: events.organizer,
        n: count(),
      })
      .from(events)
      .where(
        and(
          eq(events.source, "instagram"),
          eq(events.hidden, false),
          isNotNull(events.organizer),
        ),
      )
      .groupBy(events.organizer);
    const map = new Map<string, number>();
    for (const r of rows) {
      const handle = normalizeIgHandle(r.organizer ?? "");
      if (!handle) continue;
      map.set(handle, (map.get(handle) ?? 0) + (Number(r.n) || 0));
    }
    return map;
  } catch {
    return new Map();
  }
}

/** Full admin list including inactive seed overrides. */
export async function listIgCreatorsForAdmin(): Promise<IgCreatorRow[]> {
  const dbRows = await loadDbCreators();
  const byHandle = new Map(dbRows.map((r) => [r.handle.toLowerCase(), r]));
  const counts = await listingCountsByHandle();
  const scrapes = await loadScrapeByHandle();
  const seen = new Set<string>();
  const out: IgCreatorRow[] = [];

  for (const seed of SEED_IG_CREATORS) {
    const key = seed.handle.toLowerCase();
    seen.add(key);
    const override = byHandle.get(key);
    const active = override ? override.active : true;
    const account = override && override.active ? accountFromDb(override) : seed;
    out.push({
      ...account,
      id: override?.id ?? null,
      source: "seed",
      active,
      notes: override?.notes ?? null,
      updatedAt: override?.updatedAt?.toISOString() ?? null,
      listingCount: counts.get(key) ?? 0,
      scrape: scrapeFromRow(scrapes.get(key)),
      profilePictureUrl: scrapes.get(key)?.profilePictureUrl ?? null,
    });
  }

  for (const row of dbRows) {
    const key = row.handle.toLowerCase();
    if (seen.has(key)) continue;
    out.push({
      ...accountFromDb(row),
      id: row.id,
      source: "admin",
      active: row.active,
      notes: row.notes,
      updatedAt: row.updatedAt.toISOString(),
      listingCount: counts.get(key) ?? 0,
      scrape: scrapeFromRow(scrapes.get(key)),
      profilePictureUrl: scrapes.get(key)?.profilePictureUrl ?? null,
    });
  }

  return out.sort((a, b) => {
    if (a.city !== b.city) return a.city.localeCompare(b.city);
    return a.handle.localeCompare(b.handle);
  });
}

/** True when last scrape failed, or never scraped and zero listings. */
export function isDeadIgCreator(row: IgCreatorRow): boolean {
  if (!row.active) return false;
  if (row.scrape.lastOk === false) return true;
  if (
    row.scrape.lastScrapedAt == null &&
    row.listingCount === 0 &&
    !row.profilePictureUrl
  ) {
    return true;
  }
  return false;
}

export type PruneDeadIgCreatorsResult = {
  pruned: string[];
  skipped: number;
};

/**
 * Disable active creators that last failed Graph scrape, or have never
 * scraped successfully and have zero listings.
 */
export async function pruneDeadIgCreators(opts?: {
  /** Only prune handles with a failed last scrape (ignore never-scraped). */
  onlyFailedScrapes?: boolean;
}): Promise<PruneDeadIgCreatorsResult> {
  const list = await listIgCreatorsForAdmin();
  const pruned: string[] = [];
  let skipped = 0;

  for (const row of list) {
    if (!row.active) {
      skipped += 1;
      continue;
    }
    const deadFailed = row.scrape.lastOk === false;
    const deadNever =
      !opts?.onlyFailedScrapes &&
      row.scrape.lastScrapedAt == null &&
      row.listingCount === 0 &&
      !row.profilePictureUrl;
    if (!deadFailed && !deadNever) {
      skipped += 1;
      continue;
    }
    await upsertIgCreator({
      handle: row.handle,
      city: row.city,
      categories: row.categories,
      foodInfluencer: row.foodInfluencer,
      cityGuide: row.cityGuide,
      localOutlet: row.localOutlet,
      notes:
        row.notes ??
        (deadFailed
          ? `Pruned: last scrape failed (${row.scrape.lastHttpStatus ?? "?"})`
          : "Pruned: never scraped / 0 listings"),
      active: false,
    });
    pruned.push(row.handle);
  }

  return { pruned, skipped };
}

export type IgCreatorLookup = {
  handle: string;
  name: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  mediaCount: number | null;
  profilePictureUrl: string | null;
  alreadyScraped: boolean;
  scrapedCity: IgFeedCity | null;
};

export async function lookupIgCreator(
  rawHandle: string,
): Promise<{ ok: true; profile: IgCreatorLookup } | { ok: false; error: string }> {
  const handle = normalizeIgHandle(rawHandle);
  if (!/^[a-z0-9._]{1,30}$/i.test(handle)) {
    return { ok: false, error: "Invalid Instagram handle" };
  }

  const token = await resolveIgAccessToken();
  const userId = process.env.IG_BUSINESS_USER_ID?.trim();
  if (!token || !userId) {
    return { ok: false, error: "IG_ACCESS_TOKEN / IG_BUSINESS_USER_ID missing" };
  }

  const fields = `business_discovery.username(${handle}){username,name,biography,website,followers_count,media_count,profile_picture_url}`;
  const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(userId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const body = (await res.json()) as {
    business_discovery?: {
      username?: string;
      name?: string;
      biography?: string;
      website?: string;
      followers_count?: number;
      media_count?: number;
      profile_picture_url?: string;
    };
    error?: { message?: string };
  };

  if (!res.ok || body.error || !body.business_discovery) {
    return {
      ok: false,
      error:
        body.error?.message ??
        (res.status === 400
          ? "Handle not found or not a Business/Creator account"
          : `Lookup failed (${res.status})`),
    };
  }

  const active = await listActiveIgCreators();
  const existing = active.find((c) => c.handle.toLowerCase() === handle);
  const bd = body.business_discovery;

  return {
    ok: true,
    profile: {
      handle: normalizeIgHandle(bd.username ?? handle),
      name: bd.name ?? null,
      biography: bd.biography ?? null,
      website: bd.website ?? null,
      followersCount: bd.followers_count ?? null,
      mediaCount: bd.media_count ?? null,
      profilePictureUrl: bd.profile_picture_url ?? null,
      alreadyScraped: Boolean(existing),
      scrapedCity: existing?.city ?? null,
    },
  };
}

export type UpsertIgCreatorInput = {
  handle: string;
  city: IgFeedCity;
  categories?: string[];
  foodInfluencer?: boolean;
  cityGuide?: boolean;
  localOutlet?: boolean;
  notes?: string | null;
  active?: boolean;
  profilePictureUrl?: string | null;
};

export async function upsertIgCreator(
  input: UpsertIgCreatorInput,
): Promise<IgCreatorRow> {
  const handle = normalizeIgHandle(input.handle);
  if (!isIgFeedCity(input.city)) {
    throw new Error("Invalid city");
  }
  const now = new Date();
  const categories =
    input.categories?.filter(Boolean).map((c) => c.trim()).filter(Boolean) ??
    ["food"];
  const values = {
    handle,
    city: input.city,
    categories: categories.length ? categories : ["food"],
    foodInfluencer: Boolean(input.foodInfluencer ?? true),
    cityGuide: Boolean(input.cityGuide),
    localOutlet: Boolean(input.localOutlet),
    active: input.active !== false,
    notes: input.notes?.trim() || null,
    updatedAt: now,
  };

  await db
    .insert(igCreators)
    .values({
      ...values,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: igCreators.handle,
      set: values,
    });

  if (input.profilePictureUrl?.trim()) {
    await cacheIgCreatorProfilePicture(handle, input.profilePictureUrl);
  }

  const list = await listIgCreatorsForAdmin();
  const row = list.find((c) => c.handle === handle);
  if (!row) throw new Error("Failed to load creator after save");
  return row;
}

/** Cache Graph avatar without marking a media scrape outcome. */
export async function cacheIgCreatorProfilePicture(
  handleRaw: string,
  profilePictureUrl: string | null | undefined,
): Promise<void> {
  const handle = normalizeIgHandle(handleRaw);
  const url = profilePictureUrl?.trim() || null;
  if (!handle || !url) return;
  const now = new Date();
  try {
    await db
      .insert(igCreatorScrapes)
      .values({
        handle,
        lastScrapedAt: now,
        lastOk: true,
        lastHttpStatus: null,
        lastError: null,
        mediaFetched: 0,
        eventsEmitted: 0,
        profilePictureUrl: url,
      })
      .onConflictDoUpdate({
        target: igCreatorScrapes.handle,
        set: { profilePictureUrl: url },
      });
  } catch (err) {
    console.warn(
      `[igCreators] avatar cache failed for @${handle}:`,
      (err as Error).message,
    );
  }
}

/** Remove from scrape list: delete admin row, or deactivate a seed handle. */
export async function removeIgCreator(handleRaw: string): Promise<void> {
  const handle = normalizeIgHandle(handleRaw);
  const seed = SEED_BY_HANDLE.get(handle);
  if (seed) {
    await upsertIgCreator({
      handle,
      city: seed.city,
      categories: seed.categories,
      foodInfluencer: seed.foodInfluencer,
      cityGuide: seed.cityGuide,
      localOutlet: seed.localOutlet,
      active: false,
      notes: "Disabled via admin",
    });
    return;
  }
  await db.delete(igCreators).where(eq(igCreators.handle, handle));
}

export async function setIgCreatorActive(
  handleRaw: string,
  active: boolean,
): Promise<IgCreatorRow> {
  const handle = normalizeIgHandle(handleRaw);
  const list = await listIgCreatorsForAdmin();
  const existing = list.find((c) => c.handle === handle);
  if (!existing) throw new Error("Creator not found");
  return upsertIgCreator({
    handle,
    city: existing.city,
    categories: existing.categories,
    foodInfluencer: existing.foodInfluencer,
    cityGuide: existing.cityGuide,
    localOutlet: existing.localOutlet,
    notes: existing.notes,
    active,
  });
}
