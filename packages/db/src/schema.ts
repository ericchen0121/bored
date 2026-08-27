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

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 255 }),
  displayName: varchar("display_name", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userProfiles = pgTable("user_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  interests: jsonb("interests")
    .$type<{ category: string; weight: number }[]>()
    .notNull()
    .default([]),
  neighborhoods: jsonb("neighborhoods").$type<string[]>().notNull().default([]),
  budgetMax: integer("budget_max"),
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
    rawPayload: jsonb("raw_payload"),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("events_source_source_event_id_idx").on(t.source, t.sourceEventId),
  ],
);

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

export const signals = pgTable("signals", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  targetKind: varchar("target_kind", { length: 20 }).notNull(),
  targetId: uuid("target_id").notNull(),
  type: varchar("type", { length: 20 }).notNull(),
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
