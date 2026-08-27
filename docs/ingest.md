# Ingest

Ingest lives in `packages/ingest`. Every source implements:

```ts
interface SourceAdapter {
  id: string;
  description: string;
  fetch(): Promise<{
    events?: NormalizedEvent[];
    showtimes?: NormalizedShowtimeBatch[];
  }>;
}
```

The runner upserts into Postgres and records `ingest_runs`.

## Commands

```bash
# Phase 1 only
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --phase1

# Everything registered
pnpm --filter @bored/ingest exec tsx src/cli.ts --once

# One adapter
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=19hz

# Cron schedules (long-running)
pnpm --filter @bored/ingest exec tsx src/cli.ts --schedule
```

Root aliases: `pnpm ingest:once`, `pnpm ingest`.

## Adapter inventory

### Phase 1

| Adapter id | Source | Needs keys? | Notes |
|---|---|---|---|
| `19hz` | 19hz.info Bay Area HTML | No | Electronic / dance |
| `19hz_chi` | 19hz.info Chicago HTML (`eventlisting_CHI.php`) | No | Same scrape path; `source=19hz`, `city=chicago` |
| `funcheap` | sf.funcheap.com RSS | No | Free/cheap |
| `luma` | Luma public discover JSON | No | Tech / meetups (SF place id). Pulls `cover_url` images + `registration_availability` (open / waitlist / sold-out). Detail page refreshes status via `event/get` when stale (>10m). |
| `luma_chi` | Luma Chicago discover | No | Chicago place id; same `source=luma` |
| `ticketmaster` | Discovery API latlong SF + 50mi | `TICKETMASTER_API_KEY` | Concerts / sports / theater; post-filters to Bay cities (CA). Same-day showtimes coalesced (native TM id kept); multi-day runs capped at **7** local days/title+venue. |
| `ticketmaster_chi` | Discovery API latlong CHI + 40mi | `TICKETMASTER_API_KEY` | Same `source=ticketmaster`; IL only. Same coalesce/cap as SF. |
| `comedy_venue` / `comedy_venue_chi` | TM keyword comedy clubs | `TICKETMASTER_API_KEY` | SF: Cobb's / Punch Line; CHI: Zanies, Laugh Factory, Comedy Bar, Second City, iO. Same coalesce/cap; orphans + legacy group-key ids pruned. |
| `recurring` | `recurring_shows` table | No | One durable row per active show; feed expands weekdays |
| `movies_tms` | Gracenote TMS showtimes | `TMS_API_KEY` | Showtimes + Fandango ticket links; enrich via Letterboxd/RT scrape |
| `do312` | Do312 events.json | No | Chicago local calendar |
| `chicago_cheap` | chicagoonthecheap.com/events/ | No | Free/cheap editorial calendar (Funcheap analog) |
| `ra_chi` / `ra_sf` | Resident Advisor GraphQL | No | Lineup, genres, flyer, age, cost; `source=ra` |
| `eventbrite` | Eventbrite Bay Area discovery HTML | No | SF/Oakland/SJ/Berkeley slugs via embedded `__SERVER_DATA__`; `source=eventbrite` |
| `eventbrite_chi` | Eventbrite Chicago discovery HTML | No | Same scrape path; `source=eventbrite` |

### Phase 2

| Adapter id | Source | Needs keys? | Notes |
|---|---|---|---|
| `partiful` | Partiful explore / JSON | No | Soft-fail / best-effort |
| `newsletter` | Broke-Ass / Eddie’s List RSS | No | Skips digests/guides; needs parseable date |
| `instagram` | Graph business discovery | `IG_ACCESS_TOKEN`, `IG_BUSINESS_USER_ID` | Curated SF handles — food influencers, reels, city accounts |
| `openmic_agg` | SFstandup / OpenMicX | No | Inserts **inactive** recurring proposals |
| `indie_theater` | Roxie calendar HTML | No | Day `film-strip` → film/showtimes + posters (not per-showtime events) |
| `activities` | Curated parks, hikes, local gems | No | SF + Chicago via `curatedActivities.ts` — evergreen tips like food |
| `food` | Infatuation + Eater RSS (+ FOUND SF) | No | Evergreen restaurant tips; SF + Chicago via `FOOD_METRO_CONFIGS` |
| `food_deals` | Curated happy hours & lunch specials | No | SF + Chicago; one durable row per deal + feed expand |

## Category mapping for topic filters

Feed **topic chips** (Concerts, Comedy, Free, Happy hours, …) filter rows via `matchesFeedTopic()` in `packages/shared/src/taxonomy.ts`. They do **not** read adapter ids directly (except food / happy-hour sources). Every adapter must populate `categories[]` with ids from `INTEREST_CATEGORIES` so topic browse works out of the box.

### Required fields on `NormalizedEvent`

| Field | Purpose for topics |
|---|---|
| `categories[]` | Primary signal — e.g. `music.live`, `comedy.club`, `food`, `free` |
| `tags[]` | Genre chips + topic fallbacks (`sports`, `comedy`, `festival`, …) |
| `isFree` | **Free** topic |
| `source` | Food / happy-hour topics; comedy (`comedy_venue`, `recurring`); music (`19hz`, `ra`) fallbacks |
| `title` / `venueName` | Heuristic fallbacks when categories are sparse |
| `rawPayload.dealKind` | **Happy hours** vs lunch (`food_deals`) |

**Anti-pattern:** defaulting unknown listings to only `["nightlife"]` — they disappear from Concerts and Comedy chips.

### Category targets by topic

| Topic | Set on ingest |
|---|---|
| Concerts | `music.live`, `music.electronic`, … + genre tags from source |
| Comedy | `comedy.club`, `comedy.showcase`, `comedy.open_mic`, or `comedy.underground` |
| Movies | `movies` (+ TMS showtime batches for poster cards) |
| Sports | `outdoors` or `nightlife` + tag `sports` |
| Street festivals | tag `festival` / `night market` or title copy |
| Free | `free` category + `isFree: true` when accurate |
| Food / Happy hours | `food` category; `source: food` / `food_deals` |
| Arts & culture | `arts` (+ theatre/museum tags when known) |

Music genres from free-form tags (19hz, RA) should call `enrichCategoriesWithTags()` at ingest **and** feed-read for older rows.

### Per-adapter checklist (new city or backfill)

When shipping or fixing a calendar adapter:

1. Map source-native taxonomy → `INTEREST_CATEGORIES` (reference mappers in [city-seeding.md](./city-seeding.md#reference-mappers-copy-these-patterns))
2. Never emit empty `categories[]`
3. Add scannable `tags[]` for genres and topic fallbacks (skip adapter noise — see `TAG_DISPLAY_NOISE` in `taxonomy.ts`)
4. For Ticketmaster: map **genre**, not just segment — Rock/Alternative → `music.live`
5. For cheap editorial calendars: copy `funcheapTaxonomy` or `categoriesFromText` patterns
6. Run topic smoke SQL + API after ingest (below)

### Topic smoke SQL

Category coverage by source for a metro (replace `'chicago'` as needed):

```sql
SELECT source,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(categories) c WHERE c LIKE 'music.%'
  )) AS music,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(categories) c WHERE c LIKE 'comedy.%'
  )) AS comedy,
  count(*) FILTER (WHERE categories @> '["food"]') AS food,
  count(*) AS total
FROM events
WHERE starts_at > now() AND city = 'chicago'
GROUP BY 1 ORDER BY total DESC;
```

API spot-check (expect `cards.length > 0` after Phase 1 + food):

```bash
AREA=chicago  # or bay / sf
for t in concerts comedy food happy_hours free; do
  echo -n "$t: "
  curl -s "http://localhost:4000/v1/feed?area=$AREA&topics=$t&mode=all&limit=5" \
    | jq '.cards | length'
done
```

Re-ingest updates categories on upsert — no migration needed when mappers improve.

## HTML scrape pitfalls

Lessons from the Roxie calendar adapter — apply when scraping venue / cinema / festival sites that look like “a calendar page” but are really a full WordPress (or similar) site shell.

### Do not scrape all `<a>` tags

Site chrome (primary nav, footer, skip links, newsletter CTAs, “About / Jobs / Rent the venue / Signature Programs”) will look like event titles if you take every link text on the page. Roxie once produced dozens of fake listings (“History @ Roxie Theater”, “Skip to content @ Roxie Theater”, …) all stamped with the same placeholder time.

**Prefer:**

- Calendar / listing containers only (e.g. Roxie’s `#day-YYYY-MM-DD` → `.film-strip` with thumb + showtimes; avoid scraping site chrome)
- Official JSON, iCal, or RSS when available (`/upcoming_events`, `/film/feed/`, etc.) — still validate; feeds may be film runs without exact showtimes
- Stable IDs from the markup (`id="showtime-31750"`) for `sourceShowtimeId`, not `hash(link text + href)` of arbitrary anchors
- Emit **film + showtimes batches** (one card per film) rather than one event per showtime so a single theater cannot flood the feed

**Reject / ignore:**

- Links inside `nav`, `header`, `footer`, `.menu`, `.site-navigation`, skip-to-content
- Paths like `/about-us/`, `/filmmakers/`, `/series/` (series hubs ≠ a showtime), `/membership/`, `/rent-*`, `#`, modal triggers
- Titles that are nav labels: Now Playing, Coming Soon, Newsletter, Staff, Mission, Volunteer, …
- Any item without a **real** start datetime parsed from the listing (never invent “tomorrow 7:30 PM”)

### Smoke-test before upserting

After a scrape change, spot-check: zero titles that match known chrome; starts times spread across real showtimes; URLs point at `/film/…` (or equivalent detail pages), not about/rent/nav pages. If junk already landed in Postgres, delete `WHERE source = '<adapter>'` (and related `signals`) before re-ingesting — upsert alone will not remove obsolete `sourceEventId`s.

## Newsletter / Substack pitfalls

Eddie’s List (and similar Substack calendars) publish **articles**, not Eventbrite-style listings. Treating each RSS `<item>` as one event floods the feed with:

- Paid weekly digests (`/p/…-events-this-week-20260817`, “Bay Area Events This Week: Aug 17–23”)
- City weekend hubs (“Oakland Events This Weekend”, “San Jose …”)
- Evergreen guides (“Where To Go Salsa Dancing…”, “How To Use 311…”, trivia directories, etiquette / grants / news explainers)
- Mega recommendation posts (“Tech Week Event Recommendations”, monthly festival roundups)

Those URLs are often paywalled subscriber posts. Even when free, one post enumerates **many** happenings — it is not itself a single outing with one `startsAt`.

**Rules for newsletter adapters:**

- Skip roundup / guide / hub title+slug patterns; skip soft-paywall teaser copy in the excerpt
- Never invent a placeholder start (“next Friday 7pm”) for a blog post
- Only emit when the item is plausibly **one** dated happening (or, later, LLM/structured extract of child events with real times)
- Prefer sources that already expose per-event APIs (Luma, Ticketmaster, venue calendars) over turning editorial RSS into fake events

## Env keys

| Variable | Used by |
|---|---|
| `DATABASE_URL` | All |
| `TICKETMASTER_API_KEY` | ticketmaster, comedy_venue, comedy_venue_chi |
| `TMS_API_KEY` | movies_tms |
| `TMS_ZIP` | movies_tms (default `94107`) |
| `YOUTUBE_API_KEY` | Optional free YouTube Data API — trailer search when LB/RT pages have no embed |
| `IG_ACCESS_TOKEN` | instagram |
| `IG_BUSINESS_USER_ID` | instagram |

Film metadata (posters, Letterboxd/RT ratings, consensus, review snippets, IMDb id) is scraped in `enrichFilm` — no TMDB/OMDb keys. Trailers prefer YouTube ids found on Letterboxd/RT pages, then `YOUTUBE_API_KEY` search.

Missing optional keys → adapter logs a warning and returns empty (seed data still works).

## Schedules (`--schedule`)

- Every 6h: Phase 1 adapters
- Every 3h: movies TMS
- Daily 06:15: all adapters

## Adding a source

1. Create `packages/ingest/src/adapters/<name>.ts` implementing `SourceAdapter`
2. Map into `NormalizedEvent` (or showtime batch) with stable `source` + `sourceEventId`
3. Register in `ALL_ADAPTERS` / `PHASE1_ADAPTERS` in `runner.ts`
4. Prefer official API or RSS; document ToS/rate-limit caveats in the adapter header comment
5. If scraping HTML calendars, read [HTML scrape pitfalls](#html-scrape-pitfalls) first
6. If ingesting newsletter / Substack RSS, read [Newsletter / Substack pitfalls](#newsletter--substack-pitfalls)
7. Food tips (`food` adapter) are evergreen — use stable near-term dinner `startsAt` slots, not invented showtimes; skip closures / non-dining news. Metro config: `FOOD_METRO_CONFIGS` in `packages/shared/src/foodCityConfig.ts`
8. Activity tips (`activities` adapter) follow the same evergreen slot pattern — UI labels them as recommendations (`Local gem · Hike`, `Classic · Park`), not timed events

## Food recommendation pitfalls

Infatuation / Eater / FOUND publish **reviews and maps**, not ticketed events. Rules:

- Prefer restaurant reviews, maps, hit lists, openings — skip closures, labor news, crowdfunders
- FOUND posts are often paywalled; RSS title + excerpt as the tip is fine (outbound link)
- FOUND Substack `<description>` is the **subtitle**, not the body — single-spot tips use `Place (City)` (e.g. `Pretty Things (Albany)`); digests (`A, B, MORE`) are skipped; parentheticals are geo-gated so product titles like `Headscarf (Hunza G)` are not treated as venues
- FOUND body/subtitle often includes `SECTION • Series` (e.g. `BARS • First Round`, `WORK • Wednesday Routine`). Use that for tip framing (`Bar · First Round`); skip non-hospitality sections like `WORK`, real estate, shopping
- Infatuation ratings (e.g. `9.4`) belong in `rawPayload.rating` / feed `ratings.infatuation` — never bake them into the title
- Never invent a reservation time; `startsAt` is only an internal feed-window slot — UI must label food as recommendations, not timed events
- Infatuation `venue.price` is an ordinal **$–$$$$** count (1–4), not a dollar amount — do not invent USD ranges from it
- Instagram food handles and SF influencer reels go through the `instagram` adapter (Graph API when configured). Reels are prioritized; food tips use the same feed-window slots as the `food` adapter — UI labels them as recommendations, not timed events.

## Food deal pitfalls

Curated happy hours and lunch specials (`food_deals` adapter) differ from evergreen food tips:

- Deals store **one durable row** with `rawPayload.schedule`; ingest sets `startsAt` to the next occurrence. The feed expands matching days into the view for tonight / weekend / by-time; For You keeps one card per deal.
- UI shows schedule on the card (`Happy hour · Mon–Thu · 4:30–6 PM`).
- Source list lives in `packages/shared/src/foodDeals.ts` — `CURATED_FOOD_DEALS_SF` and `CURATED_FOOD_DEALS_CHICAGO`; combined export `CURATED_FOOD_DEALS`
- Chicago rows use `America/Chicago` timezone on materialized events
- Detail pages lazy-enrich from the source URL: Infatuation, Eater SF/CHI (`eater_chi`), SF Chronicle, SF Standard, Tablehopper, FOUND (`foodEditorial.ts`). Google Places photo when `GOOGLE_MAPS_API_KEY` is set and no editorial image exists.
- Verify hours on venue sites before visiting; editorial guides go stale.
- `food` feed filter chip also matches `food_deals` rows.

## Comedy recurring seed

Curated rooms live in `recurring_shows` (see `pnpm db:seed`). Each row includes a `city` slug (`sf`, `chicago`, …). Ingest materializes **one durable `events` row per active show** (`source=recurring`) with schedule in `rawPayload`; `startsAt` is the next occurrence. The feed expands matching weekdays into tonight / weekend / by-time (same pattern as `food_deals`). Comedy subtypes:

- `comedy.club`
- `comedy.showcase`
- `comedy.open_mic`
- `comedy.underground`

**SF seed (5 rooms):** Coit Comedy, Clement St Comedy, Live at Deluxe, Hayes Valley Comedy Night, Open Mic Comedy.

**Chicago seed (7 rooms):** Zanies Open Mic, Comedy Bar Open Mic, Laugh Factory All-Stars, Second City e.t.c., Lincoln Lodge, iO Improv Jam, Annoyance Saturday.

Open-mic aggregator proposals are stored with `active=false` until approved. The adapter caps the inactive queue (40 max; ≤8 new per run) and dedupes by name / venue+weekday.
