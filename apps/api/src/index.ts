import { serve } from "@hono/node-server";
import { db, events, films, outboundClicks, signals, showtimes, theaters, userProfiles, users } from "@bored/db";
import {
  FeedQuerySchema,
  INTEREST_CATEGORIES,
  NEIGHBORHOODS,
  SF_DEFAULT,
  CHI_DEFAULT,
  SignalInputSchema,
  UserPrefsSchema,
  affiliateConfigFromEnv,
  applyAffiliateAndUtm,
  calendarDayBounds,
  coalesceRaNineteenHz,
  CURATED_FEED_SOURCE_IDS,
  CURATED_ONLY_TIMED_SOURCES,
  enrichCategoriesWithTags,
  eventInArea,
  eventTimesPreview,
  expandSourceFilter,
  extractRaEventId,
  expandFoodDealRowsForFeed,
  expandRecurringRowsForFeed,
  filterCuratedFeedRows,
  foodDealScheduleFromPayload,
  locationDefaultForArea,
  mergeRaWithNineteenHz,
  metroFromArea,
  parseEventSources,
  parseFeedDate,
  foodRecommendationLabel,
  foodDealRecommendationLabel,
  activityRecommendationLabel,
  isFoodDealSource,
  isActivityRecommendationSource,
  stripInfatuationRatingTitle,
  FOUND_NON_FOOD_SECTIONS,
  extractFoundSectionHint,
  igFoodRecommendationLabel,
  isFoodRecommendationSource,
  isNewRestaurantRecommendationSource,
  matchesSourceFilter,
  matchesAnyFeedTopic,
  newRestaurantRecommendationLabel,
  parseFeedTopics,
  rankFeed,
  resolveEventKind,
  resolveEventOutboundUrl,
  type EventOutboundSlot,
  type Rankable,
  type UserPrefs,
} from "@bored/shared";

import { coalesceEventOccurrences } from "@bored/shared/coalesce";
import { config } from "dotenv";
import { and, asc, eq, gte, inArray, lt, lte, notInArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolve } from "node:path";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const DEMO_USER_ID =
  process.env.DEMO_USER_ID ?? "00000000-0000-4000-8000-000000000001";

type EventRow = typeof events.$inferSelect;

const app = new Hono();

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return process.env.WEB_ORIGIN ?? "http://localhost:3000";
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
      return process.env.WEB_ORIGIN ?? "http://localhost:3000";
    },
    allowHeaders: ["Content-Type", "X-User-Id"],
  }),
);

function userId(c: { req: { header: (n: string) => string | undefined } }) {
  return c.req.header("X-User-Id") ?? DEMO_USER_ID;
}

/** Curated tips — fetch fully when source-filtered (not capped by timed window). */
const CURATED_FEED_SOURCES = CURATED_FEED_SOURCE_IDS;

function mergeCuratedFeedRows(
  timedRows: EventRow[],
  curatedRows: EventRow[],
): EventRow[] {
  const seen = new Set(timedRows.map((r) => `${r.source}:${r.sourceEventId}`));
  const out = [...timedRows];
  for (const row of curatedRows) {
    const key = `${row.source}:${row.sourceEventId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

/** Food tips: keep Infatuation scores out of the title for rating badges. */
function presentEvent<T extends { source: string; title: string; rawPayload?: unknown }>(
  row: T,
): T {
  if (row.source !== "food") return row;
  const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
  const rating = typeof payload.rating === "number" ? payload.rating : null;
  return {
    ...row,
    title: stripInfatuationRatingTitle(row.title, rating),
  };
}

/** Find the cross-source twin for an RA or 19hz listing (shared ra.co URL). */
async function findRaNineteenHzTwin(
  row: EventRow,
): Promise<EventRow | null> {
  if (row.source === "19hz") {
    const raId = extractRaEventId(row.url);
    if (!raId) return null;
    const [twin] = await db
      .select()
      .from(events)
      .where(and(eq(events.source, "ra"), eq(events.sourceEventId, raId)))
      .limit(1);
    return twin ?? null;
  }

  if (row.source === "ra") {
    if (row.url) {
      const [byUrl] = await db
        .select()
        .from(events)
        .where(and(eq(events.source, "19hz"), eq(events.url, row.url)))
        .limit(1);
      if (byUrl) return byUrl;
    }
    if (row.sourceEventId) {
      const needle = `%ra.co/events/${row.sourceEventId}%`;
      const [byId] = await db
        .select()
        .from(events)
        .where(
          and(eq(events.source, "19hz"), sql`${events.url} ilike ${needle}`),
        )
        .limit(1);
      if (byId) return byId;
    }
  }

  return null;
}

async function getPrefs(uid: string): Promise<UserPrefs> {
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, uid))
    .limit(1);

  if (!profile) {
    return {
      interests: [],
      neighborhoods: [],
      budgetMax: null,
      preferFree: false,
      nightsOut: true,
      radiusMiles: SF_DEFAULT.radiusMiles,
      lat: SF_DEFAULT.lat,
      lng: SF_DEFAULT.lng,
    };
  }

  return {
    interests: (profile.interests ?? []) as UserPrefs["interests"],
    neighborhoods: profile.neighborhoods ?? [],
    budgetMax: profile.budgetMax,
    preferFree: profile.preferFree ?? false,
    nightsOut: profile.nightsOut ?? true,
    radiusMiles: profile.radiusMiles ?? SF_DEFAULT.radiusMiles,
    lat: profile.lat ?? SF_DEFAULT.lat,
    lng: profile.lng ?? SF_DEFAULT.lng,
  };
}

app.get("/health", (c) => c.json({ ok: true, service: "bored-api" }));

app.get("/v1/meta/taxonomy", (c) =>
  c.json({
    interests: INTEREST_CATEGORIES,
    neighborhoods: NEIGHBORHOODS,
    defaultLocation: SF_DEFAULT,
    locations: { sf: SF_DEFAULT, chicago: CHI_DEFAULT },
  }),
);

app.get("/v1/me", async (c) => {
  const uid = userId(c);
  const [user] = await db.select().from(users).where(eq(users.id, uid)).limit(1);
  const prefs = await getPrefs(uid);
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, uid))
    .limit(1);
  return c.json({
    user: user ?? { id: uid, email: null, displayName: "Guest" },
    prefs,
    onboardingComplete: profile?.onboardingComplete ?? false,
  });
});

app.put("/v1/me/interests", async (c) => {
  const uid = userId(c);
  let body: ReturnType<typeof UserPrefsSchema.parse>;
  try {
    body = UserPrefsSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: "Invalid prefs", detail: String(err) }, 400);
  }

  await db
    .insert(users)
    .values({ id: uid, displayName: "You" })
    .onConflictDoNothing();

  await db
    .insert(userProfiles)
    .values({
      userId: uid,
      interests: body.interests,
      neighborhoods: body.neighborhoods,
      budgetMax: body.budgetMax,
      preferFree: body.preferFree ?? false,
      nightsOut: body.nightsOut ?? true,
      radiusMiles: body.radiusMiles ?? SF_DEFAULT.radiusMiles,
      lat: body.lat ?? SF_DEFAULT.lat,
      lng: body.lng ?? SF_DEFAULT.lng,
      onboardingComplete: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userProfiles.userId,
      set: {
        interests: body.interests,
        neighborhoods: body.neighborhoods,
        budgetMax: body.budgetMax,
        preferFree: body.preferFree ?? false,
        nightsOut: body.nightsOut ?? true,
        radiusMiles: body.radiusMiles ?? SF_DEFAULT.radiusMiles,
        lat: body.lat ?? SF_DEFAULT.lat,
        lng: body.lng ?? SF_DEFAULT.lng,
        onboardingComplete: true,
        updatedAt: new Date(),
      },
    });

  return c.json({ ok: true, prefs: body, onboardingComplete: true });
});

app.post("/v1/me/signals", async (c) => {
  const uid = userId(c);
  const body = SignalInputSchema.parse(await c.req.json());
  await db.insert(users).values({ id: uid }).onConflictDoNothing();
  const [row] = await db
    .insert(signals)
    .values({
      userId: uid,
      targetKind: body.targetKind,
      targetId: body.targetId,
      type: body.type,
    })
    .returning();
  return c.json(row);
});

app.get("/v1/events", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const category = c.req.query("category");
  const freeOnly = c.req.query("freeOnly") === "true";
  const now = new Date();

  let rows = await db
    .select()
    .from(events)
    .where(gte(events.startsAt, now))
    .orderBy(asc(events.startsAt))
    .limit(limit * 2);

  if (category) {
    rows = rows.filter((e) => (e.categories as string[]).includes(category));
  }
  if (freeOnly) {
    rows = rows.filter((e) => e.isFree);
  }

  return c.json({ events: rows.slice(0, limit) });
});

app.get("/v1/events/:id", async (c) => {
  const [row] = await db
    .select()
    .from(events)
    .where(eq(events.id, c.req.param("id")))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  // Luma: lazy description + fresh ticketing on detail open (single event/get call).
  if (row.source === "luma") {
    const checked = row.registrationCheckedAt?.getTime() ?? 0;
    const staleMs = 10 * 60 * 1000;
    const needsDescription = !row.description?.trim();
    const needsRegistrationRefresh = Date.now() - checked > staleMs;
    if (needsDescription || needsRegistrationRefresh) {
      try {
        const { refreshLumaEvent } = await import("@bored/ingest");
        const fresh = await refreshLumaEvent(row.sourceEventId);
        if (fresh) {
          const [updated] = await db
            .update(events)
            .set({
              description: fresh.description ?? row.description,
              imageUrl: fresh.imageUrl ?? row.imageUrl,
              registrationStatus: fresh.registrationStatus,
              registrationCheckedAt: fresh.registrationCheckedAt,
              isFree: fresh.isFree,
              priceMin: fresh.priceMin,
              priceMax: fresh.priceMax,
              city: fresh.city,
              neighborhood: fresh.neighborhood,
              address: fresh.address ?? row.address,
              lat: fresh.lat,
              lng: fresh.lng,
            })
            .where(eq(events.id, row.id))
            .returning();
          if (updated) return c.json(presentEvent(updated));
        }
      } catch (err) {
        console.warn("[events/:id] luma refresh failed", err);
      }
    }
  }

  // RA ↔ 19hz: prefer RA lineup/flyer; enrich genre tags from 19hz twin.
  if (row.source === "19hz" || row.source === "ra") {
    const twin = await findRaNineteenHzTwin(row);
    if (twin) {
      const merged =
        row.source === "ra"
          ? mergeRaWithNineteenHz(row, twin)
          : mergeRaWithNineteenHz(twin, row);
      return c.json(presentEvent(merged));
    }
  }

  // Funcheap: pull blurb, poster, categories + external "Event Details" link.
  if (row.source === "funcheap") {
    const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
    const funcheapPage =
      typeof payload.sourcePageUrl === "string" && payload.sourcePageUrl
        ? payload.sourcePageUrl
        : row.url && /funcheap\.com/i.test(row.url)
          ? row.url
          : null;
    const cats = (row.categories as string[]) ?? [];
    const sparseCategories =
      cats.length === 0 || (cats.length === 1 && cats[0] === "free");
    const needsEnrich =
      funcheapPage &&
      (!row.description ||
        !row.imageUrl ||
        sparseCategories ||
        !(row.tags as string[])?.some((t) => t !== "funcheap" && t !== "rss"));
    if (needsEnrich) {
      try {
        const { enrichFuncheapEvent } = await import("@bored/ingest");
        const fresh = await enrichFuncheapEvent(funcheapPage, {
          title: row.title,
        });
        if (fresh) {
          const [updated] = await db
            .update(events)
            .set({
              description: fresh.description ?? row.description,
              url: fresh.eventDetailsUrl ?? row.url,
              venueName: fresh.venueName ?? row.venueName,
              address: fresh.address ?? row.address,
              neighborhood: fresh.neighborhood ?? row.neighborhood,
              imageUrl: fresh.imageUrl ?? row.imageUrl,
              categories:
                fresh.categories.length > 0 ? fresh.categories : row.categories,
              tags: fresh.tags.length > 0 ? fresh.tags : row.tags,
              rawPayload: {
                ...payload,
                sourcePageUrl: fresh.sourcePageUrl,
                eventDetailsUrl: fresh.eventDetailsUrl,
                enrichedAt: new Date().toISOString(),
              },
            })
            .where(eq(events.id, row.id))
            .returning();
          if (updated) return c.json(presentEvent(updated));
        }
      } catch (err) {
        console.warn("[events/:id] funcheap enrich failed", err);
      }
    }
  }

  // Chicago on the Cheap: editorial blurb, hero image, structured venue/address.
  if (row.source === "chicago_cheap") {
    const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
    const sourcePage =
      typeof payload.sourcePageUrl === "string" && payload.sourcePageUrl
        ? payload.sourcePageUrl
        : row.url && /chicagoonthecheap\.com/i.test(row.url)
          ? row.url
          : null;
    const needsEnrich =
      sourcePage && (!row.description?.trim() || !row.imageUrl || !row.address);
    if (needsEnrich) {
      try {
        const { enrichChicagoCheapEvent } = await import("@bored/ingest");
        const fresh = await enrichChicagoCheapEvent(sourcePage, {
          title: row.title,
        });
        if (fresh) {
          const [updated] = await db
            .update(events)
            .set({
              description: fresh.description ?? row.description,
              venueName: fresh.venueName ?? row.venueName,
              address: fresh.address ?? row.address,
              imageUrl: fresh.imageUrl ?? row.imageUrl,
              isFree: fresh.isFree ?? row.isFree,
              categories:
                fresh.categories.length > 0 ? fresh.categories : row.categories,
              tags: fresh.tags.length > 0 ? fresh.tags : row.tags,
              rawPayload: {
                ...payload,
                sourcePageUrl: fresh.sourcePageUrl,
                enrichedAt: new Date().toISOString(),
              },
            })
            .where(eq(events.id, row.id))
            .returning();
          if (updated) return c.json(presentEvent(updated));
        }
      } catch (err) {
        console.warn("[events/:id] chicago_cheap enrich failed", err);
      }
    }
  }

  // Food tips + deals: editorial writeup, photo, byline (all outlets).
  if (
    (row.source === "food" || row.source === "food_deals") &&
    row.url
  ) {
    try {
      const { enrichFoodEventDetail } = await import("@bored/ingest");
      const fresh = await enrichFoodEventDetail(row);
      if (fresh) {
        const [updated] = await db
          .update(events)
          .set({
            ...(fresh.title != null ? { title: fresh.title } : {}),
            ...(fresh.description != null
              ? { description: fresh.description }
              : {}),
            ...(fresh.imageUrl != null ? { imageUrl: fresh.imageUrl } : {}),
            ...(fresh.venueName != null ? { venueName: fresh.venueName } : {}),
            ...(fresh.address != null ? { address: fresh.address } : {}),
            ...(fresh.neighborhood != null
              ? { neighborhood: fresh.neighborhood }
              : {}),
            ...(fresh.lat != null ? { lat: fresh.lat } : {}),
            ...(fresh.lng != null ? { lng: fresh.lng } : {}),
            ...(fresh.organizer != null ? { organizer: fresh.organizer } : {}),
            ...(fresh.priceMin != null ? { priceMin: fresh.priceMin } : {}),
            ...(fresh.priceMax != null ? { priceMax: fresh.priceMax } : {}),
            ...(fresh.tags != null ? { tags: fresh.tags } : {}),
            ...(fresh.categories != null
              ? { categories: fresh.categories }
              : {}),
            rawPayload: {
              ...((row.rawPayload as Record<string, unknown> | null) ?? {}),
              ...((fresh.rawPayload as Record<string, unknown> | null) ?? {}),
            },
          })
          .where(eq(events.id, row.id))
          .returning();
        if (updated) return c.json(presentEvent(updated));
      }
    } catch (err) {
      console.warn("[events/:id] food enrich failed", err);
    }
  }

  return c.json(presentEvent(row));
});

app.get("/v1/movies", async (c) => {
  const rows = await db.select().from(films).limit(100);
  return c.json({ films: rows });
});

app.get("/v1/movies/:id", async (c) => {
  const [film] = await db
    .select()
    .from(films)
    .where(eq(films.id, c.req.param("id")))
    .limit(1);
  if (!film) return c.json({ error: "Not found" }, 404);

  const date = c.req.query("date");
  const start = date ? new Date(`${date}T00:00:00`) : new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const shows = await db
    .select({
      showtime: showtimes,
      theater: theaters,
    })
    .from(showtimes)
    .innerJoin(theaters, eq(showtimes.theaterId, theaters.id))
    .where(
      and(
        eq(showtimes.filmId, film.id),
        gte(showtimes.startsAt, start),
        lte(showtimes.startsAt, end),
      ),
    )
    .orderBy(asc(showtimes.startsAt));

  return c.json({
    film,
    showtimes: shows.map((s) => ({
      ...s.showtime,
      theater: s.theater,
    })),
  });
});

app.get("/v1/movies/showtimes", async (c) => {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const rows = await db
    .select({
      showtime: showtimes,
      film: films,
      theater: theaters,
    })
    .from(showtimes)
    .innerJoin(films, eq(showtimes.filmId, films.id))
    .innerJoin(theaters, eq(showtimes.theaterId, theaters.id))
    .where(and(gte(showtimes.startsAt, now), lte(showtimes.startsAt, end)))
    .orderBy(asc(showtimes.startsAt))
    .limit(200);

  return c.json({ showtimes: rows });
});

app.get("/v1/feed", async (c) => {
  try {
  const uid = userId(c);
  const rawDate = parseFeedDate(c.req.query("date"));
  const query = FeedQuerySchema.parse({
    mode: c.req.query("mode") ?? "for_you",
    area: c.req.query("area") ?? "bay",
    lat: c.req.query("lat"),
    lng: c.req.query("lng"),
    radiusMiles: c.req.query("radiusMiles"),
    categories: c.req.query("categories"),
    topics: c.req.query("topics"),
    sources: c.req.query("sources"),
    freeOnly: c.req.query("freeOnly"),
    date: rawDate ?? undefined,
    limit:
      c.req.query("limit") ??
      (c.req.query("mode") === "all" || rawDate ? 200 : 40),
  });

  const prefs = await getPrefs(uid);
  const locDefault = locationDefaultForArea(query.area);
  // When browsing another metro, center ranking on that metro unless the client
  // explicitly passed lat/lng.
  if (query.lat != null) prefs.lat = query.lat;
  else if (metroFromArea(query.area) !== "sf") prefs.lat = locDefault.lat;
  if (query.lng != null) prefs.lng = query.lng;
  else if (metroFromArea(query.area) !== "sf") prefs.lng = locDefault.lng;
  if (query.radiusMiles != null) prefs.radiusMiles = query.radiusMiles;
  // Personalized modes: widen radius for bay area so Oakland/Berkeley aren't dropped
  if (query.area === "bay" && (prefs.radiusMiles ?? 15) < 35) {
    prefs.radiusMiles = 35;
  }
  if (query.area === "chicago" && (prefs.radiusMiles ?? 15) < 25) {
    prefs.radiusMiles = 25;
  }

  const now = new Date();
  const dayDate = parseFeedDate(query.date);
  let windowStart = now;
  let windowEnd = new Date(now);
  let exclusiveEnd = false;

  if (dayDate) {
    const bounds = calendarDayBounds(dayDate, locDefault.timezone);
    // Full local calendar day (including earlier). Client collapses past
    // non-live rows behind “View earlier” when browsing today.
    windowStart = bounds.start;
    windowEnd = bounds.end;
    exclusiveEnd = true;
  } else if (query.mode === "tonight") {
    windowEnd.setHours(23, 59, 59, 999);
    if (windowEnd.getTime() - now.getTime() < 3 * 3600000) {
      windowEnd = new Date(now.getTime() + 18 * 3600000);
    }
  } else if (query.mode === "weekend") {
    windowEnd = new Date(now.getTime() + 5 * 86400000);
  } else if (query.mode === "all") {
    windowEnd = new Date(now.getTime() + 30 * 86400000);
  } else {
    windowEnd = new Date(now.getTime() + 14 * 86400000);
  }

  const fetchLimit = query.mode === "all" || dayDate ? 500 : 300;
  const startsInWindow = exclusiveEnd
    ? and(gte(events.startsAt, windowStart), lt(events.startsAt, windowEnd))
    : and(gte(events.startsAt, windowStart), lte(events.startsAt, windowEnd));

  const topicFilter = parseFeedTopics(query.topics);

  const sourceFilter = (() => {
    const selected = parseEventSources(query.sources);
    if (!selected.length) return null;
    return expandSourceFilter(selected);
  })();

  const curatedSourceSet = new Set<string>();
  if (sourceFilter) {
    for (const s of sourceFilter) {
      if ((CURATED_FEED_SOURCES as readonly string[]).includes(s)) {
        curatedSourceSet.add(s);
      }
    }
    if (sourceFilter.has("food")) {
      curatedSourceSet.add("instagram");
    }
  }
  if (topicFilter.includes("activities")) {
    curatedSourceSet.add("activities");
  }
  if (topicFilter.includes("food") || topicFilter.includes("happy_hours")) {
    curatedSourceSet.add("food");
    curatedSourceSet.add("food_deals");
    curatedSourceSet.add("new_restaurants");
  }
  if (topicFilter.includes("comedy")) {
    curatedSourceSet.add("recurring");
  }
  const curatedInFilter = [...curatedSourceSet];

  const activitiesTopicOnly =
    !sourceFilter &&
    topicFilter.length === 1 &&
    topicFilter[0] === "activities";

  const needsTimedQuery =
    !activitiesTopicOnly &&
    (!sourceFilter ||
      [...sourceFilter].some(
        (s) => !(CURATED_FEED_SOURCES as readonly string[]).includes(s),
      ));

  let eventRows: EventRow[] = [];
  if (needsTimedQuery) {
    eventRows = await db
      .select()
      .from(events)
      .where(
        and(
          startsInWindow,
          notInArray(events.source, [...CURATED_ONLY_TIMED_SOURCES]),
          // Evergreen tips use kind=recommendation (also excluded by source).
          sql`${events.kind} <> 'recommendation'`,
        ),
      )
      .orderBy(asc(events.startsAt))
      .limit(fetchLimit);
  }

  if (curatedInFilter.length) {
    const curatedRows = filterCuratedFeedRows(
      await db
        .select()
        .from(events)
        .where(inArray(events.source, curatedInFilter))
        .orderBy(asc(events.title)),
      query.area,
      { now },
    );
    eventRows = mergeCuratedFeedRows(eventRows, curatedRows);
  }

  const categoryFilter = query.categories
    ? query.categories.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  // Collapse RA + 19hz duplicates when RA is in play (shared ra.co URL).
  // Prefer RA lineup/flyer; pull genre tags from the 19hz twin. Skip when the
  // user filtered to 19hz-only so those cards aren't dropped.
  const wantsRa = !sourceFilter || sourceFilter.has("ra");
  const coalescedRows = expandRecurringRowsForFeed(
    expandFoodDealRowsForFeed(
      coalesceEventOccurrences(
        wantsRa ? coalesceRaNineteenHz(eventRows) : eventRows,
      ),
      {
        mode: query.mode,
        windowStart,
        windowEnd,
      },
    ),
    {
      mode: query.mode,
      windowStart,
      windowEnd,
    },
  );

  const rankables: Rankable[] = coalescedRows
    .filter((e) => {
      if (query.freeOnly && !e.isFree) return false;
      if (sourceFilter && !matchesSourceFilter(
        { source: e.source, categories: e.categories as string[] },
        sourceFilter,
      )) {
        return false;
      }
      if (
        !eventInArea(query.area, {
          city: e.city,
          neighborhood: e.neighborhood,
        })
      ) {
        return false;
      }
      if (e.source === "food") {
        const payload =
          (e.rawPayload as Record<string, unknown> | null | undefined) ?? null;
        const sectionKey =
          typeof payload?.sectionKey === "string"
            ? payload.sectionKey.toLowerCase()
            : extractFoundSectionHint(
                [
                  typeof payload?.subtitle === "string" ? payload.subtitle : "",
                  e.description ?? "",
                ].join("\n"),
              )?.sectionKey;
        if (sectionKey && FOUND_NON_FOOD_SECTIONS.has(sectionKey)) {
          return false;
        }
      }
      if (categoryFilter && categoryFilter.length) {
        const cats = enrichCategoriesWithTags(
          e.categories as string[],
          (e.tags as string[]) ?? [],
        );
        if (!cats.some((cat) => categoryFilter.includes(cat))) return false;
      }
      if (topicFilter.length) {
        const payload =
          (e.rawPayload as Record<string, unknown> | null | undefined) ?? null;
        if (
          !matchesAnyFeedTopic(topicFilter, {
            kind: "event",
            categories: enrichCategoriesWithTags(
              e.categories as string[],
              (e.tags as string[]) ?? [],
            ),
            tags: (e.tags as string[]) ?? [],
            isFree: e.isFree ?? undefined,
            source: e.source,
            title: e.title,
            venueName: e.venueName,
            rawPayload: payload,
          })
        ) {
          return false;
        }
      }
      return true;
    })
    .map((e) => {
      const tags = (e.tags as string[]) ?? [];
      const payload =
        (e.rawPayload as Record<string, unknown> | null | undefined) ?? null;
      const isFood = isFoodRecommendationSource(
        e.source,
        e.categories as string[],
      );
      const isNewRestaurant = isNewRestaurantRecommendationSource(e.source);
      const isActivity = isActivityRecommendationSource(e.source);
      const isFoodDeal = isFoodDealSource(e.source);
      const infatuationRating =
        (e.source === "food" || isFoodDeal || isNewRestaurant) &&
        typeof payload?.rating === "number" &&
        payload.rating > 0
          ? payload.rating
          : null;
      const title =
        e.source === "food"
          ? stripInfatuationRatingTitle(e.title, infatuationRating)
          : e.title;
      const recommendationLabel = isFoodDeal
        ? foodDealRecommendationLabel({
            dealKind:
              payload?.dealKind === "lunch" ? "lunch" : "happy_hour",
            sources: Array.isArray(payload?.sources)
              ? (payload.sources as Parameters<
                  typeof foodDealRecommendationLabel
                >[0]["sources"])
              : null,
            schedule: foodDealScheduleFromPayload(payload),
          })
        : isNewRestaurant
          ? newRestaurantRecommendationLabel({ rawPayload: payload })
          : isActivity
            ? activityRecommendationLabel({ rawPayload: payload })
            : isFood
              ? e.source === "instagram"
                ? igFoodRecommendationLabel(
                    typeof payload?.handle === "string"
                      ? payload.handle
                      : (tags.find(
                          (t) =>
                            !["instagram", "reel", "video", "food"].includes(t),
                        ) ?? "instagram"),
                    typeof payload?.mediaType === "string"
                      ? payload.mediaType
                      : null,
                  )
                : foodRecommendationLabel({
                    tags,
                    rawPayload: payload,
                    description: e.description,
                  })
              : null;

      return {
        id: e.id,
        kind: resolveEventKind({
          kind: e.kind,
          source: e.source,
          categories: e.categories as string[],
        }),
        title,
        categories: enrichCategoriesWithTags(e.categories as string[], tags),
        tags,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        lat: e.lat,
        lng: e.lng,
        isFree: e.isFree,
        priceMin: e.priceMin,
        neighborhood: e.neighborhood,
        venueName: e.venueName,
        imageUrl: e.imageUrl,
        url: e.url,
        subtitle: e.venueName,
        city: e.city,
        source: e.source,
        registrationStatus: e.registrationStatus as Rankable["registrationStatus"],
        sourceTrust:
          e.source === "recurring"
            ? 0.75
            : isFoodDeal
              ? 0.92
              : isNewRestaurant
                ? 0.9
                : isActivity
                  ? 0.88
                  : 0.85,
        recommendationLabel,
        showtimesPreview: eventTimesPreview(e, e.venueName),
        ratings:
          infatuationRating != null
            ? { infatuation: infatuationRating }
            : undefined,
      };
    });

  // Group showtimes by film for movie cards.
  // Unfiltered feed includes TMS + indie; Indie theater chip includes only those showtimes.
  // Movies ingest is SF-scoped today — skip when browsing Chicago.
  const includeMovies =
    metroFromArea(query.area) === "sf" &&
    (!sourceFilter || sourceFilter.has("indie_theater")) &&
    (!categoryFilter ||
      categoryFilter.some((c) => c.startsWith("movies"))) &&
    (!topicFilter.length || topicFilter.includes("movies"));

  if (includeMovies) {
    const showsInWindow = exclusiveEnd
      ? and(
          gte(showtimes.startsAt, windowStart),
          lt(showtimes.startsAt, windowEnd),
        )
      : and(
          gte(showtimes.startsAt, windowStart),
          lte(showtimes.startsAt, windowEnd),
        );
    const showRows = await db
      .select({
        showtime: showtimes,
        film: films,
        theater: theaters,
      })
      .from(showtimes)
      .innerJoin(films, eq(showtimes.filmId, films.id))
      .innerJoin(theaters, eq(showtimes.theaterId, theaters.id))
      .where(showsInWindow)
      .orderBy(asc(showtimes.startsAt))
      .limit(400);

    const byFilm = new Map<
      string,
      {
        film: (typeof showRows)[0]["film"];
        shows: typeof showRows;
      }
    >();
    for (const row of showRows) {
      if (sourceFilter && !sourceFilter.has(row.showtime.source)) continue;
      if (
        !eventInArea(query.area, {
          city: "sf",
          neighborhood: row.theater.neighborhood,
        })
      ) {
        continue;
      }
      const cur = byFilm.get(row.film.id) ?? { film: row.film, shows: [] };
      cur.shows.push(row);
      byFilm.set(row.film.id, cur);
    }

    for (const { film, shows } of byFilm.values()) {
      const first = shows[0]!;
      const genres = (film.genres as string[]) ?? [];
      const categories = [
        "movies",
        ...genres.map((g) =>
          /indie|drama|foreign|arthouse|documentary/i.test(g)
            ? "movies.arthouse"
            : /action|adventure|superhero|blockbuster/i.test(g)
              ? "movies.blockbuster"
              : "movies",
        ),
        ...genres,
      ];
      rankables.push({
        id: `film:${film.id}`,
        kind: "movie_showtime",
        title: film.title,
        categories: [...new Set(categories)],
        tags: genres.length ? genres : undefined,
        startsAt: first.showtime.startsAt,
        lat: first.theater.lat,
        lng: first.theater.lng,
        neighborhood: first.theater.neighborhood,
        venueName: first.theater.name,
        imageUrl: film.posterUrl,
        url: film.letterboxdUrl,
        subtitle: first.theater.name,
        filmId: film.id,
        city: "sf",
        source: first.showtime.source,
        ratings: film.ratings as Rankable["ratings"],
        showtimesPreview: shows.slice(0, 3).map((s) => ({
          startsAt: s.showtime.startsAt.toISOString(),
          theaterName: s.theater.name,
          ticketUrl: s.showtime.ticketUrl,
        })),
        sourceTrust: 0.9,
      });
    }
  }

  const userSignals = await db
    .select()
    .from(signals)
    .where(eq(signals.userId, uid))
    .limit(500);

  const dismissedIds = new Set(
    userSignals.filter((s) => s.type === "dismissed").map((s) => s.targetId),
  );
  for (const s of userSignals) {
    if (s.type === "dismissed" && s.targetKind === "film") {
      dismissedIds.add(`film:${s.targetId}`);
    }
  }
  const savedBoostIds = new Set(
    userSignals
      .filter((s) => s.type === "saved" || s.type === "going")
      .map((s) => (s.targetKind === "film" ? `film:${s.targetId}` : s.targetId)),
  );

  const chronological = query.mode === "all" || Boolean(dayDate);
  const cards = rankFeed(
    rankables,
    {
      prefs,
      now,
      dismissedIds,
      savedBoostIds,
      showAll: chronological,
    },
    chronological ? "all" : query.mode,
    query.limit,
  );

  return c.json({
    mode: query.mode,
    area: query.area,
    date: dayDate,
    generatedAt: now.toISOString(),
    prefsSummary: {
      interests: prefs.interests.map((i) => i.category),
      neighborhoods: prefs.neighborhoods,
      budgetMax: prefs.budgetMax,
    },
    cards,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[feed]", message);
    return c.json({ error: "Feed failed", message }, 500);
  }
});

app.get("/v1/me/saved", async (c) => {
  const uid = userId(c);
  const saved = await db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, uid), inArray(signals.type, ["saved", "going"])))
    .orderBy(sql`${signals.createdAt} desc`)
    .limit(100);
  return c.json({ signals: saved });
});

const affiliateConfig = affiliateConfigFromEnv();

function parseOutboundSlot(raw: string | undefined): EventOutboundSlot {
  return raw === "secondary" ? "secondary" : "primary";
}

/** Fire-and-forget click log — never block the redirect on insert failure. */
function logOutboundClick(row: {
  targetKind: "event" | "showtime";
  targetId: string;
  slot: string;
  destinationHost: string | null;
  affiliateNetwork: string | null;
  city: string | null;
  source: string | null;
  userId: string | null;
}) {
  void db
    .insert(outboundClicks)
    .values({
      targetKind: row.targetKind,
      targetId: row.targetId,
      slot: row.slot,
      destinationHost: row.destinationHost,
      affiliateNetwork: row.affiliateNetwork,
      city: row.city,
      source: row.source,
      userId: row.userId,
    })
    .catch((err) => {
      console.error("[outbound] click log failed", err);
    });
}

/**
 * Event CTA redirect — destination from DB only (open-redirect safe).
 * Applies affiliate ids + UTMs, logs click, 302.
 */
app.get("/r/e/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  const slot = parseOutboundSlot(c.req.query("slot"));

  const [row] = await db
    .select({
      id: events.id,
      url: events.url,
      source: events.source,
      city: events.city,
      rawPayload: events.rawPayload,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .limit(1);

  if (!row) return c.json({ error: "Not found" }, 404);

  const destination = resolveEventOutboundUrl(
    {
      url: row.url,
      rawPayload: (row.rawPayload ?? null) as Record<string, unknown> | null,
    },
    slot,
  );
  if (!destination) {
    return c.json({ error: "No outbound URL for this slot" }, 404);
  }

  const rewritten = applyAffiliateAndUtm(destination, affiliateConfig);
  const uidHeader = c.req.header("X-User-Id");
  logOutboundClick({
    targetKind: "event",
    targetId: row.id,
    slot,
    destinationHost: rewritten.host,
    affiliateNetwork: rewritten.network,
    city: row.city,
    source: row.source,
    userId: uidHeader && /^[0-9a-f-]{36}$/i.test(uidHeader) ? uidHeader : null,
  });

  return c.redirect(rewritten.url, 302);
});

/** Showtime ticket redirect — destination from showtimes.ticketUrl only. */
app.get("/r/s/:showtimeId", async (c) => {
  const showtimeId = c.req.param("showtimeId");

  const [row] = await db
    .select({
      id: showtimes.id,
      ticketUrl: showtimes.ticketUrl,
      source: showtimes.source,
    })
    .from(showtimes)
    .where(eq(showtimes.id, showtimeId))
    .limit(1);

  if (!row?.ticketUrl) return c.json({ error: "Not found" }, 404);

  const rewritten = applyAffiliateAndUtm(row.ticketUrl, affiliateConfig);
  const uidHeader = c.req.header("X-User-Id");
  logOutboundClick({
    targetKind: "showtime",
    targetId: row.id,
    slot: "tickets",
    destinationHost: rewritten.host,
    affiliateNetwork: rewritten.network,
    city: null,
    source: row.source,
    userId: uidHeader && /^[0-9a-f-]{36}$/i.test(uidHeader) ? uidHeader : null,
  });

  return c.redirect(rewritten.url, 302);
});

const port = Number(process.env.API_PORT ?? 4000);

serve({ fetch: app.fetch, port }, () => {
  console.log(`bored api listening on :${port}`);
});

export default app;
