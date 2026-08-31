import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }),
    displayName: varchar("display_name", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("users_email_unique_idx").on(t.email)],
);

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  interests: jsonb("interests")
    .$type<{ category: string; weight: number }[]>()
    .notNull()
    .default([]),
  neighborhoods: jsonb("neighborhoods").$type<string[]>().notNull().default([]),
  /** Legacy USD ceiling — kept for back-compat; prefer budgetTier + budgetEnabled. */
  budgetMax: integer("budget_max"),
  /** Max price band 1–4 ($–$$$$). */
  budgetTier: integer("budget_tier"),
  /** When false, budgetTier is preference-only and does not hard-filter. */
  budgetEnabled: boolean("budget_enabled").default(false).notNull(),
  preferFree: boolean("prefer_free").default(false),
  nightsOut: boolean("nights_out").default(true),
  radiusMiles: integer("radius_miles").default(15),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  onboardingComplete: boolean("onboarding_complete").default(false).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const events = pgTable(
  "events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: varchar("source", { length: 64 }).notNull(),
    sourceEventId: varchar("source_event_id", { length: 255 }).notNull(),
    /**
     * `event` = timed listing; `recommendation` = evergreen tip (food /
     * activities / new restaurants / IG food). Timed SQL excludes the latter.
     */
    kind: varchar("kind", { length: 32 }).notNull().default("event"),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    timezone: varchar("timezone", { length: 64 }).notNull().default("America/Los_Angeles"),
    venueName: text("venue_name"),
    address: text("address"),
    neighborhood: varchar("neighborhood", { length: 120 }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    city: varchar("city", { length: 64 }).notNull().default("sf"),
    priceMin: integer("price_min"),
    priceMax: integer("price_max"),
    isFree: boolean("is_free").notNull().default(false),
    categories: jsonb("categories").$type<string[]>().notNull().default([]),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    ageRestriction: text("age_restriction"),
    url: text("url"),
    imageUrl: text("image_url"),
    organizer: text("organizer"),
    recurringShowId: uuid("recurring_show_id"),
    /** open | near_capacity | waitlist | sold_out */
    registrationStatus: varchar("registration_status", { length: 32 }),
    registrationCheckedAt: timestamp("registration_checked_at", {
      withTimezone: true,
    }),
    /** Native boost inventory — set by ops/sales; ingest upserts must not clear. */
    isSponsored: boolean("is_sponsored").notNull().default(false),
    sponsorId: uuid("sponsor_id"),
    /** Relative priority among active sponsored rows (higher first). */
    boostWeight: doublePrecision("boost_weight").notNull().default(1),
    sponsorEndsAt: timestamp("sponsor_ends_at", { withTimezone: true }),
    /** Soft-hide from public feed/detail; ingest upserts must not clear. */
    hidden: boolean("hidden").notNull().default(false),
    rawPayload: jsonb("raw_payload"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("events_source_source_event_id_idx").on(t.source, t.sourceEventId),
  ],
);

/** Local advertisers / venue packages (founder-sold for now). */
export const sponsors = pgTable("sponsors", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** Metro slug: sf | chicago | bay */
  metro: varchar("metro", { length: 32 }).notNull().default("sf"),
  /** venue_boost | happy_hour | festival */
  package: varchar("package", { length: 40 }).notNull().default("venue_boost"),
  contactEmail: varchar("contact_email", { length: 255 }),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Ops feed demotion rules — soft-bury matching listings (still shown) and
 * optionally cap how many cards from one venue appear in a feed response.
 * Managed via /admin/demotions; applied in @bored/shared ranker.
 */
export const feedDemotionRules = pgTable("feed_demotion_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** Metro slug filter: sf | bay | chicago | null = all */
  metro: varchar("metro", { length: 32 }),
  /** Exact ingest source id (e.g. funcheap); null = any */
  source: varchar("source", { length: 64 }),
  /** Case-insensitive substring on venue_name */
  venueContains: text("venue_contains"),
  /** Case-insensitive substring on any category id */
  categoryContains: text("category_contains"),
  /** Multiply organic score (0–1). Lower = bury further. */
  scoreMultiplier: doublePrecision("score_multiplier").notNull().default(0.35),
  /** Max cards from the same venue in one feed; null = no venue cap */
  maxPerVenue: integer("max_per_venue"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const recurringShows = pgTable("recurring_shows", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  venueName: text("venue_name").notNull(),
  neighborhood: varchar("neighborhood", { length: 120 }),
  address: text("address"),
  weekday: integer("weekday"),
  nthWeekday: integer("nth_weekday"),
  hour: integer("hour").notNull(),
  minute: integer("minute").notNull().default(0),
  priceHint: varchar("price_hint", { length: 80 }),
  comedySubtype: varchar("comedy_subtype", { length: 40 }).notNull(),
  sourceUrl: text("source_url"),
  trustWeight: doublePrecision("trust_weight").notNull().default(0.8),
  active: boolean("active").notNull().default(true),
  lat: doublePrecision("lat"),
  lng: doublePrecision("lng"),
  city: varchar("city", { length: 32 }).notNull().default("sf"),
});

export const films = pgTable(
  "films",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    year: integer("year"),
    runtimeMinutes: integer("runtime_minutes"),
    mpaa: varchar("mpaa", { length: 16 }),
    synopsis: text("synopsis"),
    tmdbId: integer("tmdb_id"),
    imdbId: varchar("imdb_id", { length: 32 }),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    trailerYoutubeId: varchar("trailer_youtube_id", { length: 32 }),
    ratings: jsonb("ratings")
      .$type<{
        imdb?: number | null;
        rtCritics?: number | null;
        rtAudience?: number | null;
        metacritic?: number | null;
        letterboxd?: number | null;
      }>()
      .notNull()
      .default({}),
    genres: jsonb("genres").$type<string[]>().notNull().default([]),
    letterboxdUrl: text("letterboxd_url"),
    rtUrl: text("rt_url"),
    rtConsensus: text("rt_consensus"),
    reviews: jsonb("reviews")
      .$type<
        {
          source: "letterboxd" | "rotten_tomatoes" | "tmdb";
          author?: string | null;
          content: string;
          url?: string | null;
          rating?: number | null;
        }[]
      >()
      .notNull()
      .default([]),
    lastEnrichedAt: timestamp("last_enriched_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("films_tmdb_id_idx").on(t.tmdbId),
    uniqueIndex("films_imdb_id_idx").on(t.imdbId),
  ],
);

export const theaters = pgTable(
  "theaters",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    chain: varchar("chain", { length: 120 }),
    address: text("address"),
    neighborhood: varchar("neighborhood", { length: 120 }),
    lat: doublePrecision("lat"),
    lng: doublePrecision("lng"),
    sourceTheatreId: varchar("source_theatre_id", { length: 120 }),
  },
  (t) => [uniqueIndex("theaters_source_theatre_id_idx").on(t.sourceTheatreId)],
);

export const showtimes = pgTable(
  "showtimes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    filmId: uuid("film_id")
      .notNull()
      .references(() => films.id, { onDelete: "cascade" }),
    theaterId: uuid("theater_id")
      .notNull()
      .references(() => theaters.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    format: varchar("format", { length: 64 }),
    ticketUrl: text("ticket_url"),
    source: varchar("source", { length: 40 }).notNull().default("tms"),
    sourceShowtimeId: varchar("source_showtime_id", { length: 255 }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("showtimes_source_showtime_id_idx").on(t.source, t.sourceShowtimeId),
  ],
);

export const signals = pgTable(
  "signals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetKind: varchar("target_kind", { length: 20 }).notNull(),
    targetId: uuid("target_id").notNull(),
    type: varchar("type", { length: 20 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("signals_user_target_type_idx").on(
      t.userId,
      t.targetKind,
      t.targetId,
      t.type,
    ),
  ],
);

/** One-time magic link tokens (hashed at rest). */
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull(),
  anonymousUserId: uuid("anonymous_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Long-lived bearer sessions (hashed at rest). */
export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  adapterId: varchar("adapter_id", { length: 64 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: varchar("status", { length: 20 }).notNull().default("running"),
  itemsUpserted: integer("items_upserted").default(0),
  error: text("error"),
});

/**
 * Admin-triggered ingest queue. The long-running `ingest --schedule` process
 * polls pending rows and executes via existing runAll / runAdapter.
 * scope: phase1 | all | adapters
 */
export const ingestJobs = pgTable("ingest_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: varchar("scope", { length: 32 }).notNull(),
  adapterIds: jsonb("adapter_ids").$type<string[]>().notNull().default([]),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  requestedAt: timestamp("requested_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  error: text("error"),
  requestedBy: varchar("requested_by", { length: 64 }),
});

/** Outbound CTA clicks (tickets / register / listing) for affiliates + sales. */
export const outboundClicks = pgTable("outbound_clicks", {
  id: uuid("id").defaultRandom().primaryKey(),
  targetKind: varchar("target_kind", { length: 20 }).notNull(),
  targetId: uuid("target_id").notNull(),
  slot: varchar("slot", { length: 32 }).notNull().default("primary"),
  destinationHost: varchar("destination_host", { length: 255 }),
  affiliateNetwork: varchar("affiliate_network", { length: 64 }),
  city: varchar("city", { length: 64 }),
  source: varchar("source", { length: 64 }),
  userId: uuid("user_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
