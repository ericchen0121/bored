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
  exhibitionWhenLabel,
  expandSourceFilter,
  extractMusicPlatformRef,
  expandFoodDealRowsForFeed,
  expandExhibitionRowsForFeed,
  expandRecurringRowsForFeed,
  filterCuratedFeedRows,
  foodDealScheduleFromPayload,
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
  isActivityRecommendationSource,
  stripInfatuationRatingTitle,
  FOUND_NON_FOOD_SECTIONS,
  resolveEventCoords,
  extractFoundSectionHint,
  igFoodRecommendationLabel,
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
  type EventOutboundSlot,
  type Rankable,
  upgradeFuncheapImageUrl,
  type UserPrefs,
} from "@bored/shared";

import { coalesceEventOccurrences } from "@bored/shared/coalesce";
import { config } from "dotenv";
import { and, asc, eq, gte, inArray, isNotNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { resolve } from "node:path";
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
  todayFeedCacheKey,
} from "./feedCache.js";
import { resolveGeo } from "./geo.js";

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
    allowHeaders: ["Content-Type", "X-User-Id", "Authorization", "X-Admin-Token"],
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
    imageUrl?: string | null;
    rawPayload?: unknown;
    lat?: number | null;
    lng?: number | null;
    venueName?: string | null;
    address?: string | null;
    city?: string | null;
    neighborhood?: string | null;
  },
>(row: T): T {
  const withImage =
    row.source === "funcheap" && row.imageUrl
      ? { ...row, imageUrl: upgradeFuncheapImageUrl(row.imageUrl) }
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
  const payload = (withGeo.rawPayload as Record<string, unknown> | null) ?? {};
  const rating = typeof payload.rating === "number" ? payload.rating : null;
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
  const body = SignalInputSchema.parse(await c.req.json());
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
  });

  // Shared Today feeds are cacheable; authenticated users skip (dismiss/save).
  const authedUserId = await resolveAuthenticatedUserId(
    c.req.header("Authorization"),
  );
  const todayCacheKey =
    query.mode === "today" && !authedUserId
      ? todayFeedCacheKey({
          area: query.area,
          date: query.date ?? null,
          topics: query.topics ?? "",
          sources: query.sources ?? "",
          limit: query.limit,
        })
      : null;
  if (todayCacheKey) {
    const cached = getTodayFeedCache(todayCacheKey);
    if (cached) {
      c.header("X-Feed-Cache", "hit");
      return c.json(cached);
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
  } else {
    windowEnd = new Date(now.getTime() + 14 * 86400000);
  }

  const fetchLimit =
    query.mode === "date" || dayDate || browsingSources ? 500 : 300;
  const startsInWindow = exclusiveEnd
    ? and(gte(events.startsAt, windowStart), lt(events.startsAt, windowEnd))
    : and(gte(events.startsAt, windowStart), lte(events.startsAt, windowEnd));
  /** Long runs (exhibitions): include when the window overlaps [startsAt, endsAt]. */
  const timedInWindow = or(
    startsInWindow,
    and(
      isNotNull(events.endsAt),
      lt(events.startsAt, windowEnd),
      gte(events.endsAt, windowStart),
    ),
  );

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
    const timedSources = sourceFilter
      ? [...sourceFilter].filter(
          (s) => !(CURATED_FEED_SOURCES as readonly string[]).includes(s),
        )
      : null;
    eventRows = await db
      .select()
      .from(events)
      .where(
        and(
          timedInWindow,
          eq(events.hidden, false),
          notInArray(events.source, [...CURATED_ONLY_TIMED_SOURCES]),
          // Evergreen tips use kind=recommendation (also excluded by source).
          sql`${events.kind} <> 'recommendation'`,
          // Push source chip into SQL so denser calendars don't crowd out
          // Partiful / newsletter / etc. inside the fetch limit.
          timedSources?.length
            ? inArray(events.source, timedSources)
            : undefined,
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
        .where(
          and(inArray(events.source, curatedInFilter), eq(events.hidden, false)),
        )
        .orderBy(asc(events.title)),
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
      const exhibitionSchedule = exhibitionScheduleFromPayload(payload);
      const tbaHours = isTimeTbaTag(tags)
        ? dailyHoursFromPayload(payload)
        : null;
      const recommendationLabel = exhibitionSchedule
        ? `Exhibition · ${exhibitionWhenLabel(exhibitionSchedule, locDefault.timezone)}`
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
        imageUrl:
          e.source === "funcheap"
            ? upgradeFuncheapImageUrl(e.imageUrl)
            : e.imageUrl,
        url: e.url,
        subtitle: e.venueName,
        city: e.city,
        source: e.source,
        registrationStatus: e.registrationStatus as Rankable["registrationStatus"],
        sourceTrust:
          e.source === "recurring"
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

  const demotionRows = await db
    .select()
    .from(feedDemotionRules)
    .where(eq(feedDemotionRules.active, true));
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

  const rankCtx = {
    prefs,
    now,
    dismissedIds,
    savedBoostIds,
    showAll: chronological,
    demotionRules,
  };

  const organicCards = topicForYou
    ? rankForYouTopicFeed(
        organicRankables,
        { ...rankCtx, timeZone: locDefault.timezone },
        query.limit,
      )
    : rankFeed(organicRankables, rankCtx, rankMode, query.limit);

  const sponsoredCards = (
    topicForYou
      ? rankForYouTopicFeed(
          sponsoredRankables,
          { ...rankCtx, timeZone: locDefault.timezone },
          Math.max(8, Math.ceil(query.limit * 0.2)),
        )
      : rankFeed(
          sponsoredRankables,
          rankCtx,
          rankMode,
          Math.max(8, Math.ceil(query.limit * 0.2)),
        )
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

  const cards = injectSponsoredIntoFeed(organicCards, sponsoredCards, {
    firstIndex,
    interval: 8,
    maxShare: 0.12,
  }).slice(0, query.limit);

  const body = {
    mode: query.mode,
    area: query.area,
    date: dayDate,
    generatedAt: now.toISOString(),
    prefsSummary: {
      interests: prefs.interests.map((i) => i.category),
      neighborhoods: prefs.neighborhoods,
      budgetEnabled: prefs.budgetEnabled ?? false,
      budgetTier: prefs.budgetTier ?? null,
      budgetMax: prefs.budgetMax ?? null,
    },
    cards,
  };
  if (todayCacheKey) {
    setTodayFeedCache(todayCacheKey, body);
    c.header("X-Feed-Cache", "miss");
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

export default app;
