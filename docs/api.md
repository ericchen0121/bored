# API

Base URL (local): `http://localhost:4000`

All mutating/personalized routes honor header:

```http
X-User-Id: <uuid>
```

Default demo user: `00000000-0000-4000-8000-000000000001` (`DEMO_USER_ID` / `NEXT_PUBLIC_DEMO_USER_ID`).

CORS allows `localhost` / `127.0.0.1` on any port for local web.

## Health

### `GET /health`

```json
{ "ok": true, "service": "bored-api" }
```

## Meta

### `GET /v1/meta/taxonomy`

Interest categories, neighborhoods, default SF location constants.

## Me / prefs / signals

### `GET /v1/me`

Returns user row, prefs, `onboardingComplete`.

### `PUT /v1/me/interests`

Body (`UserPrefs`):

```json
{
  "interests": [{ "category": "tech", "weight": 0.9 }],
  "neighborhoods": ["SOMA", "Mission"],
  "budgetMax": 60,
  "preferFree": false,
  "nightsOut": true,
  "radiusMiles": 35,
  "lat": 37.7749,
  "lng": -122.4194
}
```

Sets `onboardingComplete: true`.

### `POST /v1/me/signals`

```json
{
  "targetKind": "event" | "film" | "showtime",
  "targetId": "<uuid>",
  "type": "saved" | "dismissed" | "going" | "opened"
}
```

### `GET /v1/me/saved`

Recent save/going signals for the user.

## Events

### `GET /v1/events`

Query: `limit`, `category`, `freeOnly=true`

Upcoming events ordered by `startsAt`.

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
| `mode` | `tonight` \| `weekend` \| `for_you` \| `all` | `for_you` | Time window + ranking strategy |
| `area` | `sf` \| `bay` \| `chicago` | `bay` | Geographic filter (SF proper / Bay / Chicago) |
| `limit` | 1–200 | 40 (100 for `all`) | |
| `date` | `YYYY-MM-DD` | — | Local calendar day (metro timezone). Narrows window to that day; used with `mode=all`. Today = remaining events only. |
| `categories` | comma list | — | Optional hard filter on interest category ids (e.g. `music.electronic`, `comedy.club`) |
| `topics` | comma list | — | Optional hard filter by activity type — not tied to ingest source. Single topic recommended; OR when multiple. Selecting a topic in the web UI clears source filters. See [Topic filters](#topic-filters). |
| `sources` | comma list | — | Optional hard filter by ingest source (`19hz`, `funcheap`, `luma`, `ticketmaster`, …). `ticketmaster` also includes `comedy_venue`; `food` also includes `food_deals`. Hides movie showtimes when set. |
| `freeOnly` | bool | — | |
| `lat` / `lng` / `radiusMiles` | numbers | from prefs | Override location |

#### Topic filters

`topics` accepts ids from `FEED_TOPICS` in `packages/shared/src/taxonomy.ts`. Multiple topics are OR’d (match any selected topic).

| Topic id | Matches |
|---|---|
| `concerts` | `music.*` categories |
| `comedy` | `comedy.*` categories |
| `movies` | `movie_showtime` cards + `movies.*` categories |
| `sports` | Sports-related tags / titles |
| `festivals` | Festival, street fair, block party, night market |
| `free` | `isFree` or `free` category |
| `happy_hours` | `food_deals` rows where `dealKind !== "lunch"` |
| `food` | Food categories + `food` / `food_deals` / food Instagram sources |
| `nightlife` | `nightlife` category + `bars` tag |
| `arts` | `arts` category + theatre / museum / gallery hints |

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
    "budgetMax": 60
  },
  "cards": [
    {
      "kind": "event" | "movie_showtime",
      "id": "...",
      "title": "...",
      "startsAt": "...",
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

See [Ranking](./ranking.md) for scoring details.

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

## Client notes

- Web uses `apps/web/src/lib/api.ts` → `NEXT_PUBLIC_API_URL`
- Feed URL state (`mode`, `area`, `topics`, `sources`, `date`, detail `e`/`m`) is mirrored in session storage via `apps/web/src/lib/feed-prefs.ts`
- **Tastes** (`PUT /v1/me/interests`) affect ranking in personalized modes — they do not filter the feed unless combined with `categories`
- **Topics** (`?topics=concerts,free`) are browse filters by activity type, independent of ingest source
- **Sources** (`?sources=luma,19hz`) filter by adapter provenance; orthogonal to topics
- After saving tastes, navigate to `/?mode=for_you&area=bay` so the feed reloads with new prefs
- Detail panel: desktop opens a fixed right-edge drawer with a Luma-style animated mesh background tinted by event type (`LumaMeshBackground` + `MESH_PALETTES` in `apps/web/src/components/detail/`)
- iOS should use the same `/v1/*` contract; do not talk to Postgres directly
