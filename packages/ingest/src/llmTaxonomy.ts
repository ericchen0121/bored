import { createHash } from "node:crypto";
import {
  INTEREST_CATEGORIES,
  isWeakEventTaxonomy,
  type InterestCategory,
} from "@bored/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, events } from "@bored/db";
import type { NormalizedEvent } from "./types.js";

/** Cached LLM result stored under `rawPayload.llmTaxonomy`. */
export type LlmTaxonomyCache = {
  hash: string;
  categories: string[];
  tags: string[];
  model: string;
  at: string;
};

const INTEREST_SET = new Set<string>(INTEREST_CATEGORIES);
const DESC_MAX = 600;
const DEFAULT_MODEL = "gpt-4.1-nano";
const DEFAULT_CONCURRENCY = 4;

/** Model often invents near-synonyms — fold onto InterestCategory ids. */
const CATEGORY_ALIASES: Record<string, InterestCategory> = {
  sports: "outdoors",
  sport: "outdoors",
  hike: "outdoors",
  hiking: "outdoors",
  outdoor: "outdoors",
  fitness: "wellness",
  yoga: "wellness",
  pilates: "wellness",
  health: "wellness",
  healing: "wellness",
  mindfulness: "wellness",
  spa: "wellness",
  theatre: "arts",
  theater: "arts",
  art: "arts",
  gallery: "arts",
  museum: "arts",
  film: "movies",
  movie: "movies",
  cinema: "movies",
  concert: "music.live",
  music: "music.live",
  edm: "music.electronic",
  techno: "music.techno",
  house: "music.house",
  jazz: "music.jazz",
  funk: "music.funk",
  soul: "music.soul",
  comedy: "comedy.showcase",
  standup: "comedy.showcase",
  "stand-up": "comedy.showcase",
  improv: "comedy.showcase",
  party: "nightlife",
  club: "nightlife",
  bar: "nightlife",
  foodie: "food",
  dining: "food",
  restaurant: "food",
  kids: "family",
  children: "family",
  startup: "tech",
  hackathon: "tech",
  developer: "tech",
  workshop: "tech",
  conference: "business",
  seminar: "business",
  symposium: "business",
  networking: "business",
  marketplace: "food",
  vintage: "arts",
  festival: "outdoors",
  faith: "family",
  church: "family",
  religious: "family",
  quiz: "nightlife",
  trivia: "nightlife",
};

function envFlag(name: string, defaultWhenUnset: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw == null || raw === "") return defaultWhenUnset;
  return !(raw === "0" || raw === "false" || raw === "off" || raw === "no");
}

export function llmTaxonomyEnabled(): boolean {
  if (!process.env.OPENAI_API_KEY?.trim()) return false;
  return envFlag("LLM_TAXONOMY", true);
}

export function llmTaxonomyModel(): string {
  return process.env.OPENAI_TAXONOMY_MODEL?.trim() || DEFAULT_MODEL;
}

function taxonomyConcurrency(): number {
  const n = Number(process.env.LLM_TAXONOMY_CONCURRENCY ?? DEFAULT_CONCURRENCY);
  return Number.isFinite(n) && n > 0 ? Math.min(8, Math.floor(n)) : DEFAULT_CONCURRENCY;
}

function normalizeTags(tags: string[] | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of tags ?? []) {
    if (typeof raw !== "string") continue;
    const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (t.length < 2 || t.length > 32) continue;
    if (t === "undefined" || t === "null") continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 5) break;
  }
  return out;
}

function resolveCategoryToken(raw: string): InterestCategory | null {
  const key = raw.trim();
  if (!key) return null;
  if (INTEREST_SET.has(key)) return key as InterestCategory;
  const lower = key.toLowerCase().replace(/\s+/g, "_");
  if (INTEREST_SET.has(lower)) return lower as InterestCategory;
  const aliased =
    CATEGORY_ALIASES[lower] ?? CATEGORY_ALIASES[lower.replace(/_/g, "")];
  if (aliased) return aliased;
  // Model invents near-miss subtypes (music.funk, comedy.sketch, …)
  if (lower.startsWith("music.")) return "music.live";
  if (lower.startsWith("comedy.")) return "comedy.showcase";
  if (lower.startsWith("movies.")) return "movies";
  return null;
}

function sanitizeCategories(
  cats: unknown,
  opts: { isFree?: boolean; existing?: string[] },
): InterestCategory[] {
  const out = new Set<InterestCategory>();
  if (Array.isArray(cats)) {
    for (const c of cats) {
      if (typeof c !== "string") continue;
      const resolved = resolveCategoryToken(c);
      if (resolved) out.add(resolved);
    }
  }
  for (const c of opts.existing ?? []) {
    if (c === "free" && INTEREST_SET.has(c)) out.add(c as InterestCategory);
  }
  if (opts.isFree) out.add("free");
  return [...out];
}

export function llmTaxonomyInputHash(ev: {
  title?: string | null;
  venueName?: string | null;
  description?: string | null;
  categories?: string[] | null;
  tags?: string[] | null;
  source?: string | null;
}): string {
  const desc = (ev.description ?? "").slice(0, DESC_MAX);
  return createHash("sha256")
    .update(
      [
        ev.source ?? "",
        ev.title ?? "",
        ev.venueName ?? "",
        desc,
        [...(ev.categories ?? [])].sort().join(","),
        [...(ev.tags ?? [])].sort().join(","),
      ].join("|"),
    )
    .digest("hex")
    .slice(0, 32);
}

function readCache(raw: unknown): LlmTaxonomyCache | null {
  if (!raw || typeof raw !== "object") return null;
  const v = (raw as Record<string, unknown>).llmTaxonomy;
  if (!v || typeof v !== "object") return null;
  const c = v as Record<string, unknown>;
  if (typeof c.hash !== "string") return null;
  if (!Array.isArray(c.categories)) return null;
  return {
    hash: c.hash,
    categories: c.categories.filter((x): x is string => typeof x === "string"),
    tags: Array.isArray(c.tags)
      ? c.tags.filter((x): x is string => typeof x === "string")
      : [],
    model: typeof c.model === "string" ? c.model : "",
    at: typeof c.at === "string" ? c.at : "",
  };
}

function withCache(
  raw: unknown,
  cache: LlmTaxonomyCache,
): Record<string, unknown> {
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? { ...(raw as Record<string, unknown>) }
      : {};
  base.llmTaxonomy = cache;
  return base;
}

function applyCacheToEvent(
  ev: NormalizedEvent,
  cache: LlmTaxonomyCache,
): NormalizedEvent {
  const categories = sanitizeCategories(cache.categories, {
    isFree: ev.isFree,
    existing: ev.categories,
  });
  const tags = [
    ...new Set([...(ev.tags ?? []), ...normalizeTags(cache.tags)]),
  ];
  return {
    ...ev,
    categories,
    tags,
    rawPayload: withCache(ev.rawPayload, cache),
  };
}

type OpenAiChatResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

async function callOpenAiTaxonomy(ev: NormalizedEvent): Promise<{
  categories: string[];
  tags: string[];
} | null> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;

  const model = llmTaxonomyModel();
  const allowed = INTEREST_CATEGORIES.filter((c) => c !== "free").join(", ");
  const system = `You classify local events for a city discovery feed.
Return JSON only: {"categories":string[],"tags":string[]}.
Rules:
- categories: 1-3 ids from this exact set only: ${allowed}
- Never invent ids like "sports" or "health" — sports/parks/tours → outdoors; yoga/pilates/healing → wellness; conferences/networking → business.
- Prefer specific music.* / comedy.* over nightlife when clear.
- music.funk / music.soul when clearly funk or soul (not just R&B).
- tags: 0-3 short scannable labels (e.g. yoga, jazz, baseball). Lowercase strings only.
- Stand-up / billed comedy nights → comedy.showcase; club rooms → comedy.club; open mics → comedy.open_mic.
- Documentaries / film screenings → movies or movies.arthouse (not music.*).
- "improves" is not improv comedy.`;

  const user = JSON.stringify({
    title: ev.title,
    venue: ev.venueName ?? null,
    source: ev.source,
    existingCategories: ev.categories ?? [],
    existingTags: ev.tags ?? [],
    description: (ev.description ?? "").slice(0, DESC_MAX),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(
        `[llm-taxonomy] OpenAI ${res.status} for "${ev.title.slice(0, 60)}": ${body.slice(0, 200)}`,
      );
      return null;
    }
    const data = (await res.json()) as OpenAiChatResponse;
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    const parsed = JSON.parse(content) as {
      categories?: unknown;
      tags?: unknown;
    };
    return {
      categories: sanitizeCategories(parsed.categories, {
        isFree: ev.isFree,
        existing: ev.categories,
      }),
      tags: normalizeTags(
        Array.isArray(parsed.tags)
          ? parsed.tags.filter((t): t is string => typeof t === "string")
          : [],
      ),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[llm-taxonomy] failed for "${ev.title.slice(0, 60)}": ${msg}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function loadExistingCaches(
  list: NormalizedEvent[],
): Promise<Map<string, LlmTaxonomyCache>> {
  const out = new Map<string, LlmTaxonomyCache>();
  if (!list.length) return out;

  const bySource = new Map<string, string[]>();
  for (const ev of list) {
    const ids = bySource.get(ev.source) ?? [];
    ids.push(ev.sourceEventId);
    bySource.set(ev.source, ids);
  }

  for (const [source, ids] of bySource) {
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const rows = await db
        .select({
          sourceEventId: events.sourceEventId,
          rawPayload: events.rawPayload,
        })
        .from(events)
        .where(
          and(eq(events.source, source), inArray(events.sourceEventId, chunk)),
        );
      for (const row of rows) {
        const cache = readCache(row.rawPayload);
        if (cache) out.set(`${source}::${row.sourceEventId}`, cache);
      }
    }
  }
  return out;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

/**
 * For weak-taxonomy listings, fill categories/tags via a cheap OpenAI model
 * (default gpt-4.1-nano). Skips when disabled, strong cats already present,
 * or a matching rawPayload.llmTaxonomy cache exists.
 */
export async function enrichWeakEventsWithLlmTaxonomy(
  list: NormalizedEvent[],
): Promise<NormalizedEvent[]> {
  if (!list.length || !llmTaxonomyEnabled()) return list;

  const weakIdx: number[] = [];
  for (let i = 0; i < list.length; i++) {
    if (isWeakEventTaxonomy(list[i]!.categories)) weakIdx.push(i);
  }
  if (!weakIdx.length) return list;

  const weakEvents = weakIdx.map((i) => list[i]!);
  const caches = await loadExistingCaches(weakEvents);
  const model = llmTaxonomyModel();
  const out = list.slice();
  let cacheHits = 0;
  let apiCalls = 0;
  let apiFails = 0;

  const needApi: { idx: number; ev: NormalizedEvent; hash: string }[] = [];

  for (const i of weakIdx) {
    const ev = list[i]!;
    const hash = llmTaxonomyInputHash(ev);
    const cached = caches.get(`${ev.source}::${ev.sourceEventId}`);
    if (cached && cached.hash === hash && cached.categories.length) {
      out[i] = applyCacheToEvent(ev, cached);
      cacheHits += 1;
      continue;
    }
    const tip =
      `${ev.title} ${ev.venueName ?? ""} ${ev.description ?? ""}`.trim();
    if (tip.length < 12) continue;
    needApi.push({ idx: i, ev, hash });
  }

  await mapPool(needApi, taxonomyConcurrency(), async ({ idx, ev, hash }) => {
    const result = await callOpenAiTaxonomy(ev);
    if (!result) {
      apiFails += 1;
      return;
    }
    // Persist even nightlife-only so we don't re-bill every ingest.
    if (result.categories.length === 0) {
      apiFails += 1;
      return;
    }
    apiCalls += 1;
    const cache: LlmTaxonomyCache = {
      hash,
      categories: result.categories,
      tags: result.tags,
      model,
      at: new Date().toISOString(),
    };
    out[idx] = applyCacheToEvent(ev, cache);
  });

  if (cacheHits || apiCalls || apiFails) {
    console.log(
      `[llm-taxonomy] weak=${weakIdx.length} cacheHits=${cacheHits} apiOk=${apiCalls} apiFail=${apiFails} model=${model}`,
    );
  }
  return out;
}

/** Upsert rawPayload merge: preserve detail keys, but prefer excluded.llmTaxonomy. */
export function llmAwareRawPayloadSql() {
  return sql`
    CASE
      WHEN excluded.raw_payload ? 'llmTaxonomy' THEN
        (coalesce(excluded.raw_payload, '{}'::jsonb)
          || coalesce(${events.rawPayload}, '{}'::jsonb))
        || jsonb_build_object('llmTaxonomy', excluded.raw_payload->'llmTaxonomy')
      ELSE
        coalesce(excluded.raw_payload, '{}'::jsonb)
          || coalesce(${events.rawPayload}, '{}'::jsonb)
    END
  `;
}

/** One-shot backfill for upcoming weak rows already in Postgres. */
export async function backfillLlmTaxonomy(opts: {
  limit?: number;
  dryRun?: boolean;
} = {}): Promise<{ scanned: number; updated: number; skipped: number }> {
  if (!llmTaxonomyEnabled()) {
    console.warn(
      "[llm-taxonomy] skipped — set OPENAI_API_KEY (and LLM_TAXONOMY≠0)",
    );
    return { scanned: 0, updated: 0, skipped: 0 };
  }

  const limit = opts.limit ?? 200;
  const rows = await db
    .select()
    .from(events)
    .where(
      and(
        eq(events.hidden, false),
        eq(events.kind, "event"),
        sql`${events.startsAt} > now()`,
        sql`NOT EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${events.categories}) c
          WHERE c NOT IN ('free', 'nightlife')
        )`,
      ),
    )
    .orderBy(events.startsAt)
    .limit(limit);

  let updated = 0;
  let skipped = 0;
  const asNormalized: NormalizedEvent[] = rows.map((r) => ({
    source: r.source,
    sourceEventId: r.sourceEventId,
    kind: r.kind as "event" | "recommendation",
    title: r.title,
    description: r.description,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    timezone: r.timezone,
    venueName: r.venueName,
    address: r.address,
    neighborhood: r.neighborhood,
    lat: r.lat,
    lng: r.lng,
    city: r.city,
    priceMin: r.priceMin,
    priceMax: r.priceMax,
    isFree: r.isFree,
    categories: r.categories ?? [],
    tags: r.tags ?? [],
    ageRestriction: r.ageRestriction,
    url: r.url,
    imageUrl: r.imageUrl,
    organizer: r.organizer,
    recurringShowId: r.recurringShowId,
    registrationStatus:
      r.registrationStatus as NormalizedEvent["registrationStatus"],
    registrationCheckedAt: r.registrationCheckedAt,
    rawPayload: r.rawPayload,
  }));

  const enriched = await enrichWeakEventsWithLlmTaxonomy(asNormalized);

  for (let i = 0; i < rows.length; i++) {
    const before = rows[i]!;
    const after = enriched[i]!;
    const catsChanged =
      JSON.stringify([...(before.categories ?? [])].sort()) !==
      JSON.stringify([...(after.categories ?? [])].sort());
    const tagsChanged =
      JSON.stringify([...(before.tags ?? [])].sort()) !==
      JSON.stringify([...(after.tags ?? [])].sort());
    const cacheWritten = Boolean(
      after.rawPayload &&
        typeof after.rawPayload === "object" &&
        (after.rawPayload as Record<string, unknown>).llmTaxonomy,
    );
    if (!catsChanged && !tagsChanged && !cacheWritten) {
      skipped += 1;
      continue;
    }
    // Only count as "updated" when we gained a strong category
    const gainedStrong =
      isWeakEventTaxonomy(before.categories) &&
      !isWeakEventTaxonomy(after.categories);
    if (opts.dryRun) {
      console.log(
        `[llm-taxonomy:dry] ${after.title} → ${JSON.stringify(after.categories)} tags=${JSON.stringify(
          (after.tags ?? []).slice(0, 6),
        )}`,
      );
      if (gainedStrong) updated += 1;
      else skipped += 1;
      continue;
    }
    await db
      .update(events)
      .set({
        categories: after.categories ?? [],
        tags: after.tags ?? [],
        rawPayload: after.rawPayload ?? null,
      })
      .where(
        and(
          eq(events.source, before.source),
          eq(events.sourceEventId, before.sourceEventId),
        ),
      );
    if (gainedStrong) updated += 1;
    else skipped += 1;
  }

  return { scanned: rows.length, updated, skipped };
}
