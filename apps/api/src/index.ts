import { serve } from "@hono/node-server";
import { db, events, feedDemotionRules, films, outboundClicks, signals, showtimes, theaters, userProfiles, users } from "@bored/db";
import {
  FeedQuerySchema,
  INTEREST_CATEGORIES,
  CHI_NEIGHBORHOODS,
  LA_NEIGHBORHOODS,
  NEIGHBORHOODS,
  SF_DEFAULT,
  CHI_DEFAULT,
  LA_DEFAULT,
  MagicLinkRequestSchema,
  SignalInputSchema,
  UserPrefsSchema,
  affiliateConfigFromEnv,
  applyAffiliateAndUtm,
  calendarDayBounds,
  dayKey,
  coalesceMusicPlatformNineteenHz,
  CURATED_FEED_SOURCE_IDS,
  CURATED_ONLY_TIMED_SOURCES,
  enrichCategoriesWithTags,
  eventInArea,
  eventTimesPreview,
  FEED_TIMES_PREVIEW_LIMIT,
  exhibitionScheduleFromPayload,
  expandSourceFilter,
  extractMusicPlatformRef,
  expandFoodDealRowsForFeed,
  expandExhibitionRowsForFeed,
  expandRecurringRowsForFeed,
  filterCuratedFeedRows,
  foodDealScheduleFromPayload,
  nextFoodDealOccurrence,
  formatDailyHoursLabel,
  dailyHoursFromPayload,
  isTimeTbaTag,
  isMusicTicketPlatform,
  locationDefaultForArea,
  legacyBudgetMaxToTier,
  mergePlatformWithNineteenHz,
  metroFromArea,
  MUSIC_TICKET_PLATFORMS,
  normalizeBudgetPrefs,
  parseBudgetTier,
  parseEventSources,
  parseFeedDate,
  foodRecommendationLabel,
  foodDealRecommendationLabel,
  activityRecommendationLabel,
  isFoodDealSource,
  resolveFoodDealImageUrl,
  isActivityRecommendationSource,
  isTheaterRecommendationSource,
  theaterRecommendationLabel,
  stripInfatuationRatingTitle,
  FOUND_NON_FOOD_SECTIONS,
  resolveEventCoords,
  extractFoundSectionHint,
  igFoodRecommendationLabel,
  ytVideoRecommendationLabel,
  feedVideoPosterUrl,
  youtubeThumbnailUrl,
  isFoodRecommendationSource,
  isNewRestaurantRecommendationSource,
  matchesSourceFilter,
  matchesAnyFeedTopic,
  newRestaurantRecommendationLabel,
  parseFeedTopics,
  rankFeed,
  rankForYouTopicFeed,
  resolveEventKind,
  resolveEventOutboundUrl,
  injectSponsoredIntoFeed,
  isSponsoredActive,
  isFeedVideo,
  isFeedVideoRankable,
  isVideoContentLocalToMetro,
  videoLocalityText,
  videoMetroFromFeedArea,
  FEED_VIDEO_CAROUSEL_LIMIT,
  FEED_VIDEO_CACHE_POOL_LIMIT,
  FEED_VIDEO_FETCH_LIMIT,
  FEED_CURATED_FETCH_LIMIT,
  VIDEO_IMPRESS_TTL_MS,
  VIDEO_OPENED_TTL_MS,
  rankVideoCarousel,
  personalizeVideoCarouselCards,
  isFeedVideoCard,
  feedTopicsFullyCoveredByAll,
  feedTopicsNeedServerEnrich,
  type EventOutboundSlot,
  type FeedCard,
  type Rankable,
  upgradeFuncheapImageUrl,
  type UserPrefs,
} from "@bored/shared";

import { coalesceEventOccurrences } from "@bored/shared/coalesce";
import { config } from "dotenv";
import { and, asc, desc, eq, gt, gte, inArray, isNotNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { resolve } from "node:path";
import { Readable } from "node:stream";
import type { IncomingMessage } from "node:http";
import { adminApp } from "./admin.js";
import {
  requestMagicLink,
  resolveAuthenticatedUserId,
  resolveUserId as resolveRequestUserId,
  revokeSession,
  verifyMagicLink,
} from "./auth.js";
import {
  getTodayFeedCache,
  setTodayFeedCache,
  shouldCacheTodayFeed,
  todayFeedCacheKey,
} from "./feedCache.js";
import { resolveGeo } from "./geo.js";
import { resolveIgAccessToken } from "@bored/ingest/meta";

config({ path: resolve(process.cwd(), "../../.env") });
config();

const DEFAULT_DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const DEMO_USER_ID =
  process.env.DEMO_USER_ID?.trim() || DEFAULT_DEMO_USER_ID;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventRow = typeof events.$inferSelect;

const app = new Hono();

/** Localhost + RFC1918 LAN (phone-on-Wi‑Fi testing via `pnpm dev:mobile`). */
const LOCAL_DEV_ORIGIN =
  /^http:\/\/(localhost|127\.0\.0\.1|192\.168(?:\.\d{1,3}){2}|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(:\d+)?$/;

app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return process.env.WEB_ORIGIN ?? "http://localhost:3000";
      if (LOCAL_DEV_ORIGIN.test(origin)) return origin;
      return process.env.WEB_ORIGIN ?? "http://localhost:3000";
    },
    allowHeaders: [
      "Content-Type",
      "X-User-Id",
      "Authorization",
      "X-Admin-Token",
      "Range",
    ],
    exposeHeaders: ["Content-Range", "Accept-Ranges", "Content-Length"],
  }),
);

app.route("/v1/admin", adminApp);

async function userId(c: {
  req: { header: (n: string) => string | undefined };
}): Promise<string> {
  return resolveRequestUserId(
    c.req.header("Authorization"),
    c.req.header("X-User-Id"),
    DEMO_USER_ID,
  );
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
function presentEvent<
  T extends {
    source: string;
    title: string;
    description?: string | null;
    imageUrl?: string | null;
    rawPayload?: unknown;
    lat?: number | null;
    lng?: number | null;
    venueName?: string | null;
    address?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    timezone?: string | null;
    startsAt?: Date | string;
    endsAt?: Date | string | null;
  },
>(row: T): T {
  const payload =
    (row.rawPayload as Record<string, unknown> | null | undefined) ?? null;
  const withImage =
    row.source === "funcheap" && row.imageUrl
      ? { ...row, imageUrl: upgradeFuncheapImageUrl(row.imageUrl) }
      : row.source === "food_deals"
        ? (() => {
            const schedule = foodDealScheduleFromPayload(payload);
            const timeZone = row.timezone ?? "America/Los_Angeles";
            const next = schedule
              ? nextFoodDealOccurrence(schedule, new Date(), timeZone)
              : null;
            return {
              ...row,
              ...(next
                ? { startsAt: next.startsAt, endsAt: next.endsAt }
                : null),
              imageUrl: resolveFoodDealImageUrl({
                imageUrl: row.imageUrl,
                dealId:
                  typeof payload?.dealId === "string" ? payload.dealId : null,
                title: row.title,
                dealSummary: [
                  typeof payload?.dealSummary === "string"
                    ? payload.dealSummary
                    : "",
                  row.description ?? "",
                ]
                  .filter(Boolean)
                  .join(" "),
                dealKind:
                  typeof payload?.dealKind === "string"
                    ? payload.dealKind
                    : null,
              }),
            };
          })()
        : row;
  const coords = resolveEventCoords({
    lat: withImage.lat,
    lng: withImage.lng,
    venueName: withImage.venueName,
    title: withImage.title,
    address: withImage.address,
    city: withImage.city,
    neighborhood: withImage.neighborhood,
  });
  const withGeo =
    coords.lat != null && coords.lng != null
      ? { ...withImage, lat: coords.lat, lng: coords.lng }
      : withImage;
  if (withGeo.source !== "food") return withGeo;
  const foodPayload =
    (withGeo.rawPayload as Record<string, unknown> | null) ?? {};
  const rating =
    typeof foodPayload.rating === "number" ? foodPayload.rating : null;
  return {
    ...withGeo,
    title: stripInfatuationRatingTitle(withGeo.title, rating),
  };
}

/** Find the cross-source twin for a ticket-platform or 19hz listing. */
async function findMusicPlatformNineteenHzTwin(
  row: EventRow,
): Promise<EventRow | null> {
  if (row.source === "19hz") {
    const ref = extractMusicPlatformRef(row.url);
    if (!ref) return null;
    const [twin] = await db
      .select()
      .from(events)
      .where(
        and(
          eq(events.source, ref.platform),
          eq(events.sourceEventId, ref.id),
        ),
      )
      .limit(1);
    return twin ?? null;
  }

  if (!isMusicTicketPlatform(row.source)) return null;

  if (row.url) {
    const [byUrl] = await db
      .select()
      .from(events)
      .where(and(eq(events.source, "19hz"), eq(events.url, row.url)))
      .limit(1);
    if (byUrl) return byUrl;
  }

  if (row.sourceEventId) {
    let needle: string | null = null;
    if (row.source === "ra") {
      needle = `%ra.co/events/${row.sourceEventId}%`;
    } else if (row.source === "eventbrite") {
      needle = `%-tickets-${row.sourceEventId}%`;
    } else if (row.source === "dice") {
      needle = `%dice.fm%/event/${row.sourceEventId}%`;
    }
    if (needle) {
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
      budgetEnabled: false,
      budgetTier: null,
      budgetMax: null,
      preferFree: false,
      nightsOut: true,
      radiusMiles: SF_DEFAULT.radiusMiles,
      lat: SF_DEFAULT.lat,
      lng: SF_DEFAULT.lng,
    };
  }

  const budgetTier =
    parseBudgetTier(profile.budgetTier) ??
    legacyBudgetMaxToTier(profile.budgetMax);

  return {
    interests: (profile.interests ?? []) as UserPrefs["interests"],
    neighborhoods: profile.neighborhoods ?? [],
    budgetEnabled: Boolean(profile.budgetEnabled),
    budgetTier,
    budgetMax: profile.budgetMax ?? null,
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
    /** @deprecated Prefer `neighborhoodsByCity` — flat list is SF/Bay only. */
    neighborhoods: NEIGHBORHOODS,
    neighborhoodsByCity: {
      sf: NEIGHBORHOODS,
      chicago: CHI_NEIGHBORHOODS,
      la: LA_NEIGHBORHOODS,
    },
    defaultLocation: SF_DEFAULT,
    locations: { sf: SF_DEFAULT, chicago: CHI_DEFAULT, la: LA_DEFAULT },
  }),
);

/** Nearest feed city from optional lat/lng, else request IP. */
app.get("/v1/geo", async (c) => c.json(await resolveGeo(c)));

app.get("/v1/me", async (c) => {
  const uid = await userId(c);
  const authedUserId = await resolveAuthenticatedUserId(
    c.req.header("Authorization"),
  );
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
    authenticated: Boolean(authedUserId && user?.email),
  });
});

app.post("/v1/auth/magic-link", async (c) => {
  let body: ReturnType<typeof MagicLinkRequestSchema.parse>;
  try {
    body = MagicLinkRequestSchema.parse(await c.req.json());
  } catch (err) {
    return c.json({ error: "Invalid request", detail: String(err) }, 400);
  }

  const anonymousUserId = c.req.header("X-User-Id")?.trim();
  try {
    await requestMagicLink({
      email: body.email,
      returnTo: body.returnTo,
      city: body.city,
      anonymousUserId:
        anonymousUserId && UUID_RE.test(anonymousUserId)
          ? anonymousUserId
          : undefined,
    });
  } catch (err) {
    console.error("[auth] magic-link failed:", err);
    return c.json({ error: "Could not send sign-in link" }, 500);
  }

  return c.json({ ok: true });
});

app.get("/v1/auth/verify", async (c) => {
  const token = c.req.query("token")?.trim();
  if (!token) {
    return c.json({ error: "Missing token" }, 400);
  }

  const anonymousUserId = c.req.header("X-User-Id")?.trim();
  try {
    const result = await verifyMagicLink({
      token,
      anonymousUserId:
        anonymousUserId && UUID_RE.test(anonymousUserId)
          ? anonymousUserId
          : undefined,
    });
    return c.json(result);
  } catch (err) {
    return c.json({ error: String(err) }, 400);
  }
});

app.post("/v1/auth/logout", async (c) => {
  await revokeSession(c.req.header("Authorization"));
  return c.json({ ok: true });
});

app.put("/v1/me/interests", async (c) => {
  const uid = await userId(c);
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

  const budget = normalizeBudgetPrefs(body);

  await db
    .insert(userProfiles)
    .values({
      userId: uid,
      interests: body.interests,
      neighborhoods: body.neighborhoods,
      budgetMax: budget.budgetMax,
      budgetTier: budget.budgetTier,
      budgetEnabled: budget.budgetEnabled,
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
        budgetMax: budget.budgetMax,
        budgetTier: budget.budgetTier,
        budgetEnabled: budget.budgetEnabled,
        preferFree: body.preferFree ?? false,
        nightsOut: body.nightsOut ?? true,
        radiusMiles: body.radiusMiles ?? SF_DEFAULT.radiusMiles,
        lat: body.lat ?? SF_DEFAULT.lat,
        lng: body.lng ?? SF_DEFAULT.lng,
        onboardingComplete: true,
        updatedAt: new Date(),
      },
    });

  return c.json({
    ok: true,
    prefs: { ...body, ...budget },
    onboardingComplete: true,
  });
});

app.post("/v1/me/signals", async (c) => {
  const uid = await userId(c);
  let body: ReturnType<typeof SignalInputSchema.parse>;
  try {
    body = SignalInputSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid signal payload" }, 400);
  }
  await db.insert(users).values({ id: uid }).onConflictDoNothing();

  // impressed / opened: refresh createdAt so TTL soft-hides restart on re-see.
  const refreshTtl = body.type === "impressed" || body.type === "opened";
  if (refreshTtl) {
    const [row] = await db
      .insert(signals)
      .values({
        userId: uid,
        targetKind: body.targetKind,
        targetId: body.targetId,
        type: body.type,
        createdAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          signals.userId,
          signals.targetKind,
          signals.targetId,
          signals.type,
        ],
        set: { createdAt: new Date() },
      })
      .returning();
    return c.json(row ?? { ok: true });
  }

  const [row] = await db
    .insert(signals)
    .values({
      userId: uid,
      targetKind: body.targetKind,
      targetId: body.targetId,
      type: body.type,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return c.json(row);

  const [existing] = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.userId, uid),
        eq(signals.targetKind, body.targetKind),
        eq(signals.targetId, body.targetId),
        eq(signals.type, body.type),
      ),
    )
    .limit(1);
  return c.json(existing ?? { ok: true });
});

app.delete("/v1/me/signals", async (c) => {
  const uid = await userId(c);
  let body: ReturnType<typeof SignalInputSchema.parse>;
  try {
    body = SignalInputSchema.parse(await c.req.json());
  } catch {
    return c.json({ error: "Invalid signal payload" }, 400);
  }
  await db
    .delete(signals)
    .where(
      and(
        eq(signals.userId, uid),
        eq(signals.targetKind, body.targetKind),
        eq(signals.targetId, body.targetId),
        eq(signals.type, body.type),
      ),
    );
  return c.json({ ok: true });
});

app.get("/v1/events", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? 50), 100);
  const category = c.req.query("category");
  const freeOnly = c.req.query("freeOnly") === "true";
  const now = new Date();

  let rows = await db
    .select()
    .from(events)
    .where(and(gte(events.startsAt, now), eq(events.hidden, false)))
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

/** Public crawl hints for web sitemap (upcoming events + films with showtimes). */
app.get("/v1/seo/sitemap", async (c) => {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 90 * 86400000);
  const limit = Math.min(Math.max(Number(c.req.query("limit") ?? 5000), 1), 5000);

  const eventRows = await db
    .select({
      id: events.id,
      lastModified: events.lastSeenAt,
      startsAt: events.startsAt,
    })
    .from(events)
    .where(
      and(
        eq(events.hidden, false),
        eq(events.kind, "event"),
        gte(events.startsAt, now),
        lte(events.startsAt, windowEnd),
      ),
    )
    .orderBy(asc(events.startsAt))
    .limit(limit);

  const filmShowRows = await db
    .select({
      id: films.id,
      lastModified: films.lastEnrichedAt,
    })
    .from(showtimes)
    .innerJoin(films, eq(showtimes.filmId, films.id))
    .where(
      and(
        gte(showtimes.startsAt, now),
        lte(showtimes.startsAt, windowEnd),
      ),
    )
    .orderBy(asc(showtimes.startsAt))
    .limit(2000);

  const seenFilms = new Set<string>();
  const filmEntries: { id: string; lastModified: string }[] = [];
  for (const row of filmShowRows) {
    if (seenFilms.has(row.id)) continue;
    seenFilms.add(row.id);
    filmEntries.push({
      id: row.id,
      lastModified: (row.lastModified ?? now).toISOString(),
    });
    if (filmEntries.length >= 500) break;
  }

  return c.json({
    events: eventRows.map((r) => ({
      id: r.id,
      lastModified: (r.lastModified ?? r.startsAt).toISOString(),
    })),
    films: filmEntries,
  });
});

app.get("/v1/events/:id", async (c) => {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, c.req.param("id")), eq(events.hidden, false)))
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

  // Ticket platform ↔ 19hz: prefer platform flyer/copy; enrich tags from 19hz.
  if (row.source === "19hz" || isMusicTicketPlatform(row.source)) {
    const twin = await findMusicPlatformNineteenHzTwin(row);
    if (twin) {
      const merged = isMusicTicketPlatform(row.source)
        ? mergePlatformWithNineteenHz(row, twin)
        : mergePlatformWithNineteenHz(twin, row);
      return c.json(presentEvent(merged));
    }
  }

  // 19hz listings are text-only tables — pull flyer from the ticket URL.
  if (row.source === "19hz" && !row.imageUrl && row.url) {
    try {
      const { enrichNineteenHzEventImage } = await import("@bored/ingest");
      const imageUrl = await enrichNineteenHzEventImage(row.url);
      if (imageUrl) {
        const [updated] = await db
          .update(events)
          .set({ imageUrl })
          .where(eq(events.id, row.id))
          .returning();
        if (updated) return c.json(presentEvent(updated));
      }
    } catch (err) {
      console.warn("[events/:id] 19hz image enrich failed", err);
    }
  }

  // Funcheap: pull blurb, poster, categories + external "Event Details" link.
  if (row.source === "funcheap") {
    const payload = (row.rawPayload as Record<string, unknown> | null) ?? {};
    try {
      const {
        enrichFuncheapEvent,
        funcheapDescriptionNeedsEnrich,
        resolveFuncheapSourcePageUrl,
      } = await import("@bored/ingest");
      const funcheapPage = resolveFuncheapSourcePageUrl(row.url, payload);
      const cats = (row.categories as string[]) ?? [];
      const sparseCategories =
        cats.length === 0 || (cats.length === 1 && cats[0] === "free");
      const needsEnrich =
        funcheapPage &&
        (funcheapDescriptionNeedsEnrich(row.description) ||
          !row.imageUrl ||
          sparseCategories ||
          !(row.tags as string[])?.some((t) => t !== "funcheap" && t !== "rss"));
      if (needsEnrich) {
        const fresh = await enrichFuncheapEvent(funcheapPage, {
          title: row.title,
        });
        if (fresh) {
          const mergedPayload = {
            ...payload,
            sourcePageUrl: fresh.sourcePageUrl,
            eventDetailsUrl: fresh.eventDetailsUrl,
            enrichedAt: new Date().toISOString(),
          };
          const coords = resolveEventCoords({
            lat: row.lat,
            lng: row.lng,
            venueName: fresh.venueName ?? row.venueName,
            title: row.title,
            address: fresh.address ?? row.address,
            city: row.city,
          });
          const patch = {
            description: fresh.description ?? row.description,
            url: fresh.eventDetailsUrl ?? row.url,
            venueName: fresh.venueName ?? row.venueName,
            address: fresh.address ?? row.address,
            neighborhood: fresh.neighborhood ?? row.neighborhood,
            ...(coords.lat != null && coords.lng != null
              ? { lat: coords.lat, lng: coords.lng }
              : {}),
            // Never persist ShortPixel SVG placeholders over a real thumb.
            imageUrl:
              upgradeFuncheapImageUrl(fresh.imageUrl) ??
              upgradeFuncheapImageUrl(row.imageUrl) ??
              row.imageUrl,
            categories:
              fresh.categories.length > 0 ? fresh.categories : row.categories,
            tags: fresh.tags.length > 0 ? fresh.tags : row.tags,
            isFree: fresh.isFree,
            priceMin: fresh.priceMin,
            priceMax: fresh.priceMax,
            rawPayload: mergedPayload,
          };
          const [updated] = await db
            .update(events)
            .set(patch)
            .where(eq(events.id, row.id))
            .returning();
          return c.json(presentEvent(updated ?? { ...row, ...patch }));
        }
      }
    } catch (err) {
      console.warn("[events/:id] funcheap enrich failed", err);
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

const IG_MEDIA_FRESH_MS = 45 * 60 * 1000;
const IG_CDN_FETCH_TIMEOUT_MS = 20_000;
const IG_CDN_POSTER_TIMEOUT_MS = 12_000;
const IG_POSTER_MAX_BYTES = 6 * 1024 * 1024;
const IG_POSTER_CACHE_MS = 10 * 60 * 1000;
const IG_POSTER_CACHE_MAX = 160;
/** Graph business_discovery can be slow under concurrent refresh stampedes. */
const IG_GRAPH_FETCH_TIMEOUT_MS = 20_000;
/** Reuse discovery payloads across sibling reels from the same handle. */
const IG_DISCOVERY_CACHE_MS = 60_000;

const igHttpsAgent = new HttpsAgent({
  keepAlive: false,
  maxSockets: 64,
});

const igPosterCache = new Map<
  string,
  { body: Buffer; contentType: string; cachedAt: number }
>();

function isAbortError(err: unknown): boolean {
  return (
    err instanceof Error &&
    (err.name === "AbortError" || /aborted/i.test(err.message))
  );
}

function isIgCdnUrl(url: string | null | undefined): boolean {
  return Boolean(url && /cdninstagram\.com|fbcdn\.net/i.test(url));
}

function likelyIgVideoUrl(url: string): boolean {
  return /\.mp4(\?|$)/i.test(url) || /\/o1\/v\//i.test(url);
}

function looksLikeImageBytes(
  buf: Buffer,
  contentType: string | null,
): boolean {
  if (buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e) return true;
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return true;
  }
  if (buf.subarray(4, 8).toString("ascii") === "ftyp") return false;
  return Boolean(contentType && /^image\//i.test(contentType));
}

async function readHttpBody(
  res: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const chunk of res) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    n += buf.length;
    if (n > maxBytes) {
      res.destroy();
      throw new Error("too large");
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function igCdnRequestHeaders(range?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    Referer: "https://www.instagram.com/",
    Connection: "close",
  };
  if (range) {
    headers.Range = range;
    headers.Accept = "*/*";
  }
  return headers;
}

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = IG_GRAPH_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Instagram CDN via node:https — undici fetch + keep-alive H1 asserts
 * (`Parser.finish`) when Meta closes or resets the socket, which takes down
 * the whole API process.
 */
function fetchInstagramCdn(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
  signal?: AbortSignal,
  redirectsLeft = 4,
): Promise<IncomingMessage> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("This operation was aborted"));
      return;
    }

    let settled = false;
    const req = httpsRequest(
      url,
      { method: "GET", headers, agent: igHttpsAgent },
      (res) => {
        const status = res.statusCode ?? 0;
        if (
          redirectsLeft > 0 &&
          [301, 302, 303, 307, 308].includes(status)
        ) {
          const loc = nodeHeader(res.headers.location);
          res.resume();
          if (!loc) {
            if (!settled) {
              settled = true;
              reject(new Error(`redirect ${status} without location`));
            }
            return;
          }
          try {
            const next = new URL(loc, url).href;
            if (!isIgCdnUrl(next) && !/^https:\/\/www\.instagram\.com\//i.test(next)) {
              if (!settled) {
                settled = true;
                reject(new Error("redirect off CDN"));
              }
              return;
            }
            settled = true;
            fetchInstagramCdn(
              next,
              headers,
              timeoutMs,
              signal,
              redirectsLeft - 1,
            ).then(resolve, reject);
          } catch (err) {
            if (!settled) {
              settled = true;
              reject(err);
            }
          }
          return;
        }

        if (settled) {
          res.resume();
          return;
        }
        settled = true;
        signal?.addEventListener("abort", () => res.destroy(), { once: true });
        res.on("error", () => {
          /* client abort / reset — don't crash the process */
        });
        resolve(res);
      },
    );

    const fail = (err: unknown) => {
      if (settled) return;
      settled = true;
      reject(err);
    };

    req.setTimeout(timeoutMs, () => {
      req.destroy();
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      fail(err);
    });
    req.on("error", fail);

    const onAbort = () => {
      req.destroy();
      const err = new Error("This operation was aborted");
      err.name = "AbortError";
      fail(err);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    req.end();
  });
}

function nodeHeader(value: string | string[] | undefined): string | null {
  if (value == null) return null;
  return Array.isArray(value) ? value.join(", ") : value;
}

type IgDiscoveryMedia = {
  id?: string;
  permalink?: string;
  media_url?: string;
  thumbnail_url?: string;
  media_type?: string;
  children?: {
    data?: {
      media_type?: string;
      media_url?: string;
      thumbnail_url?: string;
    }[];
  };
};

type IgDiscoveryBundle = {
  media: IgDiscoveryMedia[];
  fetchedAt: number;
};

const igDiscoveryInflight = new Map<string, Promise<IgDiscoveryBundle | null>>();
const igDiscoveryCache = new Map<string, IgDiscoveryBundle>();

function igHandleKey(handle: string): string {
  return handle.replace(/^@/, "").trim().toLowerCase();
}

function pickIgPlayableUrls(match: IgDiscoveryMedia | undefined): {
  mediaUrl: string | null;
  thumbnailUrl: string | null;
} {
  if (!match) return { mediaUrl: null, thumbnailUrl: null };
  const childVideo = match.children?.data?.find(
    (c) =>
      (c.media_type === "VIDEO" || c.media_type === "REELS") && c.media_url,
  );
  return {
    mediaUrl: match.media_url ?? childVideo?.media_url ?? null,
    thumbnailUrl: match.thumbnail_url ?? childVideo?.thumbnail_url ?? null,
  };
}

/**
 * One Graph business_discovery per handle (coalesced + short TTL cache).
 * Feed stampedes otherwise fan out N identical heavy queries and hit AbortError.
 */
async function fetchIgBusinessDiscovery(
  handle: string,
): Promise<IgDiscoveryBundle | null> {
  const key = igHandleKey(handle);
  const cached = igDiscoveryCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < IG_DISCOVERY_CACHE_MS) {
    return cached;
  }

  const inflight = igDiscoveryInflight.get(key);
  if (inflight) return inflight;

  const promise = (async (): Promise<IgDiscoveryBundle | null> => {
    const token = await resolveIgAccessToken();
    const userId = process.env.IG_BUSINESS_USER_ID?.trim();
    if (!token || !userId) return null;

    // One discovery per handle (inflight coalesced). Include children so
    // CAROUSEL_ALBUM tips can resolve a child VIDEO media_url.
    const fields = `business_discovery.username(${handle}){media.limit(50){id,permalink,media_url,thumbnail_url,media_type,children{media_type,media_url,thumbnail_url}}}`;
    const url = `https://graph.facebook.com/v21.0/${encodeURIComponent(userId)}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(token)}`;

    try {
      const res = await fetchWithTimeout(url, undefined, IG_GRAPH_FETCH_TIMEOUT_MS);
      if (!res.ok) {
        console.warn(`[events/media] discovery @${handle} ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        business_discovery?: { media?: { data?: IgDiscoveryMedia[] } };
      };
      const media = data.business_discovery?.media?.data ?? [];
      const bundle: IgDiscoveryBundle = { media, fetchedAt: Date.now() };
      igDiscoveryCache.set(key, bundle);
      return bundle;
    } catch (err) {
      const aborted =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted/i.test(err.message));
      console.warn(
        `[events/media] discovery refresh failed @${handle}${aborted ? " (timeout)" : ""}`,
        aborted ? undefined : err,
      );
      return null;
    } finally {
      igDiscoveryInflight.delete(key);
    }
  })();

  igDiscoveryInflight.set(key, promise);
  return promise;
}

/** Persist fresh CDN URLs for every matching listing of this creator. */
async function persistIgDiscoveryMedia(
  handle: string,
  media: IgDiscoveryMedia[],
): Promise<void> {
  const byId = new Map<string, IgDiscoveryMedia>();
  for (const m of media) {
    if (m.id) byId.set(m.id, m);
  }
  if (byId.size === 0) return;

  const ids = [...byId.keys()];
  const rows = await db
    .select({
      id: events.id,
      imageUrl: events.imageUrl,
      sourceEventId: events.sourceEventId,
      rawPayload: events.rawPayload,
    })
    .from(events)
    .where(
      and(
        eq(events.source, "instagram"),
        inArray(events.sourceEventId, ids),
      ),
    );
  if (rows.length === 0) return;

  const refreshedAt = new Date().toISOString();
  const handleNorm = igHandleKey(handle);
  await Promise.all(
    rows.map(async (row) => {
      const payload =
        (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};
      const payloadHandle =
        typeof payload.handle === "string"
          ? igHandleKey(payload.handle)
          : "";
      if (payloadHandle && payloadHandle !== handleNorm) return;

      const match =
        byId.get(row.sourceEventId) ??
        (typeof payload.id === "string" ? byId.get(payload.id) : undefined);
      const picked = pickIgPlayableUrls(match);
      if (!picked.mediaUrl && !picked.thumbnailUrl) return;

      const nextThumb = picked.thumbnailUrl ?? row.imageUrl;
      await db
        .update(events)
        .set({
          imageUrl: nextThumb,
          rawPayload: {
            ...payload,
            mediaUrl: picked.mediaUrl ?? payload.mediaUrl ?? null,
            thumbnailUrl: picked.thumbnailUrl ?? payload.thumbnailUrl ?? null,
            mediaRefreshedAt: refreshedAt,
          },
        })
        .where(eq(events.id, row.id));
    }),
  );
}

/**
 * Resolve Instagram CDN URLs (server-side only).
 * Browsers cannot load CDN media (CORP / NotSameOrigin) — proxy via
 * `/v1/events/:id/media/stream` and `/media/poster` instead.
 */
async function resolveInstagramMediaUrl(
  row: EventRow,
  opts?: { refresh?: boolean },
): Promise<{
  mediaUrl: string | null;
  thumbnailUrl: string | null;
}> {
  const payload =
    (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};
  const mediaId =
    typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : row.sourceEventId;
  const handle =
    typeof payload.handle === "string" && payload.handle.trim()
      ? payload.handle.replace(/^@/, "").trim()
      : null;
  let mediaUrl =
    typeof payload.mediaUrl === "string" && payload.mediaUrl.trim()
      ? payload.mediaUrl
      : null;
  let thumbnailUrl =
    typeof row.imageUrl === "string" &&
    /cdninstagram\.com|fbcdn\.net/i.test(row.imageUrl)
      ? row.imageUrl
      : typeof payload.thumbnailUrl === "string" && payload.thumbnailUrl.trim()
        ? payload.thumbnailUrl
        : row.imageUrl;
  const refreshedAtRaw =
    typeof payload.mediaRefreshedAt === "string"
      ? payload.mediaRefreshedAt
      : null;
  const refreshedAt = refreshedAtRaw ? Date.parse(refreshedAtRaw) : NaN;
  const isFresh =
    Number.isFinite(refreshedAt) &&
    Date.now() - refreshedAt < IG_MEDIA_FRESH_MS;
  // refresh:false = cache only (stream/poster hot path).
  // refresh:true = always hit Graph. omit = refresh when missing/stale.
  const shouldRefresh =
    opts?.refresh === true ||
    (opts?.refresh !== false && (!mediaUrl || !isFresh));

  if (shouldRefresh && handle && mediaId) {
    const bundle = await fetchIgBusinessDiscovery(handle);
    if (bundle) {
      const shortcode = (() => {
        try {
          return new URL(row.url ?? "").pathname
            .split("/")
            .filter(Boolean)[1];
        } catch {
          return null;
        }
      })();
      const match = bundle.media.find(
        (m) =>
          m.id === mediaId ||
          (shortcode && m.permalink?.includes(shortcode)),
      );
      const picked = pickIgPlayableUrls(match);
      if (picked.mediaUrl) mediaUrl = picked.mediaUrl;
      if (picked.thumbnailUrl) thumbnailUrl = picked.thumbnailUrl;

      // Persist this listing + sibling reels from the same Graph payload.
      try {
        await persistIgDiscoveryMedia(handle, bundle.media);
      } catch (err) {
        console.warn("[events/media] persist discovery failed", err);
      }
    }
  }

  return { mediaUrl, thumbnailUrl };
}

async function proxyInstagramUpstream(
  upstreamUrl: string,
  opts?: {
    range?: string;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
): Promise<Response | null> {
  // Instagram /media/?size=l HTML endpoints hang/405 — only proxy CDN URLs.
  if (/instagram\.com\/.+\/media\/?/i.test(upstreamUrl)) return null;
  if (!isIgCdnUrl(upstreamUrl)) return null;

  const timeoutMs = opts?.timeoutMs ?? IG_CDN_FETCH_TIMEOUT_MS;
  const upstreamHeaders = igCdnRequestHeaders(opts?.range);

  let upstream: IncomingMessage;
  try {
    upstream = await fetchInstagramCdn(
      upstreamUrl,
      upstreamHeaders,
      timeoutMs,
      opts?.signal,
    );
  } catch (err) {
    if (opts?.signal?.aborted) return null;
    if (isAbortError(err)) {
      console.warn(`[events/media] upstream timeout after ${timeoutMs}ms`);
    } else {
      console.warn("[events/media] upstream fetch failed", err);
    }
    return null;
  }

  const status = upstream.statusCode ?? 0;
  if (status !== 200 && status !== 206) {
    console.warn(`[events/media] upstream ${status}`);
    upstream.resume();
    return null;
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    nodeHeader(upstream.headers["content-type"]) ?? "application/octet-stream",
  );
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=300");
  // Never leak Instagram CORP to the browser.
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  const contentRange = nodeHeader(upstream.headers["content-range"]);
  if (contentRange) headers.set("Content-Range", contentRange);
  // Only advertise Content-Length for ranged replies. Piping a full CDN body
  // often truncates when Meta resets the socket → ERR_CONTENT_LENGTH_MISMATCH.
  if (status === 206) {
    const contentLength = nodeHeader(upstream.headers["content-length"]);
    if (contentLength) headers.set("Content-Length", contentLength);
  }

  return new Response(Readable.toWeb(upstream) as ReadableStream, {
    status,
    headers,
  });
}

/** Buffer a complete image so Content-Length always matches the body. */
async function fetchInstagramPosterBytes(
  upstreamUrl: string,
  signal?: AbortSignal,
): Promise<{ body: Buffer; contentType: string } | null> {
  if (/instagram\.com\/.+\/media\/?/i.test(upstreamUrl)) return null;
  if (!isIgCdnUrl(upstreamUrl)) return null;

  let upstream: IncomingMessage;
  try {
    upstream = await fetchInstagramCdn(
      upstreamUrl,
      igCdnRequestHeaders(),
      IG_CDN_POSTER_TIMEOUT_MS,
      signal,
    );
  } catch (err) {
    if (signal?.aborted) return null;
    if (isAbortError(err)) {
      console.warn(
        `[events/media] poster timeout after ${IG_CDN_POSTER_TIMEOUT_MS}ms`,
      );
    } else {
      console.warn("[events/media] poster fetch failed", err);
    }
    return null;
  }

  const status = upstream.statusCode ?? 0;
  if (status !== 200) {
    console.warn(`[events/media] poster ${status}`);
    upstream.resume();
    return null;
  }

  const declared = Number(nodeHeader(upstream.headers["content-length"]));
  const upstreamType = nodeHeader(upstream.headers["content-type"]);
  if (upstreamType && /^video\//i.test(upstreamType)) {
    upstream.resume();
    return null;
  }

  let body: Buffer;
  try {
    body = await readHttpBody(upstream, IG_POSTER_MAX_BYTES);
  } catch {
    return null;
  }

  if (Number.isFinite(declared) && declared > 0 && body.length < declared) {
    return null;
  }
  if (!looksLikeImageBytes(body, upstreamType)) return null;

  return {
    body,
    contentType:
      upstreamType && /^image\//i.test(upstreamType)
        ? upstreamType
        : "image/jpeg",
  };
}

function igPosterResponse(body: Buffer, contentType: string): Response {
  const headers = new Headers();
  headers.set("Content-Type", contentType);
  headers.set("Content-Length", String(body.length));
  headers.set("Cache-Control", "private, max-age=600");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(body, { status: 200, headers });
}

function rememberIgPoster(
  eventId: string,
  body: Buffer,
  contentType: string,
): void {
  if (igPosterCache.size >= IG_POSTER_CACHE_MAX) {
    const oldest = igPosterCache.keys().next().value;
    if (oldest) igPosterCache.delete(oldest);
  }
  igPosterCache.set(eventId, {
    body,
    contentType,
    cachedAt: Date.now(),
  });
}

function cachedIgPoster(eventId: string): Response | null {
  const hit = igPosterCache.get(eventId);
  if (!hit) return null;
  if (Date.now() - hit.cachedAt > IG_POSTER_CACHE_MS) {
    igPosterCache.delete(eventId);
    return null;
  }
  return igPosterResponse(hit.body, hit.contentType);
}

/**
 * Metadata for reel playback. Instagram `mediaUrl` is always our same-origin
 * stream proxy — never the CDN URL (blocked by CORP in browsers).
 */
app.get("/v1/events/:id/media", async (c) => {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, c.req.param("id")), eq(events.hidden, false)))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);

  const payload =
    (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};

  if (row.source === "youtube") {
    const videoId =
      typeof payload.videoId === "string"
        ? payload.videoId
        : row.sourceEventId;
    return c.json({
      kind: "youtube",
      videoId,
      mediaUrl: null,
      thumbnailUrl: row.imageUrl,
      permalink: row.url,
    });
  }

  if (row.source !== "instagram") {
    return c.json({
      kind: "none",
      mediaUrl: null,
      thumbnailUrl: row.imageUrl,
      permalink: row.url,
    });
  }

  // Prefer cached CDN URL; only hit Graph when missing/stale.
  const resolved = await resolveInstagramMediaUrl(row);
  return c.json({
    kind: "instagram",
    /** API proxy paths — never return Instagram CDN URLs to browsers. */
    mediaUrl: resolved.mediaUrl
      ? `/v1/events/${row.id}/media/stream`
      : null,
    thumbnailUrl: resolved.thumbnailUrl
      ? `/v1/events/${row.id}/media/poster`
      : null,
    permalink: row.url,
  });
});

/**
 * Proxy Instagram CDN video so browsers can play it (CDN sends
 * Cross-Origin-Resource-Policy: same-origin which blocks direct <video>).
 */
app.get("/v1/events/:id/media/stream", async (c) => {
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, c.req.param("id")), eq(events.hidden, false)))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.source !== "instagram") {
    return c.json({ error: "Not an Instagram listing" }, 400);
  }

  // Fast path: use stored mediaUrl; refresh only if missing or CDN 4xx.
  let { mediaUrl } = await resolveInstagramMediaUrl(row, { refresh: false });
  if (!mediaUrl) {
    ({ mediaUrl } = await resolveInstagramMediaUrl(row, { refresh: true }));
  }
  if (!mediaUrl) return c.json({ error: "No media URL" }, 404);

  const streamOpts = {
    range: c.req.header("Range") ?? undefined,
    timeoutMs: IG_CDN_FETCH_TIMEOUT_MS,
    signal: c.req.raw.signal,
  };
  let proxied = await proxyInstagramUpstream(mediaUrl, streamOpts);
  if (!proxied) {
    ({ mediaUrl } = await resolveInstagramMediaUrl(row, { refresh: true }));
    if (!mediaUrl) return c.json({ error: "Upstream media unavailable" }, 502);
    proxied = await proxyInstagramUpstream(mediaUrl, streamOpts);
  }
  if (!proxied) return c.json({ error: "Upstream media unavailable" }, 502);
  return proxied;
});

/**
 * Proxy Instagram thumbnail/poster (CDN CORP blocks browser <img> hotlinks).
 */
app.get("/v1/events/:id/media/poster", async (c) => {
  const eventId = c.req.param("id");
  const [row] = await db
    .select()
    .from(events)
    .where(and(eq(events.id, eventId), eq(events.hidden, false)))
    .limit(1);
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.source !== "instagram") {
    return c.json({ error: "Not an Instagram listing" }, 400);
  }

  const cached = cachedIgPoster(eventId);
  if (cached) return cached;

  let { thumbnailUrl } = await resolveInstagramMediaUrl(row, {
    refresh: false,
  });
  const payload =
    (row.rawPayload as Record<string, unknown> | null | undefined) ?? {};
  const payloadThumb =
    typeof payload.thumbnailUrl === "string" ? payload.thumbnailUrl : null;

  const rawCandidates = [thumbnailUrl, payloadThumb, row.imageUrl].filter(
    (u): u is string => isIgCdnUrl(u),
  );
  // Prefer stills; video CDN URLs are huge and not valid <img> covers.
  const candidates = [
    ...rawCandidates.filter((u) => !likelyIgVideoUrl(u)),
    ...rawCandidates.filter((u) => likelyIgVideoUrl(u)),
  ].filter((u, i, arr) => arr.indexOf(u) === i);

  for (const url of candidates) {
    const hit = await fetchInstagramPosterBytes(url, c.req.raw.signal);
    if (!hit) continue;
    rememberIgPoster(eventId, hit.body, hit.contentType);
    return igPosterResponse(hit.body, hit.contentType);
  }

  // Last resort: Graph refresh then retry CDN thumb only.
  ({ thumbnailUrl } = await resolveInstagramMediaUrl(row, { refresh: true }));
  if (isIgCdnUrl(thumbnailUrl) && !likelyIgVideoUrl(thumbnailUrl!)) {
    const hit = await fetchInstagramPosterBytes(
      thumbnailUrl!,
      c.req.raw.signal,
    );
    if (hit) {
      rememberIgPoster(eventId, hit.body, hit.contentType);
      return igPosterResponse(hit.body, hit.contentType);
    }
  }
  return c.json({ error: "No poster" }, 404);
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

type TodayFeedCacheBody = {
  mode: string;
  area: string;
  date: string | null;
  generatedAt: string;
  prefsSummary: {
    interests: string[];
    neighborhoods: string[];
    budgetEnabled: boolean;
    budgetTier: number | null;
    budgetMax: number | null;
  };
  cards: FeedCard[];
};

async function dismissedIdsForUser(uid: string): Promise<Set<string>> {
  const rows = await db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, uid), eq(signals.type, "dismissed")))
    .limit(500);
  const ids = new Set<string>();
  for (const s of rows) {
    ids.add(s.targetId);
    if (s.targetKind === "film") ids.add(`film:${s.targetId}`);
  }
  return ids;
}

/** Recent reel covers the user impressed or opened (within soft-hide TTLs). */
async function videoSeenIdsForUser(uid: string): Promise<{
  impressedIds: Set<string>;
  openedIds: Set<string>;
}> {
  const now = Date.now();
  const impressCutoff = new Date(now - VIDEO_IMPRESS_TTL_MS);
  const openedCutoff = new Date(now - VIDEO_OPENED_TTL_MS);
  const rows = await db
    .select()
    .from(signals)
    .where(
      and(
        eq(signals.userId, uid),
        inArray(signals.type, ["impressed", "opened"]),
        gte(signals.createdAt, openedCutoff),
      ),
    )
    .limit(1000);

  const impressedIds = new Set<string>();
  const openedIds = new Set<string>();
  for (const s of rows) {
    if (s.type === "opened") {
      openedIds.add(s.targetId);
      continue;
    }
    if (s.type === "impressed" && s.createdAt >= impressCutoff) {
      impressedIds.add(s.targetId);
    }
  }
  return { impressedIds, openedIds };
}

function prefsSummaryFrom(prefs: UserPrefs) {
  return {
    interests: prefs.interests.map((i) => i.category),
    neighborhoods: prefs.neighborhoods,
    budgetEnabled: prefs.budgetEnabled ?? false,
    budgetTier: prefs.budgetTier ?? null,
    budgetMax: prefs.budgetMax ?? null,
  };
}

function filterDismissedFeedCards<
  T extends { id: string; filmId?: string | null },
>(cards: T[], dismissedIds: Set<string>): T[] {
  if (!dismissedIds.size) return cards;
  return cards.filter(
    (c) =>
      !dismissedIds.has(c.id) &&
      !(c.filmId && dismissedIds.has(`film:${c.filmId}`)),
  );
}

/**
 * Shared Today payload + per-user prefs / dismissals / reel personalization.
 * Video pool is larger in the cache; we trim to carousel limit here.
 */
async function overlayTodayFeedForUser(
  body: TodayFeedCacheBody,
  uid: string,
  opts?: { videos?: "include" | "exclude" | "only" },
): Promise<TodayFeedCacheBody> {
  const videosMode = opts?.videos ?? "include";
  const needsVideoPersonalization = videosMode !== "exclude";

  const [prefs, dismissedIds, videoSeen] = await Promise.all([
    getPrefs(uid),
    dismissedIdsForUser(uid),
    needsVideoPersonalization
      ? videoSeenIdsForUser(uid)
      : Promise.resolve({
          impressedIds: new Set<string>(),
          openedIds: new Set<string>(),
        }),
  ]);

  const withoutDismissed = filterDismissedFeedCards(body.cards, dismissedIds);
  if (videosMode === "exclude") {
    return {
      ...body,
      prefsSummary: prefsSummaryFrom(prefs),
      cards: withoutDismissed.filter((c) => !isFeedVideoCard(c)),
    };
  }

  const videoPool: typeof withoutDismissed = [];
  const rest: typeof withoutDismissed = [];
  for (const card of withoutDismissed) {
    if (isFeedVideoCard(card)) videoPool.push(card);
    else rest.push(card);
  }

  const reelCards = personalizeVideoCarouselCards(videoPool, {
    impressedIds: videoSeen.impressedIds,
    openedIds: videoSeen.openedIds,
    dismissedIds,
    limit: FEED_VIDEO_CAROUSEL_LIMIT,
  });

  return {
    ...body,
    prefsSummary: prefsSummaryFrom(prefs),
    cards: videosMode === "only" ? reelCards : [...reelCards, ...rest],
  };
}

app.get("/v1/feed", async (c) => {
  try {
  const uid = await userId(c);
  const rawDate = parseFeedDate(c.req.query("date"));
  const hasSourcesQuery = Boolean(c.req.query("sources")?.trim());
  const query = FeedQuerySchema.parse({
    mode: c.req.query("mode") ?? "today",
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
      (c.req.query("mode") === "date" ||
      c.req.query("mode") === "all" ||
      c.req.query("mode") === "today" ||
      rawDate ||
      hasSourcesQuery
        ? 200
        : 40),
    videos: c.req.query("videos") ?? undefined,
  });
  const videosMode = query.videos;

  // Shared Today feeds are cacheable for everyone (auth + anon). Dismissals /
  // prefsSummary are overlaid per request so the cached payload stays shared.
  const todayCacheKey =
    query.mode === "today" && shouldCacheTodayFeed(query.limit)
      ? todayFeedCacheKey({
          area: query.area,
          date: query.date ?? null,
          topics: query.topics ?? "",
          sources: query.sources ?? "",
          limit: query.limit,
          videos: videosMode,
        })
      : null;
  if (todayCacheKey) {
    const cached = getTodayFeedCache(todayCacheKey);
    if (cached) {
      c.header("X-Feed-Cache", "hit");
      return c.json(
        await overlayTodayFeedForUser(cached as TodayFeedCacheBody, uid, {
          videos: videosMode,
        }),
      );
    }

    // Dense calendar topics: derive from warm All cache (no curated extras).
    const topicFilterEarly = parseFeedTopics(query.topics);
    if (
      topicFilterEarly.length > 0 &&
      !query.sources?.trim() &&
      feedTopicsFullyCoveredByAll(topicFilterEarly) &&
      !feedTopicsNeedServerEnrich(topicFilterEarly)
    ) {
      const allKey = todayFeedCacheKey({
        area: query.area,
        date: query.date ?? null,
        topics: "",
        sources: "",
        limit: query.limit,
        videos: videosMode,
      });
      const allCached = getTodayFeedCache(allKey) as TodayFeedCacheBody | null;
      if (allCached?.cards?.length) {
        const derived: TodayFeedCacheBody = {
          ...allCached,
          cards: allCached.cards.filter((card) =>
            matchesAnyFeedTopic(topicFilterEarly, {
              kind: card.kind,
              categories: card.categories ?? [],
              tags: card.tags,
              isFree: card.isFree,
              source: card.source,
              title: card.title,
              venueName: card.venueName,
            }),
          ),
        };
        setTodayFeedCache(todayCacheKey, derived);
        c.header("X-Feed-Cache", "derived");
        return c.json(
          await overlayTodayFeedForUser(derived, uid, { videos: videosMode }),
        );
      }
    }
  }

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
  if (query.area === "la" && (prefs.radiusMiles ?? 15) < 25) {
    prefs.radiusMiles = 25;
  }

  const topicFilter = parseFeedTopics(query.topics);
  const sourceFilter = (() => {
    const selected = parseEventSources(query.sources);
    if (!selected.length) return null;
    return expandSourceFilter(selected);
  })();
  // Source chips mean “browse this calendar”, not a personalized top-N cull.
  const browsingSources = Boolean(sourceFilter);

  const now = new Date();
  const todayKey = dayKey(now, locDefault.timezone);
  const dayDate =
    parseFeedDate(query.date) ??
    (query.mode === "today" ? todayKey : null);
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
  } else if (query.mode === "weekend") {
    windowEnd = new Date(now.getTime() + 5 * 86400000);
  } else if (query.mode === "date" || browsingSources) {
    // Source browse: Partiful (and peers) list events months out — don't clip at 14d.
    windowEnd = new Date(
      now.getTime() + (browsingSources ? 90 : 30) * 86400000,
    );
  } else if (topicFilter.includes("music_festivals")) {
    windowEnd = new Date(now.getTime() + 120 * 86400000);
  } else {
    windowEnd = new Date(now.getTime() + 14 * 86400000);
  }

  let fetchLimit =
    query.mode === "date" || dayDate || browsingSources ? 500 : 300;
  // Today feed: don't load 500 full event rows when the response caps at `limit`.
  if (query.mode === "today" && dayDate && !browsingSources) {
    fetchLimit = Math.min(fetchLimit, Math.max(query.limit + 80, 220));
  }
  const startsInWindow = exclusiveEnd
    ? and(gte(events.startsAt, windowStart), lt(events.startsAt, windowEnd))
    : and(gte(events.startsAt, windowStart), lte(events.startsAt, windowEnd));
  /** Long runs (exhibitions): include when the window overlaps [startsAt, endsAt]. */
  const overlapInWindow = and(
    isNotNull(events.endsAt),
    lt(events.startsAt, windowEnd),
    gte(events.endsAt, windowStart),
    // Calendar-day browse: drop overnight stragglers that already ended.
    ...(dayDate ? [gt(events.endsAt, now)] : []),
  );
  const timedInWindow = or(startsInWindow, overlapInWindow);

  const curatedSourceSet = new Set<string>();
  if (sourceFilter) {
    for (const s of sourceFilter) {
      if ((CURATED_FEED_SOURCES as readonly string[]).includes(s)) {
        curatedSourceSet.add(s);
      }
    }
    if (sourceFilter.has("food")) {
      curatedSourceSet.add("instagram");
      curatedSourceSet.add("youtube");
    }
    if (sourceFilter.has("instagram")) {
      curatedSourceSet.add("instagram");
    }
    if (sourceFilter.has("youtube")) {
      curatedSourceSet.add("youtube");
    }
  }
  // Default / topic feeds: IG+YT are carousel inventory, not unbounded curated
  // dumps into the event timeline. Progressive `videos=exclude` skips them.
  if (!sourceFilter && topicFilter.length === 0 && videosMode !== "exclude") {
    curatedSourceSet.add("instagram");
    curatedSourceSet.add("youtube");
  }
  if (topicFilter.includes("activities") && videosMode !== "only") {
    curatedSourceSet.add("activities");
  }
  if (topicFilter.includes("food") || topicFilter.includes("happy_hours")) {
    if (videosMode !== "only") {
      curatedSourceSet.add("food");
      curatedSourceSet.add("food_deals");
      curatedSourceSet.add("new_restaurants");
    }
    if (videosMode !== "exclude") {
      curatedSourceSet.add("instagram");
      curatedSourceSet.add("youtube");
    }
  }
  if (topicFilter.includes("comedy") && videosMode !== "only") {
    curatedSourceSet.add("recurring");
  }
  if (topicFilter.includes("music_festivals") && videosMode !== "only") {
    curatedSourceSet.add("music_festival");
  }

  const videoCuratedSources = [...curatedSourceSet].filter(
    (s) => s === "instagram" || s === "youtube",
  );
  const otherCuratedSources = [...curatedSourceSet].filter(
    (s) => s !== "instagram" && s !== "youtube",
  );
  // When browsing IG/YT explicitly, keep IMAGE/CAROUSEL tips; otherwise only
  // pull short-form video rows for the carousel (avoids 700+ row scans).
  const browsingVideoSource =
    Boolean(sourceFilter?.has("instagram") || sourceFilter?.has("youtube"));
  const videoRowsVideoOnly = !browsingVideoSource;

  const activitiesTopicOnly =
    !sourceFilter &&
    topicFilter.length === 1 &&
    topicFilter[0] === "activities";
  // Happy hours inventory is curated food_deals only — timed scan is wasted.
  const happyHoursTopicOnly =
    !sourceFilter &&
    topicFilter.length === 1 &&
    topicFilter[0] === "happy_hours";

  const needsTimedQuery =
    videosMode !== "only" &&
    !activitiesTopicOnly &&
    !happyHoursTopicOnly &&
    (!sourceFilter ||
      [...sourceFilter].some(
        (s) => !(CURATED_FEED_SOURCES as readonly string[]).includes(s),
      ));

  /** Short-form video media — matches isFeedVideo / isInstagramVideo heuristics. */
  const videoMediaSql = sql`(
    ${events.source} = 'youtube'
    OR upper(coalesce(${events.rawPayload}->>'mediaType', '')) IN ('VIDEO', 'REELS')
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(coalesce(${events.tags}, '[]'::jsonb)) AS t(tag)
      WHERE lower(t.tag) IN ('reel', 'video', 'short', 'shorts')
    )
  )`;

  const timedSources = sourceFilter
    ? [...sourceFilter].filter(
        (s) => !(CURATED_FEED_SOURCES as readonly string[]).includes(s),
      )
    : null;

  const [timedRows, otherCuratedRaw, videoCuratedRaw, demotionRows] =
    await Promise.all([
    needsTimedQuery
      ? db
          .select()
          .from(events)
          .where(
            and(
              timedInWindow,
              eq(events.hidden, false),
              notInArray(events.source, [...CURATED_ONLY_TIMED_SOURCES]),
              // Evergreen tips use kind=recommendation (also excluded by source).
              sql`${events.kind} <> 'recommendation'`,
              // Default Today: IG/YT come from the capped video query — don't let
              // hundreds of IMAGE/CAROUSEL posts crowd the timed event limit.
              !browsingVideoSource
                ? notInArray(events.source, ["instagram", "youtube"])
                : undefined,
              timedSources?.length
                ? inArray(events.source, timedSources)
                : undefined,
            ),
          )
          .orderBy(asc(events.startsAt))
          .limit(fetchLimit)
      : Promise.resolve([] as EventRow[]),
    otherCuratedSources.length && videosMode !== "only"
      ? db
          .select()
          .from(events)
          .where(
            and(
              inArray(events.source, otherCuratedSources),
              eq(events.hidden, false),
            ),
          )
          .orderBy(desc(events.lastSeenAt))
          .limit(FEED_CURATED_FETCH_LIMIT)
      : Promise.resolve([] as EventRow[]),
    videoCuratedSources.length && videosMode !== "exclude"
      ? db
          .select()
          .from(events)
          .where(
            and(
              inArray(events.source, videoCuratedSources),
              eq(events.hidden, false),
              videoRowsVideoOnly ? videoMediaSql : undefined,
            ),
          )
          .orderBy(desc(events.lastSeenAt))
          .limit(FEED_VIDEO_FETCH_LIMIT)
      : Promise.resolve([] as EventRow[]),
    db
      .select()
      .from(feedDemotionRules)
      .where(eq(feedDemotionRules.active, true)),
  ]);

  let eventRows: EventRow[] = timedRows;
  if (otherCuratedRaw.length || videoCuratedRaw.length) {
    const curatedRows = filterCuratedFeedRows(
      [...otherCuratedRaw, ...videoCuratedRaw],
      query.area,
      { now },
    );
    eventRows = mergeCuratedFeedRows(eventRows, curatedRows);
  }

  const categoryFilter = query.categories
    ? query.categories.split(",").map((s) => s.trim()).filter(Boolean)
    : null;

  // Collapse 19hz duplicates when RA / Eventbrite / Dice is in play (shared
  // ticket URL/id). Prefer platform flyer/copy; pull genre tags from 19hz.
  // Skip when the user filtered to 19hz-only so those cards aren't dropped.
  const wantsPlatformTwin =
    !sourceFilter ||
    MUSIC_TICKET_PLATFORMS.some((platform) => sourceFilter.has(platform));
  const coalescedRows = expandRecurringRowsForFeed(
    expandExhibitionRowsForFeed(
      expandFoodDealRowsForFeed(
        coalesceEventOccurrences(
          wantsPlatformTwin
            ? coalesceMusicPlatformNineteenHz(eventRows)
            : eventRows,
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
      if (e.source === "instagram" || e.source === "youtube") {
        const payload =
          (e.rawPayload as Record<string, unknown> | null | undefined) ??
          null;
        const handle =
          typeof payload?.handle === "string"
            ? payload.handle
            : typeof payload?.channelHandle === "string"
              ? payload.channelHandle
              : e.organizer;
        const metro = videoMetroFromFeedArea(query.area);
        const blob = videoLocalityText([
          e.title,
          e.description,
          e.venueName,
          e.neighborhood,
          e.organizer,
          Array.isArray(e.tags) ? e.tags.join(" ") : null,
          typeof payload?.handle === "string" ? payload.handle : null,
        ]);
        if (
          !isVideoContentLocalToMetro({
            text: blob,
            metro,
            handle,
          })
        ) {
          return false;
        }
        const isVideo = isFeedVideo({
          source: e.source,
          tags: e.tags as string[] | null,
          rawPayload: payload,
        });
        if (
          e.source === "instagram" &&
          isVideo &&
          !(typeof payload?.mediaUrl === "string" && payload.mediaUrl.trim())
        ) {
          return false;
        }
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
      const isTheater = isTheaterRecommendationSource(e.source);
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
      const exhibitionSchedule = exhibitionScheduleFromPayload(payload);
      const tbaHours = isTimeTbaTag(tags)
        ? dailyHoursFromPayload(payload)
        : null;
      const recommendationLabel = exhibitionSchedule
        ? null
        : tbaHours
          ? formatDailyHoursLabel(tbaHours)
        : isFoodDeal
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
            : isTheater
              ? theaterRecommendationLabel({ rawPayload: payload })
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
                : e.source === "youtube"
                  ? ytVideoRecommendationLabel(
                      typeof payload?.channelTitle === "string"
                        ? payload.channelTitle
                        : "YouTube",
                      payload?.isShort === true ||
                        payload?.mediaType === "SHORT",
                    )
                : foodRecommendationLabel({
                    tags,
                    rawPayload: payload,
                    description: e.description,
                  })
              : e.source === "instagram"
                ? igFoodRecommendationLabel(
                    typeof payload?.handle === "string"
                      ? payload.handle
                      : (tags.find(
                          (t) =>
                            !["instagram", "reel", "video", "food", "city_guide", "new_opening"].includes(t),
                        ) ?? "instagram"),
                    typeof payload?.mediaType === "string"
                      ? payload.mediaType
                      : null,
                  )
                : e.source === "youtube"
                  ? ytVideoRecommendationLabel(
                      typeof payload?.channelTitle === "string"
                        ? payload.channelTitle
                        : "YouTube",
                      payload?.isShort === true ||
                        payload?.mediaType === "SHORT",
                    )
              : null;

      const coords = resolveEventCoords({
        lat: e.lat,
        lng: e.lng,
        venueName: e.venueName,
        title,
        address: e.address,
        city: e.city,
      });
      const timesPreview = eventTimesPreview(e, e.venueName);

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
        lat: coords.lat,
        lng: coords.lng,
        isFree: e.isFree,
        priceMin: e.priceMin,
        priceMax: e.priceMax,
        neighborhood: e.neighborhood,
        venueName: e.venueName,
        imageUrl: (() => {
          if (e.source === "funcheap") {
            return upgradeFuncheapImageUrl(e.imageUrl);
          }
          if (e.source === "youtube") {
            const videoId =
              typeof payload?.videoId === "string"
                ? payload.videoId
                : null;
            return youtubeThumbnailUrl(videoId) ?? e.imageUrl;
          }
          if (e.source === "instagram") {
            return feedVideoPosterUrl({
              source: e.source,
              imageUrl: e.imageUrl,
              url: e.url,
            });
          }
          if (isFoodDeal) {
            return resolveFoodDealImageUrl({
              imageUrl: e.imageUrl,
              dealId:
                typeof payload?.dealId === "string" ? payload.dealId : null,
              title: e.title,
              dealSummary: [
                typeof payload?.dealSummary === "string"
                  ? payload.dealSummary
                  : "",
                e.description ?? "",
              ]
                .filter(Boolean)
                .join(" "),
              dealKind:
                typeof payload?.dealKind === "string"
                  ? payload.dealKind
                  : null,
            });
          }
          return e.imageUrl;
        })(),
        url: e.url,
        subtitle: e.venueName,
        city: e.city,
        source: e.source,
        registrationStatus: e.registrationStatus as Rankable["registrationStatus"],
        sourceTrust:
          e.source === "music_festival"
            ? 0.95
            : e.source === "recurring"
            ? 0.75
            : e.source === "partiful" && tags.includes("trending")
              ? 0.95
              : isFoodDeal
              ? 0.92
              : isNewRestaurant
                ? 0.9
                : isActivity
                  ? 0.88
                  : 0.85,
        recommendationLabel,
        rawPayload: payload,
        // Never send Instagram CDN URLs to the browser (CORP / NotSameOrigin).
        mediaUrl:
          e.source === "instagram"
            ? null
            : typeof payload?.mediaUrl === "string"
              ? payload.mediaUrl
              : null,
        mediaType:
          typeof payload?.mediaType === "string" ? payload.mediaType : null,
        publishedAt: (() => {
          const raw =
            typeof payload?.published === "string"
              ? payload.published
              : typeof payload?.publishedAt === "string"
                ? payload.publishedAt
                : null;
          if (!raw) return null;
          const d = new Date(raw);
          return Number.isNaN(d.getTime()) ? null : d;
        })(),
        showtimesPreview: timesPreview?.times,
        showtimesMoreCount: timesPreview?.moreCount || undefined,
        ratings:
          infatuationRating != null
            ? { infatuation: infatuationRating }
            : undefined,
        isSponsored: Boolean(e.isSponsored),
        boostWeight: e.boostWeight ?? 1,
        sponsorEndsAt: e.sponsorEndsAt ?? null,
      };
    });

  // Group showtimes by film for movie cards.
  // Unfiltered feed includes TMS + indie; Indie theater chip includes only those showtimes.
  // Movies ingest is SF-scoped today — skip when browsing Chicago.
  // Default Today/For you hide the Movies section unless the movies topic is on,
  // so skip the showtimes join unless it can surface (topic / indie chip).
  const includeMovies =
    videosMode !== "only" &&
    metroFromArea(query.area) === "sf" &&
    (!sourceFilter || sourceFilter.has("indie_theater")) &&
    (!categoryFilter ||
      categoryFilter.some((c) => c.startsWith("movies"))) &&
    (topicFilter.includes("movies") ||
      Boolean(sourceFilter?.has("indie_theater")));

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
        showtimesPreview: shows.slice(0, FEED_TIMES_PREVIEW_LIMIT).map((s) => ({
          startsAt: s.showtime.startsAt.toISOString(),
          theaterName: s.theater.name,
          ticketUrl: s.showtime.ticketUrl,
        })),
        showtimesMoreCount:
          shows.length > FEED_TIMES_PREVIEW_LIMIT
            ? shows.length - FEED_TIMES_PREVIEW_LIMIT
            : undefined,
        sourceTrust: 0.9,
      });
    }
  }

  // Today is a shared chrono listing — keep rank input user-agnostic so the
  // cache payload is identical for everyone. Dismissals + reel impress/opened
  // overlay on the way out (see overlayTodayFeedForUser).
  const sharedToday = query.mode === "today";
  let dismissedIds = new Set<string>();
  let savedBoostIds = new Set<string>();
  let impressedIds = new Set<string>();
  let openedIds = new Set<string>();
  if (!sharedToday) {
    const userSignals = await db
      .select()
      .from(signals)
      .where(eq(signals.userId, uid))
      .limit(1000);

    const nowMs = now.getTime();
    const impressCutoff = nowMs - VIDEO_IMPRESS_TTL_MS;
    const openedCutoff = nowMs - VIDEO_OPENED_TTL_MS;

    dismissedIds = new Set(
      userSignals.filter((s) => s.type === "dismissed").map((s) => s.targetId),
    );
    for (const s of userSignals) {
      if (s.type === "dismissed" && s.targetKind === "film") {
        dismissedIds.add(`film:${s.targetId}`);
      }
      if (s.type === "opened" && s.createdAt.getTime() >= openedCutoff) {
        openedIds.add(s.targetId);
      }
      if (s.type === "impressed" && s.createdAt.getTime() >= impressCutoff) {
        impressedIds.add(s.targetId);
      }
    }
    savedBoostIds = new Set(
      userSignals
        .filter((s) => s.type === "saved" || s.type === "going")
        .map((s) =>
          s.targetKind === "film" ? `film:${s.targetId}` : s.targetId,
        ),
    );
  }

  const demotionRules = demotionRows.map((r) => ({
    id: r.id,
    name: r.name,
    metro: r.metro,
    source: r.source,
    venueContains: r.venueContains,
    categoryContains: r.categoryContains,
    scoreMultiplier: r.scoreMultiplier,
    maxPerVenue: r.maxPerVenue,
    active: r.active,
  }));

  // Chronological listing when browsing a source, Select Date, or a calendar
  // day (including Today) so preferFree / budget / affinity slots don't hide
  // most of that source.
  const chronological =
    query.mode === "date" ||
    query.mode === "today" ||
    Boolean(dayDate) ||
    browsingSources;
  // For You + topic: Today → weekend → horizon so thin topics still fill.
  const topicForYou =
    query.mode === "for_you" && topicFilter.length > 0 && !chronological;
  const rankMode = chronological ? "date" : query.mode;

  const organicRankables = rankables.filter((r) => !isSponsoredActive(r, now));
  const sponsoredRankables = rankables.filter((r) => isSponsoredActive(r, now));

  const videoOrganic = organicRankables.filter(isFeedVideoRankable);
  const restOrganic =
    browsingVideoSource || videosMode === "only"
      ? organicRankables
      : organicRankables.filter((r) => !isFeedVideoRankable(r));

  const rankCtx = {
    prefs,
    now,
    dismissedIds,
    savedBoostIds,
    showAll: chronological,
    demotionRules,
  };

  const rankRest = (items: Rankable[], limit: number) =>
    topicForYou
      ? rankForYouTopicFeed(
          items,
          { ...rankCtx, timeZone: locDefault.timezone },
          limit,
        )
      : rankFeed(items, rankCtx, rankMode, limit);

  const restCards =
    videosMode === "only" ? [] : rankRest(restOrganic, query.limit);
  // Today cache: larger unpersonalized pool; overlay personalizes to 40.
  // Other modes: personalize immediately via impress/opened TTLs.
  const reelCards =
    videosMode === "exclude" || browsingVideoSource
      ? []
      : rankVideoCarousel(videoOrganic, {
          now,
          impressedIds: sharedToday ? undefined : impressedIds,
          openedIds: sharedToday ? undefined : openedIds,
          dismissedIds: sharedToday ? undefined : dismissedIds,
          limit: sharedToday
            ? FEED_VIDEO_CACHE_POOL_LIMIT
            : FEED_VIDEO_CAROUSEL_LIMIT,
        });

  const sponsoredCards =
    videosMode === "only"
      ? []
      : rankRest(
          sponsoredRankables,
          Math.max(8, Math.ceil(query.limit * 0.2)),
        ).map((c) => ({ ...c, isSponsored: true }));

  // Today / weekend / Select Date / topic-browse For You: lead with sponsored
  // when inventory exists. Plain For you: keep organic in the first few cards.
  const firstIndex =
    chronological ||
    topicForYou ||
    query.mode === "today" ||
    query.mode === "weekend"
      ? 0
      : 3;

  const eventCards = injectSponsoredIntoFeed(restCards, sponsoredCards, {
    firstIndex,
    interval: 8,
    maxShare: 0.12,
  }).slice(0, query.limit);
  const cards =
    videosMode === "only"
      ? reelCards
      : videosMode === "exclude" || browsingVideoSource
        ? eventCards
        : [...reelCards, ...eventCards];

  const body = {
    mode: query.mode,
    area: query.area,
    date: dayDate,
    generatedAt: now.toISOString(),
    prefsSummary: prefsSummaryFrom(prefs),
    cards,
  };
  if (todayCacheKey) {
    setTodayFeedCache(todayCacheKey, body);
    c.header("X-Feed-Cache", "miss");
    return c.json(
      await overlayTodayFeedForUser(body, uid, { videos: videosMode }),
    );
  }
  return c.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[feed]", message);
    return c.json({ error: "Feed failed", message }, 500);
  }
});

app.get("/v1/me/saved", async (c) => {
  const uid = await userId(c);
  const saved = await db
    .select()
    .from(signals)
    .where(and(eq(signals.userId, uid), inArray(signals.type, ["saved", "going"])))
    .orderBy(sql`${signals.createdAt} desc`)
    .limit(100);

  const eventIds = saved
    .filter((s) => s.targetKind === "event")
    .map((s) => s.targetId);
  const filmIds = saved
    .filter((s) => s.targetKind === "film")
    .map((s) => s.targetId);

  const eventRows =
    eventIds.length > 0
      ? await db
          .select()
          .from(events)
          .where(and(inArray(events.id, eventIds), eq(events.hidden, false)))
      : [];
  const filmRows =
    filmIds.length > 0
      ? await db.select().from(films).where(inArray(films.id, filmIds))
      : [];

  const nextShowByFilm = new Map<
    string,
    { startsAt: Date; theaterName: string | null }
  >();
  if (filmIds.length > 0) {
    const now = new Date();
    const showRows = await db
      .select({
        filmId: showtimes.filmId,
        startsAt: showtimes.startsAt,
        theaterName: theaters.name,
      })
      .from(showtimes)
      .innerJoin(theaters, eq(showtimes.theaterId, theaters.id))
      .where(
        and(inArray(showtimes.filmId, filmIds), gte(showtimes.startsAt, now)),
      )
      .orderBy(asc(showtimes.startsAt))
      .limit(500);
    for (const row of showRows) {
      if (!nextShowByFilm.has(row.filmId)) {
        nextShowByFilm.set(row.filmId, {
          startsAt: row.startsAt,
          theaterName: row.theaterName,
        });
      }
    }
  }

  const eventById = new Map(eventRows.map((e) => [e.id, e]));
  const filmById = new Map(filmRows.map((f) => [f.id, f]));
  const now = new Date();

  type SavedCard = {
    signalId: string;
    signalType: string;
    savedAt: string;
    past: boolean;
    kind: "event" | "movie_showtime";
    id: string;
    title: string;
    subtitle: string | null;
    startsAt: string;
    endsAt: string | null;
    imageUrl: string | null;
    venueName: string | null;
    neighborhood: string | null;
    categories: string[];
    tags: string[];
    source: string | null;
    registrationStatus: string | null;
    isFree: boolean;
    url: string | null;
    score: number;
    bucket: "affinity" | "adjacent" | "serendipity";
    filmId?: string;
    ratings?: unknown;
  };

  const items: SavedCard[] = [];
  for (const s of saved) {
    if (s.targetKind === "event") {
      const row = eventById.get(s.targetId);
      if (!row) continue;
      const presented = presentEvent(row);
      const past =
        presented.endsAt != null
          ? presented.endsAt.getTime() < now.getTime()
          : presented.startsAt.getTime() < now.getTime() - 3 * 3600_000;
      items.push({
        signalId: s.id,
        signalType: s.type,
        savedAt: s.createdAt.toISOString(),
        past,
        kind: "event",
        id: presented.id,
        title: presented.title,
        subtitle: presented.venueName,
        startsAt: presented.startsAt.toISOString(),
        endsAt: presented.endsAt?.toISOString() ?? null,
        imageUrl: presented.imageUrl,
        venueName: presented.venueName,
        neighborhood: presented.neighborhood,
        categories: (presented.categories as string[]) ?? [],
        tags: (presented.tags as string[]) ?? [],
        source: presented.source,
        registrationStatus: presented.registrationStatus ?? null,
        isFree: presented.isFree,
        url: presented.url,
        score: 1,
        bucket: "affinity",
      });
      continue;
    }
    if (s.targetKind === "film") {
      const film = filmById.get(s.targetId);
      if (!film) continue;
      const next = nextShowByFilm.get(film.id);
      const startsAt = next?.startsAt ?? now;
      const past = !next;
      items.push({
        signalId: s.id,
        signalType: s.type,
        savedAt: s.createdAt.toISOString(),
        past,
        kind: "movie_showtime",
        id: `film:${film.id}`,
        filmId: film.id,
        title: film.title,
        subtitle: next?.theaterName ?? (film.year ? String(film.year) : null),
        startsAt: startsAt.toISOString(),
        endsAt: null,
        imageUrl: film.posterUrl,
        venueName: next?.theaterName ?? null,
        neighborhood: null,
        categories: ["movies"],
        tags: (film.genres as string[]) ?? [],
        source: "tms",
        registrationStatus: null,
        isFree: false,
        url: film.letterboxdUrl,
        score: 1,
        bucket: "affinity",
        ratings: film.ratings,
      });
    }
  }

  const upcoming = items
    .filter((i) => !i.past)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = items
    .filter((i) => i.past)
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  return c.json({ signals: saved, upcoming, past, cards: upcoming });
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

// Railway / containers set PORT; local dev uses API_PORT (default 4000).
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`bored api listening on :${info.port}`);
});

server.on("error", (err: NodeJS.ErrnoException) => {
  console.error(`[api] failed to bind :${port}: ${err.message}`);
  process.exit(1);
});

function shutdown(signal: string) {
  console.log(`[api] ${signal} — closing`);
  igHttpsAgent.destroy();
  try {
    server.close(() => process.exit(0));
  } catch {
    process.exit(0);
  }
  // Don't leave tsx watch hanging on open CDN sockets.
  setTimeout(() => process.exit(0), 1500).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));

export default app;
