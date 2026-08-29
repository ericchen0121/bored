# Data model

Postgres via Drizzle (`packages/db/src/schema.ts`).

## Core tables

### `users` / `user_profiles`

- Demo multi-user ready; v1 keys off `X-User-Id`
- Profile holds interests JSON, neighborhoods, budget, geo, `onboardingComplete`

### `events`

Normalized live events from all non-movie adapters.

Notable columns:

- `source` + `sourceEventId` (unique) — identity
- `kind` — `event` (timed) or `recommendation` (evergreen tip)
- `startsAt`, `endsAt` (optional), `timezone` (IANA, default LA)
- venue / geo / neighborhood / `city`
- `categories[]`, `tags[]`, price / `isFree`
- `recurringShowId` (optional)
- `contentHash` — fingerprint of mutable listing fields (change detection); not a second identity key
- `lastSeenAt`, `rawPayload`
- **Sponsored boost:** `isSponsored`, `sponsorId`, `boostWeight`, `sponsorEndsAt` (ingest upserts do not clear these)
- **`hidden`** — soft-hide from public feed/detail (ops); ingest upserts do not clear

### `sponsors`

Local advertiser / package rows (founder-sold). Linked from `events.sponsorId` when set. Packages: `venue_boost` | `happy_hour` | `festival`. Managed via `/admin/sponsors`.

### `ingest_jobs`

Admin-triggered ingest queue (`phase1` | `all` | `adapters`). Polled by `ingest --schedule`.

### `recurring_shows`

Curated comedy (and similar) templates expanded into `events` by the `recurring` adapter. Includes `city` slug (`sf`, `chicago`, …).

### `films` / `theaters` / `showtimes`

Movie vertical:

- `films` — title, ids (`tmdbId`, `imdbId`), poster/backdrop, YouTube trailer id, `ratings` jsonb (IMDb / RT / Letterboxd), genres, Letterboxd + RT URLs, RT consensus, review snippets
- `theaters` — venue + `sourceTheatreId`
- `showtimes` — film × theater × time (+ ticket URL); `lastSeenAt` for TMS/indie retention GC

### `signals`

User interactions: `saved` | `dismissed` | `going` | `opened` against event/film/showtime targets.

### `ingest_runs`

Adapter run audit: status, upsert count, error text.

### `outbound_clicks`

CTA click log for affiliates and sponsor reporting. Written by `GET /r/e/:id` and `GET /r/s/:id` (destination always from DB). Columns: `targetKind` (`event` \| `showtime`), `targetId`, `slot`, `destinationHost`, `affiliateNetwork`, event `source` / `city`, optional `userId`.

See [Monetization](./monetization.md).

## City conventions

Adapters should set `city` to a slug when known:

- `sf`, `chicago`, `oakland`, `berkeley`, `san_jose`, …

Feed area filtering uses city + neighborhood heuristics (`eventInArea`).

**Time fields:** store wall-clock starts/ends as UTC. Metro defaults (`SF_DEFAULT.timezone` / `CHI_DEFAULT.timezone`) define calendar-day feed windows; per-row `timezone` is for display. Live/happening-now compares UTC instants — see [Architecture → Timezones & live](./architecture.md#timezones--live--earlier-today).

### Curated config (not in Postgres)

Editorial rows that ingest materializes into `events`:

| File | Purpose |
|---|---|
| `packages/shared/src/foodCityConfig.ts` | Per-metro food tip RSS/outlets (`FOOD_METRO_CONFIGS`) |
| `packages/shared/src/foodDeals.ts` | Happy hour / lunch deals (`CURATED_FOOD_DEALS_SF`, `CURATED_FOOD_DEALS_CHICAGO`) |
| `packages/shared/src/curatedActivities.ts` | Evergreen parks, hikes, local gems (when present) |

`recurring_shows` **is** in Postgres — comedy room templates with `city` column.

## Category taxonomy

Interest / event categories live in `packages/shared/src/taxonomy.ts` (`INTEREST_CATEGORIES`), including comedy subtypes, music genres (house / techno / … from 19hz tags), and movie genres.

**Feed topic chips** (`FEED_TOPICS`) are a separate, coarser browse layer: Concerts, Comedy, Movies, Sports, Street festivals, Free, Happy hours, etc. They map onto categories, tags, titles, and source metadata via `matchesFeedTopic()` — not onto ingest adapters.

Free-form `events.tags` are shown on feed cards; `enrichCategoriesWithTags` maps them onto music interest categories for ranking and tastes.

## Migrations

```bash
pnpm db:push      # dev: push schema
pnpm db:generate  # emit SQL into drizzle/
pnpm db:migrate   # apply migrations
pnpm db:seed      # demo user, recurring comedy rooms (SF + Chicago)
```
