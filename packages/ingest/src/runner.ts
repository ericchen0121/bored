import { db, events, films, ingestRuns, showtimes, theaters } from "@bored/db";
import { EVERGREEN_TIP_STALE_DAYS, resolveEventKind } from "@bored/shared";
import { and, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { NormalizedEvent, NormalizedShowtimeBatch, SourceAdapter } from "./types.js";
import { eventContentHash } from "./types.js";
import { nineteenHzAdapter, nineteenHzChicagoAdapter } from "./adapters/nineteenHz.js";
import { funcheapAdapter } from "./adapters/funcheap.js";
import { lumaAdapter, lumaChicagoAdapter } from "./adapters/luma.js";
import {
  comedyVenueAdapter,
  comedyVenueChicagoAdapter,
  ticketmasterAdapter,
  ticketmasterChicagoAdapter,
} from "./adapters/ticketmaster.js";
import { moviesAdapter } from "./adapters/movies.js";
import { recurringComedyAdapter } from "./adapters/recurringComedy.js";
import { partifulAdapter } from "./adapters/partiful.js";
import { newsletterAdapter } from "./adapters/newsletter.js";
import { instagramAdapter } from "./adapters/instagram.js";
import { openMicAggAdapter } from "./adapters/openMicAgg.js";
import { indieTheaterAdapter } from "./adapters/indieTheater.js";
import { foodAdapter } from "./adapters/food.js";
import { foodDealsAdapter } from "./adapters/foodDeals.js";
import { activitiesAdapter } from "./adapters/activities.js";
import { newRestaurantsAdapter } from "./adapters/newRestaurants.js";
import { do312Adapter } from "./adapters/do312.js";
import { chicagoCheapAdapter } from "./adapters/chicagoCheap.js";

import { raChicagoAdapter, raSfAdapter } from "./adapters/ra.js";
import {
  eventbriteAdapter,
  eventbriteChicagoAdapter,
} from "./adapters/eventbrite.js";

export const ALL_ADAPTERS: SourceAdapter[] = [
  // Ticket platforms before 19hz so finalize can skip URL/id twins in-run.
  raChicagoAdapter,
  raSfAdapter,
  eventbriteAdapter,
  eventbriteChicagoAdapter,
  nineteenHzAdapter,
  nineteenHzChicagoAdapter,
  funcheapAdapter,
  lumaAdapter,
  lumaChicagoAdapter,
  ticketmasterAdapter,
  ticketmasterChicagoAdapter,
  comedyVenueAdapter,
  comedyVenueChicagoAdapter,
  recurringComedyAdapter,
  moviesAdapter,
  partifulAdapter,
  newsletterAdapter,
  instagramAdapter,
  openMicAggAdapter,
  indieTheaterAdapter,
  foodAdapter,
  foodDealsAdapter,
  activitiesAdapter,
  newRestaurantsAdapter,
  do312Adapter,
  chicagoCheapAdapter,
];

export const PHASE1_ADAPTERS = ALL_ADAPTERS.filter((a) =>
  [
    "19hz",
    "19hz_chi",
    "funcheap",
    "luma",
    "luma_chi",
    "ticketmaster",
    "ticketmaster_chi",
    "comedy_venue",
    "comedy_venue_chi",
    "recurring",
    "movies_tms",
    "do312",
    "chicago_cheap",
    "ra_chi",
    "ra_sf",
    "eventbrite",
    "eventbrite_chi",
  ].includes(a.id),
);

/**
 * Closed-set replace: drop events for `source` whose sourceEventId is not in
 * `keepIds` (empty keepIds deletes all rows for that source).
 */
export async function replaceSourceEvents(
  source: string,
  keepIds: string[],
): Promise<number> {
  if (!keepIds.length) {
    const deleted = await db
      .delete(events)
      .where(eq(events.source, source))
      .returning({ id: events.id });
    return deleted.length;
  }
  const deleted = await db
    .delete(events)
    .where(
      and(eq(events.source, source), notInArray(events.sourceEventId, keepIds)),
    )
    .returning({ id: events.id });
  return deleted.length;
}

/** Delete specific (source, sourceEventId) pairs — coalesce orphans, capped days. */
export async function deleteSourceEventIds(
  groups: { source: string; ids: string[] }[],
): Promise<number> {
  let total = 0;
  for (const { source, ids } of groups) {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) continue;
    // Chunk to stay under Postgres bind limits
    for (let i = 0; i < unique.length; i += 500) {
      const chunk = unique.slice(i, i + 500);
      const deleted = await db
        .delete(events)
        .where(
          and(eq(events.source, source), inArray(events.sourceEventId, chunk)),
        )
        .returning({ id: events.id });
      total += deleted.length;
    }
  }
  return total;
}

/**
 * Drop legacy coalesce rewrite ids: `ticketmaster:<32-hex>`, `comedy_venue:<32-hex>`.
 */
export async function purgeLegacyCoalesceSourceEventIds(
  sources: string[],
): Promise<number> {
  let total = 0;
  for (const source of sources) {
    const pattern = `${source}:%`;
    const deleted = await db
      .delete(events)
      .where(
        and(
          eq(events.source, source),
          sql`${events.sourceEventId} like ${pattern}`,
          sql`length(${events.sourceEventId}) = ${source.length + 1 + 32}`,
        ),
      )
      .returning({ id: events.id });
    total += deleted.length;
  }
  return total;
}

/**
 * Keep at most `maxDays` upcoming calendar days per title+venue+city+source,
 * one row per day. Also drops past rows and same-day duplicates for these
 * sources (legacy coalesce leftovers).
 */
export async function pruneMultiDayRunsInDb(
  sources: string[],
  maxDays = 7,
): Promise<number> {
  if (!sources.length || maxDays < 1) return 0;
  const deleted = await db.execute(sql`
    WITH base AS (
      SELECT
        id,
        source,
        lower(title) AS title_key,
        coalesce(venue_name, '') AS venue_key,
        coalesce(city, '') AS city_key,
        starts_at,
        (starts_at AT TIME ZONE 'UTC')::date AS day,
        starts_at < now() - interval '12 hours' AS is_past
      FROM events
      WHERE source IN (${sql.join(
        sources.map((s) => sql`${s}`),
        sql`, `,
      )})
    ),
    within_day AS (
      SELECT id,
        row_number() OVER (
          PARTITION BY source, title_key, venue_key, city_key, day
          ORDER BY starts_at ASC
        ) AS within_day_rn
      FROM base
    ),
    upcoming_days AS (
      SELECT id,
        dense_rank() OVER (
          PARTITION BY source, title_key, venue_key, city_key
          ORDER BY day ASC
        ) AS day_rn
      FROM base
      WHERE NOT is_past
    ),
    doomed AS (
      SELECT id FROM base WHERE is_past
      UNION
      SELECT id FROM within_day WHERE within_day_rn > 1
      UNION
      SELECT id FROM upcoming_days WHERE day_rn > ${maxDays}
    )
    DELETE FROM events
    WHERE id IN (SELECT id FROM doomed)
    RETURNING id
  `);
  const rows = Array.isArray(deleted)
    ? deleted
    : ((deleted as { rows?: unknown[] }).rows ?? []);
  return rows.length;
}

/** Grace window before a past start is eligible for purge (hours). */
export const PAST_EVENT_GRACE_HOURS = 36;

/**
 * Delete calendar events that ended well in the past.
 * Skips durable / evergreen sources that use suggestion slots or schedules
 * (those are managed via replaceForSource).
 */
const PAST_PURGE_SKIP_SOURCES = new Set([
  "food",
  "food_deals",
  "activities",
  "new_restaurants",
  "recurring",
]);

export async function purgePastEvents(
  olderThanHours = PAST_EVENT_GRACE_HOURS,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600000);
  const deleted = await db
    .delete(events)
    .where(
      and(
        lt(events.startsAt, cutoff),
        notInArray(events.source, [...PAST_PURGE_SKIP_SOURCES]),
      ),
    )
    .returning({ id: events.id });
  return deleted.length;
}

export async function purgePastShowtimes(
  olderThanHours = 12,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanHours * 3600000);
  const deleted = await db
    .delete(showtimes)
    .where(lt(showtimes.startsAt, cutoff))
    .returning({ id: showtimes.id });
  return deleted.length;
}

/** Drop future showtimes that disappeared from TMS/indie feeds. */
export const SHOWTIME_STALE_DAYS = 3;

export async function purgeStaleShowtimes(
  maxStaleDays = SHOWTIME_STALE_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxStaleDays * 86400000);
  const deleted = await db
    .delete(showtimes)
    .where(lt(showtimes.lastSeenAt, cutoff))
    .returning({ id: showtimes.id });
  return deleted.length;
}

/** Drop evergreen tips whose lastSeenAt is older than the stale window. */
export async function purgeStaleEvergreenTips(
  maxStaleDays = EVERGREEN_TIP_STALE_DAYS,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxStaleDays * 86400000);

  const deletedCurated = await db
    .delete(events)
    .where(
      and(
        inArray(events.source, ["food", "activities", "new_restaurants"]),
        lt(events.lastSeenAt, cutoff),
      ),
    )
    .returning({ id: events.id });

  const deletedIg = await db
    .delete(events)
    .where(
      and(
        eq(events.source, "instagram"),
        sql`${events.categories} @> '["food"]'::jsonb`,
        lt(events.lastSeenAt, cutoff),
      ),
    )
    .returning({ id: events.id });

  return deletedCurated.length + deletedIg.length;
}

/**
 * Delete 19hz rows that duplicate RA / Eventbrite / Dice (shared ticket URL/id).
 * Feed merge remains as a safety net for any stragglers.
 */
export async function prune19hzPlatformTwins(): Promise<number> {
  const deleted = await db.execute(sql`
    DELETE FROM events AS hz
    WHERE hz.source = '19hz'
      AND EXISTS (
        SELECT 1 FROM events AS plat
        WHERE (
          (
            plat.source = 'ra'
            AND (
              (
                hz.url ~* 'ra\\.co/events/[0-9]+'
                AND plat.source_event_id = substring(hz.url from 'ra\\.co/events/([0-9]+)')
              )
              OR (plat.url IS NOT NULL AND hz.url IS NOT NULL AND plat.url = hz.url)
              OR (
                plat.source_event_id IS NOT NULL
                AND hz.url ILIKE '%ra.co/events/' || plat.source_event_id || '%'
              )
            )
          )
          OR (
            plat.source = 'eventbrite'
            AND (
              (
                hz.url ~* 'eventbrite\\.com/e/[^[:space:]]*-tickets-[0-9]+'
                AND plat.source_event_id = substring(
                  hz.url from 'eventbrite\\.com/e/[^[:space:]]*-tickets-([0-9]+)'
                )
              )
              OR (plat.url IS NOT NULL AND hz.url IS NOT NULL AND plat.url = hz.url)
              OR (
                plat.source_event_id IS NOT NULL
                AND hz.url ILIKE '%-tickets-' || plat.source_event_id || '%'
              )
            )
          )
          OR (
            plat.source = 'dice'
            AND (
              (
                hz.url ~* 'dice\\.fm(?:/partner/tickets)?/event/[a-z0-9]+'
                AND lower(plat.source_event_id) = lower(substring(
                  hz.url from 'dice\\.fm(?:/partner/tickets)?/event/([a-z0-9]+)'
                ))
              )
              OR (plat.url IS NOT NULL AND hz.url IS NOT NULL AND plat.url = hz.url)
              OR (
                plat.source_event_id IS NOT NULL
                AND hz.url ILIKE '%dice.fm%/event/' || plat.source_event_id || '%'
              )
            )
          )
        )
      )
    RETURNING hz.id
  `);
  const rows = Array.isArray(deleted)
    ? deleted
    : ((deleted as { rows?: unknown[] }).rows ?? []);
  return rows.length;
}

/** @deprecated Prefer prune19hzPlatformTwins */
export const prune19hzRaTwins = prune19hzPlatformTwins;

/** Rows per INSERT … ON CONFLICT batch (keeps bind params under Postgres limits). */
const EVENT_UPSERT_CHUNK = 75;
const SHOWTIME_UPSERT_CHUNK = 100;

export async function upsertEvents(list: NormalizedEvent[]): Promise<number> {
  if (!list.length) return 0;
  const now = new Date();
  const rows = list.map((ev) => ({
    source: ev.source,
    sourceEventId: ev.sourceEventId,
    kind: resolveEventKind({
      kind: ev.kind,
      source: ev.source,
      categories: ev.categories,
    }),
    title: ev.title,
    description: ev.description ?? null,
    startsAt: ev.startsAt,
    endsAt: ev.endsAt ?? null,
    timezone: ev.timezone ?? "America/Los_Angeles",
    venueName: ev.venueName ?? null,
    address: ev.address ?? null,
    neighborhood: ev.neighborhood ?? null,
    lat: ev.lat ?? null,
    lng: ev.lng ?? null,
    city: ev.city ?? "sf",
    priceMin: ev.priceMin ?? null,
    priceMax: ev.priceMax ?? null,
    isFree: ev.isFree ?? false,
    categories: ev.categories ?? [],
    tags: ev.tags ?? [],
    ageRestriction: ev.ageRestriction ?? null,
    url: ev.url ?? null,
    imageUrl: ev.imageUrl ?? null,
    organizer: ev.organizer ?? null,
    recurringShowId: ev.recurringShowId ?? null,
    registrationStatus: ev.registrationStatus ?? null,
    registrationCheckedAt: ev.registrationCheckedAt ?? null,
    rawPayload: ev.rawPayload ?? null,
    contentHash: eventContentHash(ev),
    lastSeenAt: now,
  }));

  for (let i = 0; i < rows.length; i += EVENT_UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + EVENT_UPSERT_CHUNK);
    await db
      .insert(events)
      .values(chunk)
      .onConflictDoUpdate({
        target: [events.source, events.sourceEventId],
        set: {
          title: sql`excluded.title`,
          kind: sql`excluded.kind`,
          // Preserve detail-page enrichment when listing scrape omits fields.
          description: sql`coalesce(excluded.description, ${events.description})`,
          startsAt: sql`excluded.starts_at`,
          endsAt: sql`excluded.ends_at`,
          venueName: sql`coalesce(excluded.venue_name, ${events.venueName})`,
          address: sql`coalesce(excluded.address, ${events.address})`,
          neighborhood: sql`coalesce(excluded.neighborhood, ${events.neighborhood})`,
          lat: sql`excluded.lat`,
          lng: sql`excluded.lng`,
          city: sql`excluded.city`,
          priceMin: sql`excluded.price_min`,
          priceMax: sql`excluded.price_max`,
          isFree: sql`excluded.is_free`,
          categories: sql`excluded.categories`,
          tags: sql`excluded.tags`,
          ageRestriction: sql`coalesce(excluded.age_restriction, ${events.ageRestriction})`,
          timezone: sql`coalesce(excluded.timezone, ${events.timezone})`,
          // Keep external Event Details CTA once set (non-funcheap url).
          url: sql`case
            when excluded.source = 'funcheap'
              and ${events.url} is not null
              and ${events.url} not like '%funcheap.com%'
            then ${events.url}
            else coalesce(excluded.url, ${events.url})
          end`,
          imageUrl: sql`coalesce(excluded.image_url, ${events.imageUrl})`,
          organizer: sql`coalesce(excluded.organizer, ${events.organizer})`,
          registrationStatus: sql`excluded.registration_status`,
          registrationCheckedAt: sql`excluded.registration_checked_at`,
          // Merge listing + prior detail enrichment (sourcePageUrl, eventDetailsUrl, …).
          rawPayload: sql`coalesce(excluded.raw_payload, '{}'::jsonb) || coalesce(${events.rawPayload}, '{}'::jsonb)`,
          contentHash: sql`excluded.content_hash`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
  }
  return list.length;
}

export async function upsertShowtimes(
  batches: NormalizedShowtimeBatch[],
): Promise<number> {
  let count = 0;
  const pendingShowtimes: {
    filmId: string;
    theaterId: string;
    startsAt: Date;
    format: string | null;
    ticketUrl: string | null;
    source: string;
    sourceShowtimeId: string;
    lastSeenAt: Date;
  }[] = [];
  const now = new Date();

  for (const batch of batches) {
    const source = batch.source ?? "tms";
    let filmId: string | undefined;

    if (batch.film.tmdbId) {
      const [byTmdb] = await db
        .select()
        .from(films)
        .where(eq(films.tmdbId, batch.film.tmdbId))
        .limit(1);
      filmId = byTmdb?.id;
    }
    if (!filmId && batch.film.imdbId) {
      const [byImdb] = await db
        .select()
        .from(films)
        .where(eq(films.imdbId, batch.film.imdbId))
        .limit(1);
      filmId = byImdb?.id;
    }
    // Prefer IMDb / title match when scrape did not set tmdb ids.
    if (!filmId) {
      const [byTitle] = await db
        .select()
        .from(films)
        .where(eq(films.title, batch.film.title))
        .limit(1);
      filmId = byTitle?.id;
    }

    const letterboxdUrl = batch.film.letterboxdUrl ?? null;

    if (!filmId) {
      const ratings = batch.film.ratings ?? {};
      const [created] = await db
        .insert(films)
        .values({
          title: batch.film.title,
          year: batch.film.year ?? null,
          runtimeMinutes: batch.film.runtimeMinutes ?? null,
          mpaa: batch.film.mpaa ?? null,
          synopsis: batch.film.synopsis ?? null,
          tmdbId: batch.film.tmdbId ?? null,
          imdbId: batch.film.imdbId ?? null,
          posterUrl: batch.film.posterUrl ?? null,
          backdropUrl: batch.film.backdropUrl ?? null,
          trailerYoutubeId: batch.film.trailerYoutubeId ?? null,
          genres: batch.film.genres ?? [],
          letterboxdUrl,
          rtUrl: batch.film.rtUrl ?? null,
          rtConsensus: batch.film.rtConsensus ?? null,
          reviews: batch.film.reviews ?? [],
          ratings,
          lastEnrichedAt: new Date(),
        })
        .returning();
      filmId = created!.id;
    } else {
      await db
        .update(films)
        .set({
          posterUrl: batch.film.posterUrl ?? undefined,
          backdropUrl: batch.film.backdropUrl ?? undefined,
          trailerYoutubeId: batch.film.trailerYoutubeId ?? null,
          synopsis: batch.film.synopsis ?? undefined,
          tmdbId: batch.film.tmdbId ?? undefined,
          imdbId: batch.film.imdbId ?? null,
          letterboxdUrl,
          rtUrl: batch.film.rtUrl ?? null,
          rtConsensus: batch.film.rtConsensus ?? null,
          reviews: batch.film.reviews ?? [],
          genres: batch.film.genres ?? undefined,
          ratings: batch.film.ratings ?? {},
          lastEnrichedAt: new Date(),
        })
        .where(eq(films.id, filmId));
    }

    const [theaterRow] = await db
      .insert(theaters)
      .values({
        name: batch.theater.name,
        chain: batch.theater.chain ?? null,
        address: batch.theater.address ?? null,
        neighborhood: batch.theater.neighborhood ?? null,
        lat: batch.theater.lat ?? null,
        lng: batch.theater.lng ?? null,
        sourceTheatreId: batch.theater.sourceTheatreId,
      })
      .onConflictDoUpdate({
        target: theaters.sourceTheatreId,
        set: {
          name: batch.theater.name,
          address: batch.theater.address ?? null,
          neighborhood: batch.theater.neighborhood ?? null,
          lat: batch.theater.lat ?? null,
          lng: batch.theater.lng ?? null,
        },
      })
      .returning();

    const theaterId =
      theaterRow?.id ??
      (
        await db
          .select()
          .from(theaters)
          .where(eq(theaters.sourceTheatreId, batch.theater.sourceTheatreId))
          .limit(1)
      )[0]?.id;

    if (!theaterId || !filmId) continue;

    for (const st of batch.showtimes) {
      pendingShowtimes.push({
        filmId,
        theaterId,
        startsAt: st.startsAt,
        format: st.format ?? null,
        ticketUrl: st.ticketUrl ?? null,
        source,
        sourceShowtimeId: st.sourceShowtimeId,
        lastSeenAt: now,
      });
    }
  }

  for (let i = 0; i < pendingShowtimes.length; i += SHOWTIME_UPSERT_CHUNK) {
    const chunk = pendingShowtimes.slice(i, i + SHOWTIME_UPSERT_CHUNK);
    await db
      .insert(showtimes)
      .values(chunk)
      .onConflictDoUpdate({
        target: [showtimes.source, showtimes.sourceShowtimeId],
        set: {
          startsAt: sql`excluded.starts_at`,
          ticketUrl: sql`excluded.ticket_url`,
          format: sql`excluded.format`,
          filmId: sql`excluded.film_id`,
          theaterId: sql`excluded.theater_id`,
          lastSeenAt: sql`excluded.last_seen_at`,
        },
      });
    count += chunk.length;
  }
  return count;
}

export async function runAdapter(adapter: SourceAdapter): Promise<number> {
  const [run] = await db
    .insert(ingestRuns)
    .values({ adapterId: adapter.id, status: "running" })
    .returning();

  try {
    console.log(`[ingest] starting ${adapter.id}`);
    const result = await adapter.fetch();
    let upserted = 0;
    if (result.events?.length) {
      upserted += await upsertEvents(result.events);
    }
    if (result.showtimes?.length) {
      upserted += await upsertShowtimes(result.showtimes);
    }
    if (result.replaceForSource) {
      const keepIds = (result.events ?? [])
        .filter((e) => e.source === result.replaceForSource)
        .map((e) => e.sourceEventId);
      const pruned = await replaceSourceEvents(result.replaceForSource, keepIds);
      if (pruned > 0) {
        console.log(
          `[ingest] ${adapter.id} pruned ${pruned} orphan ${result.replaceForSource} rows`,
        );
      }
    }
    if (result.deleteSourceEventIds?.length) {
      const pruned = await deleteSourceEventIds(result.deleteSourceEventIds);
      if (pruned > 0) {
        console.log(
          `[ingest] ${adapter.id} deleted ${pruned} coalesce/cap orphan ids`,
        );
      }
    }
    if (result.purgeLegacyCoalesceSources?.length) {
      const pruned = await purgeLegacyCoalesceSourceEventIds(
        result.purgeLegacyCoalesceSources,
      );
      if (pruned > 0) {
        console.log(
          `[ingest] ${adapter.id} purged ${pruned} legacy coalesce group-key rows`,
        );
      }
      const runPruned = await pruneMultiDayRunsInDb(
        result.purgeLegacyCoalesceSources,
        7,
      );
      if (runPruned > 0) {
        console.log(
          `[ingest] ${adapter.id} pruned ${runPruned} excess multi-day run rows`,
        );
      }
    }
    await db
      .update(ingestRuns)
      .set({
        status: "ok",
        finishedAt: new Date(),
        itemsUpserted: upserted,
      })
      .where(eq(ingestRuns.id, run!.id));
    console.log(`[ingest] ${adapter.id} upserted ${upserted}`);
    return upserted;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(ingestRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        error: message,
      })
      .where(eq(ingestRuns.id, run!.id));
    console.error(`[ingest] ${adapter.id} failed:`, message);
    return 0;
  }
}

export async function runAll(adapters: SourceAdapter[] = ALL_ADAPTERS) {
  let total = 0;
  for (const adapter of adapters) {
    total += await runAdapter(adapter);
  }
  const pruned19hz = await prune19hzPlatformTwins();
  const staleTips = await purgeStaleEvergreenTips();
  const pastEvents = await purgePastEvents();
  const pastShowtimes = await purgePastShowtimes();
  const staleShowtimes = await purgeStaleShowtimes();
  if (
    pruned19hz > 0 ||
    staleTips > 0 ||
    pastEvents > 0 ||
    pastShowtimes > 0 ||
    staleShowtimes > 0
  ) {
    console.log(
      `[ingest] GC pruned ${pruned19hz} 19hz platform twins, ${staleTips} stale tips, ${pastEvents} past events, ${pastShowtimes} past showtimes, ${staleShowtimes} stale showtimes`,
    );
  }
  return total;
}
