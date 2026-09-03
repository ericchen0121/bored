import { z } from "zod";
import {
  RECURRING_CATEGORIES,
  EVENT_SOURCES,
  FEED_CITIES,
  FEED_KINDS,
  INTEREST_CATEGORIES,
  REGISTRATION_STATUSES,
  SIGNAL_TYPES,
  EVENT_KINDS,
} from "./taxonomy";

export const RatingsSchema = z.object({
  imdb: z.number().nullable().optional(),
  rtCritics: z.number().nullable().optional(),
  rtAudience: z.number().nullable().optional(),
  metacritic: z.number().nullable().optional(),
  letterboxd: z.number().nullable().optional(),
  /** The Infatuation place score (e.g. 9.4) */
  infatuation: z.number().nullable().optional(),
});

export const FilmReviewSchema = z.object({
  source: z.enum(["letterboxd", "rotten_tomatoes", "tmdb"]),
  author: z.string().nullable().optional(),
  content: z.string(),
  url: z.string().nullable().optional(),
  rating: z.number().nullable().optional(),
});

export const EventSchema = z.object({
  id: z.string().uuid(),
  source: z.enum(EVENT_SOURCES),
  sourceEventId: z.string(),
  kind: z.enum(EVENT_KINDS).optional().default("event"),
  title: z.string(),
  description: z.string().nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable(),
  timezone: z.string(),
  venueName: z.string().nullable(),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  city: z.string(),
  priceMin: z.number().nullable(),
  priceMax: z.number().nullable(),
  isFree: z.boolean(),
  categories: z.array(z.string()),
  tags: z.array(z.string()),
  ageRestriction: z.string().nullable(),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  organizer: z.string().nullable(),
  recurringShowId: z.string().uuid().nullable(),
  registrationStatus: z.enum(REGISTRATION_STATUSES).nullable().optional(),
  registrationCheckedAt: z.string().datetime().nullable().optional(),
  contentHash: z.string(),
  lastSeenAt: z.string().datetime(),
});

export const FilmSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  year: z.number().nullable(),
  runtimeMinutes: z.number().nullable(),
  mpaa: z.string().nullable(),
  synopsis: z.string().nullable(),
  tmdbId: z.number().nullable(),
  imdbId: z.string().nullable(),
  posterUrl: z.string().nullable(),
  backdropUrl: z.string().nullable(),
  trailerYoutubeId: z.string().nullable(),
  ratings: RatingsSchema,
  genres: z.array(z.string()),
  letterboxdUrl: z.string().nullable(),
  rtUrl: z.string().nullable(),
  rtConsensus: z.string().nullable(),
  reviews: z.array(FilmReviewSchema).optional(),
  lastEnrichedAt: z.string().datetime().nullable(),
});

export const TheaterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  chain: z.string().nullable(),
  address: z.string().nullable(),
  neighborhood: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  sourceTheatreId: z.string().nullable(),
});

export const ShowtimeSchema = z.object({
  id: z.string().uuid(),
  filmId: z.string().uuid(),
  theaterId: z.string().uuid(),
  startsAt: z.string().datetime(),
  format: z.string().nullable(),
  ticketUrl: z.string().nullable(),
  source: z.string(),
});

export const InterestWeightSchema = z.object({
  category: z.enum(INTEREST_CATEGORIES),
  weight: z.number().min(0).max(1),
});

export const UserPrefsSchema = z.object({
  interests: z.array(InterestWeightSchema),
  neighborhoods: z.array(z.string()),
  /** When true, hard-filter For you / weekend by {@link budgetTier}. */
  budgetEnabled: z.boolean().optional().default(false),
  /** Max price band $–$$$$ (1–4). Ignored when budgetEnabled is false. */
  budgetTier: z
    .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)])
    .nullable()
    .optional(),
  /**
   * @deprecated Legacy USD ceiling. Prefer budgetTier + budgetEnabled.
   * Still accepted on write for older clients; mapped to a tier server-side.
   */
  budgetMax: z.number().nullable().optional(),
  preferFree: z.boolean().optional(),
  nightsOut: z.boolean().optional(),
  radiusMiles: z.number().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const SignalInputSchema = z.object({
  targetKind: z.enum(["event", "film", "showtime"]),
  targetId: z.string().uuid(),
  type: z.enum(SIGNAL_TYPES),
});

export const MagicLinkRequestSchema = z.object({
  email: z.string().email().max(255),
  /** Where to send the user after verify (path only, e.g. `/sf` or `/events/uuid`). */
  returnTo: z.string().max(512).optional(),
  /** Metro for city-flavored magic-link email copy + hero (`sf` | `chicago` | `la`). */
  city: z.enum(FEED_CITIES).optional(),
});

export const AuthVerifyResponseSchema = z.object({
  sessionToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().nullable(),
    displayName: z.string().nullable(),
  }),
});

export const FeedQuerySchema = z.object({
  mode: z.preprocess(
    (v) => {
      if (v === "tonight") return "today";
      if (v === "all") return "date";
      return v;
    },
    z.enum(["for_you", "today", "weekend", "date"]).default("today"),
  ),
  area: z.enum(["sf", "bay", "chicago", "la"]).default("bay"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radiusMiles: z.coerce.number().optional(),
  categories: z.string().optional(),
  /** Comma-separated FEED_TOPICS ids (concerts, free, happy_hours, …) */
  topics: z.string().optional(),
  /** Comma-separated EVENT_SOURCES / FEED_FILTER_SOURCES ids */
  sources: z.string().optional(),
  freeOnly: z.coerce.boolean().optional(),
  /** Local calendar day `YYYY-MM-DD` (metro timezone) — narrows feed to that day */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Select-date overview / calendar meta needs a wide window (web uses 500). */
  limit: z.coerce.number().min(1).max(500).default(40),
  /**
   * Progressive feed: `exclude` = events only (fast paint), `only` = reels/shorts
   * carousel pool, `include` = both (default, back-compat / map).
   */
  videos: z.enum(["include", "exclude", "only"]).default("include"),
});

export const FeedCardSchema = z.object({
  kind: z.enum(FEED_KINDS),
  id: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  startsAt: z.string().datetime(),
  /** When known — used for live/happening-now; omit if source has no end. */
  endsAt: z.string().datetime().nullable().optional(),
  imageUrl: z.string().nullable(),
  venueName: z.string().nullable(),
  neighborhood: z.string().nullable(),
  /** Present when known — used for map pins; omitted/null when source has no coords. */
  lat: z.number().nullable().optional(),
  lng: z.number().nullable().optional(),
  categories: z.array(z.string()),
  /** Free-form style tags (e.g. 19hz house/techno) for feed scanning */
  tags: z.array(z.string()).optional(),
  /** Ingest provenance (19hz, luma, …) — not the event type */
  source: z.string().nullable().optional(),
  registrationStatus: z.enum(REGISTRATION_STATUSES).nullable().optional(),
  isFree: z.boolean().optional(),
  priceLabel: z.string().nullable().optional(),
  /**
   * Food tip framing from FOUND (`Bar · First Round`) or similar.
   * When set, feed/detail should prefer this over a generic “Restaurant tip”.
   */
  recommendationLabel: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  score: z.number(),
  bucket: z.enum(["affinity", "adjacent", "serendipity"]),
  /** Native boost — labeled in UI; placed by injectSponsoredIntoFeed. */
  isSponsored: z.boolean().optional(),
  /** Relative priority among sponsored cards (higher first). */
  boostWeight: z.number().optional(),
  filmId: z.string().uuid().optional(),
  ratings: RatingsSchema.optional(),
  showtimesPreview: z
    .array(
      z.object({
        startsAt: z.string().datetime(),
        theaterName: z.string(),
        ticketUrl: z.string().nullable(),
      }),
    )
    .optional(),
  /** Extra times beyond showtimesPreview (full list on event details). */
  showtimesMoreCount: z.number().int().nonnegative().optional(),
  /** Native video URL when source is Instagram / YouTube (reels + shorts). */
  mediaUrl: z.string().nullable().optional(),
  /** REELS, VIDEO, or SHORT — drives reels layout + embeds. */
  mediaType: z.string().nullable().optional(),
  /** Source publish time (IG/YouTube) — prefer over startsAt for tip “posted” UI. */
  publishedAt: z.string().datetime().nullable().optional(),
});

export const RecurringShowSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  venueName: z.string(),
  neighborhood: z.string().nullable(),
  address: z.string().nullable(),
  weekday: z.number().min(0).max(6).nullable(),
  nthWeekday: z.number().nullable(),
  hour: z.number(),
  minute: z.number(),
  priceHint: z.string().nullable(),
  /** Interest category — comedy.* or music.* (DB column still `comedy_subtype`). */
  comedySubtype: z.enum(RECURRING_CATEGORIES),
  sourceUrl: z.string().nullable(),
  trustWeight: z.number(),
  active: z.boolean(),
});

export type Event = z.infer<typeof EventSchema>;
export type Film = z.infer<typeof FilmSchema>;
export type Theater = z.infer<typeof TheaterSchema>;
export type Showtime = z.infer<typeof ShowtimeSchema>;
export type UserPrefs = z.infer<typeof UserPrefsSchema>;
export type FeedCard = z.infer<typeof FeedCardSchema>;
export type FeedQuery = z.infer<typeof FeedQuerySchema>;
export type SignalInput = z.infer<typeof SignalInputSchema>;
export type Ratings = z.infer<typeof RatingsSchema>;
export type FilmReview = z.infer<typeof FilmReviewSchema>;
export type RecurringShow = z.infer<typeof RecurringShowSchema>;
