# API

Base URL (local): `http://localhost:4000`

All mutating/personalized routes honor header:

```http
X-User-Id: <uuid>
```

Default demo user: `00000000-0000-4000-8000-000000000001` (`DEMO_USER_ID` / `NEXT_PUBLIC_DEMO_USER_ID`).

CORS allows `localhost` / `127.0.0.1` and private LAN IPs (RFC1918) on any port for local web / phone testing (`pnpm dev`).

## Health

### `GET /health`

```json
{ "ok": true, "service": "bored-api" }
```

## Meta

### `GET /v1/meta/taxonomy`

Interest categories, per-metro neighborhoods, location constants.

| Field | Notes |
|---|---|
| `neighborhoods` | Legacy flat list — **SF / Bay only**. Prefer `neighborhoodsByCity`. |
| `neighborhoodsByCity` | `{ sf: [...], chicago: [...] }` — chips for tastes onboarding |
| `defaultLocation` | `SF_DEFAULT` |
| `locations` | `{ sf, chicago }` metro defaults |

### `GET /v1/geo`

Resolve the nearest feed city for cold start.

| Query | Notes |
|---|---|
| `lat`, `lng` | Optional. When both present, nearest metro is computed from coords. |
| _(none)_ | Uses request IP (`X-Forwarded-For` / `CF-Connecting-IP` / `X-Real-IP`) via IP geolocation. |

Response:

```json
{
  "city": "sf" | "chicago",
  "area": "bay" | "chicago",
  "lat": 37.77,
  "lng": -122.42,
  "source": "coords" | "ip" | "default"
}
```

`source: "default"` means lookup failed (private/local IP, timeout, etc.) — client should fall back (timezone heuristic → SF Bay). The web app only calls this when URL/`sessionStorage` have no city yet.

## Me / prefs / signals

### `GET /v1/me`

Returns user row, prefs, `onboardingComplete`.

### `PUT /v1/me/interests`

Body (`UserPrefs`):

```json
{
  "interests": [{ "category": "tech", "weight": 0.9 }],
  "neighborhoods": ["SOMA", "Mission"],
  "budgetEnabled": true,
  "budgetTier": 2,
  "preferFree": false,
  "nightsOut": true,
  "radiusMiles": 35,
  "lat": 37.7749,
  "lng": -122.4194
}
```

`budgetTier` is 1–4 (`$`–`$$$$`). When `budgetEnabled` is true, For you / Weekend hard-filter above that band. Legacy `budgetMax` (USD) is still accepted and mapped to a tier.

Sets `onboardingComplete: true`.

### `POST /v1/me/signals`

```json
{
  "targetKind": "event" | "film" | "showtime",
  "targetId": "<uuid>",
  "type": "saved" | "dismissed" | "going" | "opened" | "impressed"
}
```

`impressed` / `opened` upsert and refresh `createdAt` (TTL soft-hides for the reels carousel). Other types are insert-or-return-existing.

### `GET /v1/me/saved`

Recent save/going signals for the user.

## Events

### `GET /v1/events`

Query: `limit`, `category`, `freeOnly=true`

Upcoming events ordered by `startsAt`.

### `GET /v1/seo/sitemap`

Public crawl hints for the web sitemap (no auth). Query: `limit` (default 5000, max 5000).

Returns upcoming timed `events` (next 90 days, `kind=event`, not hidden) and distinct `films` with future showtimes:

```json
{
  "events": [{ "id": "uuid", "lastModified": "ISO8601" }],
  "films": [{ "id": "uuid", "lastModified": "ISO8601" }]
}
```

### `GET /v1/events/:id`

Single event or `404`.

Side effects on detail open:
- **Luma** — refresh registration / cover when `registrationCheckedAt` is older than 10 minutes
- **Funcheap** — if `description` is empty, scrape the Funcheap post once for blurb + external “Event Details” URL, then cache on the row

## Movies

### `GET /v1/movies`

Film catalog (enriched via Letterboxd/RT scrape when ingest ran).

### `GET /v1/movies/:id`

Film + showtimes for `?date=YYYY-MM-DD` (defaults to today window). Includes trailer YouTube id, RT URL/consensus, Letterboxd URL, and review snippets when enrichment populated them.

### `GET /v1/movies/showtimes`

Tonight’s showtimes joined with film + theater.

## Feed

### `GET /v1/feed`

Primary product endpoint.

| Query | Values | Default | Notes |
|---|---|---|---|
| `mode` | `for_you` \| `today` \| `weekend` \| `date` | `today` | Time window + ranking strategy (legacy `tonight`→`today`, `all`→`date`). Web cold-start / no-`?mode=` lands on **Today**; **For you** is opt-in via mode switch or explicit URL. |
| `area` | `sf` \| `bay` \| `chicago` | `bay` | Geographic filter (SF proper / Bay / Chicago) |
| `limit` | 1–200 | 40 (200 for `all` / `date`) | |
| `date` | `YYYY-MM-DD` | — | Local calendar day in the **metro** timezone (`SF_DEFAULT` / `CHI_DEFAULT`). Used with `mode=all`. Full day window `[midnight, next midnight)` — including earlier today. Web collapses finished (non-live) rows behind “View earlier” when browsing Today. |
| `categories` | comma list | — | Optional hard filter on interest category ids (e.g. `music.electronic`, `comedy.club`) |
| `topics` | comma list | — | Optional hard filter by activity type — not tied to ingest source. Single topic recommended; OR when multiple. Selecting a topic in the web UI clears source filters. See [Topic filters](#topic-filters). |
| `sources` | comma list | — | Optional hard filter by ingest source (`19hz`, `funcheap`, `luma`, `ticketmaster`, …). `ticketmaster` also includes `comedy_venue`; `food` also includes `food_deals`. Hides movie showtimes when set. |
| `freeOnly` | bool | — | |
| `lat` / `lng` / `radiusMiles` | numbers | from prefs | Override location |
| `videos` | `include` \| `exclude` \| `only` | `include` | Progressive paint: web Today/For you fetch `exclude` (events) + `only` (reels) in parallel so the timeline paints before the carousel. `include` keeps a single payload (map / back-compat). Dense topic chips (`concerts`, `nightlife`, …) paint instantly from the warm All list on the client; curated topics (`food`, `happy_hours`, …) soft-fetch / idle-prefetch. |

#### Topic filters

`topics` accepts ids from `FEED_TOPICS` in `packages/shared/src/taxonomy.ts`. Multiple topics are OR’d (match any selected topic).

| Topic id | Matches |
|---|---|
| `concerts` | `music.*` categories (incl. recurring jazz residencies) |
| `comedy` | `comedy.*` categories; `comedy_venue`; comedy recurring rooms only |
| `movies` | `movie_showtime` cards + `movies.*` categories |
| `sports` | Sports-related tags / titles |
| `festivals` | Festival, street fair, block party, night market |
| `free` | `isFree` or `free` category |
| `happy_hours` | `food_deals` rows where `dealKind !== "lunch"` |
| `food` | Food categories + `food` / `food_deals` / food Instagram sources |
| `nightlife` | `nightlife` category + `bars` tag |
| `arts` | `arts` category + museum / gallery hints (theater has its own topic) |
| `theater` | `theater` / `stage_venue` sources + `arts` + Broadway/musical/play tags |

Matching logic: `matchesFeedTopic()` / `matchesAnyFeedTopic()` in `taxonomy.ts`. Uses `categories[]` first, then source (`19hz`, `comedy_venue`, …), tags, title, and venue heuristics — no separate topic tags at ingest.

Response:

```json
{
  "mode": "for_you",
  "area": "bay",
  "generatedAt": "...",
  "prefsSummary": {
    "interests": ["tech", "comedy.underground"],
    "neighborhoods": ["SOMA"],
    "budgetEnabled": true,
    "budgetTier": 2,
    "budgetMax": 45
  },
  "cards": [
    {
      "kind": "event" | "movie_showtime",
      "id": "...",
      "title": "...",
      "startsAt": "...",
      "endsAt": "..." | null,
      "bucket": "affinity" | "adjacent" | "serendipity",
      "score": 0.91,
      "categories": [],
      "filmId": "...",
      "ratings": { "imdb": 7.6, "rtCritics": 97, "rtAudience": 88, "letterboxd": 3.8 },
      "showtimesPreview": []
    }
  ]
}
```

See [Ranking](./ranking.md) for scoring details. Timezones, live/happening-now, and “View earlier”: [Architecture → Timezones & live](./architecture.md#timezones--live--earlier-today).

## Outbound redirects (affiliates)

Open-redirect safe: destination is always loaded from Postgres, never from a query URL.

### `GET /r/e/:eventId`

Resolves event primary (`eventDetailsUrl` ‖ `url`) or secondary (`sourcePageUrl`) CTA.

Query: `slot=primary` (default) | `secondary`

Response: `302` to rewritten URL (UTMs + optional Ticketmaster/Eventbrite affiliate ids). Logs a row to `outbound_clicks`.

### `GET /r/s/:showtimeId`

Resolves `showtimes.ticketUrl` → same rewrite + log (`slot=tickets`).

Env: `TICKETMASTER_AFFILIATE_ID`, `EVENTBRITE_AFFILIATE_CODE`, `OUTBOUND_UTM_SOURCE`, `OUTBOUND_UTM_MEDIUM`.

Web: `apps/web/src/lib/outbound.ts`. Full strategy: [Monetization](./monetization.md).

## Admin (`/v1/admin/*`)

Requires `Authorization: Bearer <ADMIN_TOKEN>` (or `X-Admin-Token`). See [Admin](./admin.md).

| Method | Path | Notes |
|---|---|---|
| GET | `/v1/admin/health` | Auth check |
| GET | `/v1/admin/deploys` | Railway latest deploy per service + recent history |
| GET | `/v1/admin/ingest/adapters` | Adapter ids + last run + static schedules |
| GET | `/v1/admin/ingest/runs` | Paginated run history |
| GET/POST | `/v1/admin/ingest/jobs` | Queue / enqueue (`phase1` \| `all` \| `adapters`) |
| GET | `/v1/admin/events` | Search listings |
| GET/PATCH | `/v1/admin/events/:id` | Detail + ops edits |
| GET/POST/PATCH/DELETE | `/v1/admin/demotion-rules` | Feed demotion rules |
| GET | `/v1/admin/venues/suggest` | Venue name typeahead (`?q=&metro=&limit=`) |
| GET | `/v1/admin/stats/tag-coverage` | Per-source category/tag gaps |
| GET/POST | `/v1/admin/sponsors` | Sponsor CRM |
| GET/PATCH | `/v1/admin/sponsors/:id` | |
| POST | `/v1/admin/sponsors/:id/boosts` | Attach boost to event |
| DELETE | `/v1/admin/sponsors/:id/boosts/:eventId` | Clear boost |
| GET | `/v1/admin/stats/sponsors` | Inventory health |
| POST | `/v1/admin/stats/sponsors/clear-stale` | Clear expired boosts |
| GET | `/v1/admin/stats/outbound` | Click rollups (`?days=&city=&sponsorId=`) |

## Client notes

- Web uses `apps/web/src/lib/api.ts` → `NEXT_PUBLIC_API_URL`
- Feed URL state (`mode`, `area`, `topics`, `sources`, `date`, detail `e`/`m`) is mirrored in session storage via `apps/web/src/lib/feed-prefs.ts`
- **Landing:** `/` and `/{city}` without `?mode=` always open **Today** (fast shared cache for anon and signed-in). Signed-in users with tastes get a background prefetch of For you into the client feed cache so the mode switch feels instant.
- **Tastes** (`PUT /v1/me/interests`) affect ranking in personalized modes — they do not filter the feed unless combined with `categories`
- **Topics** (`?topics=concerts,free`) are browse filters by activity type, independent of ingest source
- **Sources** (`?sources=luma,19hz`) filter by adapter provenance; orthogonal to topics
- After saving tastes, navigate to `/?mode=for_you&area=bay` so the feed reloads with new prefs
- Detail panel: desktop opens a fixed right-edge drawer with a Luma-style animated mesh background tinted by event type (`LumaMeshBackground` + `MESH_PALETTES` in `apps/web/src/components/detail/`)
- **Today:** finished events stay in the payload; UI hides them behind a subtle “View N earlier” toggle. Live events stay visible with a pulsing **Now** badge (`LiveNowBadge`, `isHappeningNow` in `@bored/shared`)
- iOS should use the same `/v1/*` contract; do not talk to Postgres directly
