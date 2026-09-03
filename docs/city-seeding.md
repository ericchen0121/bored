# City seeding plan

How to bring a new metro to parity with SF's vertical depth. SF is the reference implementation. **Chicago** is MVP-complete (Phase 1 + food + comedy + activities + hero). **Los Angeles** is the active expansion target. **Movies showtimes** (TMS) are **deferred** for Chicago and LA until a city-scoped `movies_tms` refactor ships.

## Current state

### Chicago — live today

**Phase 1 — event calendars**

| Adapter | Source | Categories served |
|---|---|---|
| `19hz_chi` | 19hz.info Chicago | Electronic / dance |
| `ra_chi` | Resident Advisor | Clubs / DJs |
| `do312` | Do312 events.json | Nightlife, arts, local |
| `chicago_cheap` | chicagoonthecheap.com | Free / cheap |
| `luma_chi` | Luma Chicago discover | Tech / meetups |
| `ticketmaster_chi` | Ticketmaster Discovery (IL) | Concerts, sports, theater |
| `eventbrite_chi` | Eventbrite Chicago HTML | General discovery |

**Phase A–C — food + comedy (shipped)**

| Adapter | Source | Notes |
|---|---|---|
| `food` | Infatuation + Eater Chicago RSS | Evergreen tips via `FOOD_METRO_CONFIGS` |
| `food_deals` | `CURATED_FOOD_DEALS_CHICAGO` (10 deals) | One durable row per deal + feed expand; `America/Chicago` |
| `recurring` | `recurring_shows` (comedy + jazz/punk/blues rooms) | Zanies… + Green Mill, Empty Bottle, Kingston Mines, … |
| `comedy_venue_chi` | Ticketmaster keyword search | Same `source=comedy_venue` as SF |
| `music_venue_chi` | Ticketmaster keyword search | Metro, Thalia Hall, Salt Shed, Empty Bottle, … |

**Evergreen activities** — see [City expansion strategy](./city-expansion-strategy.md); `activities` adapter when curated rows exist for CHI.

**Source filter chips** (`CHI_FEED_FILTER_SOURCES`): `19hz`, `ra`, `do312`, `chicago_cheap`, `luma`, `ticketmaster`, `eventbrite`, `food`, `recurring`. **Things to do** is a topic chip (`activities`), not a source chip.

### Chicago — missing vs SF

| Gap | SF reference | Priority |
|---|---|---|
| Movies showtimes | `movies_tms` (zip `60601`) | **Deferred** — CHI only gets event-tagged listings until TMS CHI |
| Indie cinema | `indie_theater` (Roxie pattern) | **P2** — Music Box, Gene Siskel, etc. |
| Instagram food | `instagram` curated handles | **P2** — optional without Graph API keys |
| Newsletters | `newsletter` RSS | **P3** — harder to parse; low ROI initially |
| Partiful | `partiful` explore | **P3** — best-effort; verify CHI coverage first |
| Open mic proposals | `openmic_agg` | **P3** — SF-only aggregator today |

**Shipped in Chicago (topic-ready):** food tips, food deals, comedy recurring + `comedy_venue_chi`, live music rooms (`music_venue_chi` + Green Mill / Empty Bottle / blues recurring), evergreen activities. Re-ingest after TM category fixes if Concerts/Comedy chips look thin — see [Topic filter categorization](#topic-filter-categorization-every-metro).

## Seeding principles

1. **Same tables, same sources enum** — new city = rows with `city: "chicago"`, not new schema
2. **Prefer city config over copy-paste adapters** — factory pattern from `ticketmaster.ts` / `luma.ts`
3. **Seed curated data in shared or db seed** — recurring rooms and food deals are editorial, not scrape
4. **Hard metro isolation** — every adapter must set `city`; smoke-test with `area=chicago`
5. **Ship vertical slices** — food tips before food deals before comedy before movies; each slice is independently valuable
6. **No placeholder events** — seed only durable templates (`recurring_shows`, curated deals); live listings come from ingest
7. **Evergreen activities for every city** — hikes, parks, signature walks, and local gems (arcade bars, thrift, food yards, mini-golf, murals) in **iconic vs local-gem** layers; see [City expansion strategy](./city-expansion-strategy.md)
8. **Topic-ready categories on every row** — feed topic chips (Concerts, Comedy, Free, …) filter on `categories[]`, tags, title, and source — not on adapter id alone. See [Category mapping for topic filters](./ingest.md#category-mapping-for-topic-filters).

## Topic filter categorization (every metro)

Topic chips (`FEED_TOPICS` in `taxonomy.ts`) are **not** separate tags you add at the end — they match normalized rows via `matchesFeedTopic()`. Food looks easiest because adapters set `categories: ["food"]` and `source: food` / `food_deals`. Concerts and Comedy fail when rows only have `nightlife`, `tech`, or bare `free`.

### What each topic needs from ingest

| Topic chip | Minimum `categories[]` | Also matches via |
|---|---|---|
| **Concerts** | Any `music.*` (`music.live`, `music.electronic`, …) | `source` `19hz` / `ra` / `music_venue`; genre tags; title/venue heuristics; jazz/punk **recurring** rooms |
| **Comedy** | Any `comedy.*` | `source` `comedy_venue`; comedy **recurring** rooms only (not all `recurring`) |
| **Movies** | `movies` or showtime cards | `kind: movie_showtime` (SF/Bay TMS today) |
| **Sports** | — | `sports` tag; sports copy in title/tags |
| **Street festivals** | — | `festival`, `block party`, `night market` in tags/title |
| **Free** | `free` and/or `isFree: true` | Funcheap / cheap calendars usually set both |
| **Happy hours** | — | `source: food_deals`, `dealKind !== lunch` |
| **Food & drink** | `food` | `food` / `food_deals` / food Instagram sources |
| **Nightlife** | `nightlife` | `bars` tag |
| **Arts & culture** | `arts` | theatre / museum / gallery hints in tags/title |

**Rule for new adapters:** always set at least one `INTEREST_CATEGORIES` id on `categories[]`. Defaulting everything to `nightlife` breaks Concerts/Comedy topic browse.

### Reference mappers (copy these patterns)

| Metro calendar | File | Notes |
|---|---|---|
| Funcheap (SF) | `funcheap.ts` → `funcheapTaxonomy()` | Comedy / live music / festival slugs → categories |
| Chicago on the Cheap | `chicagoCheap.ts` → `categoriesFromText()` | Title/body heuristics; always includes `free` |
| Do312 | `do312.ts` → `mapDo312Categories()` | Category string → music/comedy/movies/… |
| Eventbrite | `eventbrite.ts` → `mapEbCategories()` | EB category tags + title fallback |
| Ticketmaster | `ticketmaster.ts` → `mapTmCategories()` | Segment **and** genre → `music.live`; sports → `outdoors` + `sports` tag |
| 19hz / RA | `nineteenHz.ts`, `ra.ts` | Base `music.electronic` + `enrichCategoriesWithTags()` |
| Comedy clubs | `ticketmaster.ts` → `comedy_venue` / `comedy_venue_chi` / `comedy_venue_la` | Force `comedy.club` + standup tags |
| Concert rooms | `ticketmaster.ts` → `music_venue` / `music_venue_chi` / `music_venue_la` | Force `music.*` / `music.live` |
| Recurring rooms | `recurringComedy.ts` | Uses `recurring_shows.comedy_subtype` (`comedy.*` **or** `music.*`) |
| Food / deals | `food.ts`, `foodDeals.ts` | `food` category + correct `source` |

Full contract: [Category mapping for topic filters](./ingest.md#category-mapping-for-topic-filters).

### Chicago — topic coverage today

Phase 1 adapters **do** categorize most rows (verified against live DB):

| Source | Concerts (`music.*`) | Comedy (`comedy.*`) | Food |
|---|---|---|---|
| `19hz` | ✅ | — | — |
| `ra` | ✅ | — | — |
| `ticketmaster` | ✅ (partial — some rows were `nightlife`-only) | ✅ (partial) | — |
| `comedy_venue` | — | ✅ | — |
| `recurring` | ✅ jazz/blues/punk | ✅ comedy | — |
| `do312` | ✅ | ✅ | ✅ |
| `chicago_cheap` | ✅ | ✅ (title heuristics) | ✅ |
| `eventbrite` | ✅ | ✅ | ✅ |
| `food` / `food_deals` | — | — | ✅ |
| `luma` | — | — | — (tech meetups → **Arts & culture** / tastes, not Concerts) |

**Chicago backfill (after TM category fixes):** re-run ingest so Ticketmaster rows pick up genre-based `music.*` and `sports` tags — upsert updates existing rows in place.

```bash
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=ticketmaster_chi,comedy_venue_chi,music_venue_chi,recurring,do312,chicago_cheap,19hz_chi,ra_chi,eventbrite_chi,food,food_deals,activities
```

**Movies topic in Chicago:** still weak until Phase D (TMS CHI) — `topics=movies` may only surface Eventbrite/festival listings tagged `movies`, not poster showtime cards.

### Los Angeles — MVP status

**Slug:** `la` (`/la`, `area=la`). **Movies TMS deferred** (same as Chicago).

Phase 1 + food + comedy + activities + hero shipped in code. Live adapters:

| Adapter id | Source chip | Notes |
|---|---|---|
| `ticketmaster_la` | ticketmaster | CA geo, 50mi around DTLA |
| `luma_la` | luma | Discover LA place id |
| `ra_la` | ra | RA area id 18 |
| `19hz_la` | 19hz | `eventlisting_LosAngeles.php` |
| `eventbrite_la` | eventbrite | `ca--los-angeles` slug |
| `dola` | dola | DoLA local calendar (all events; `is_free` → Free topic) |
| `comedy_venue_la` | ticketmaster | Comedy Store (Original + Belly), Laugh Factory, Improv, Flappers, Largo, … |
| `music_venue_la` | ticketmaster | Troubadour, Fonda, Wiltern, Palladium, Zebulon, Lodge Room, … |
| `recurring` | recurring | LA comedy + jazz/indie rooms in `recurring_shows` seed |
| `food` / `food_deals` | food | Eater LA + Infatuation LA; curated deals |
| `activities` | activities | `CURATED_ACTIVITIES_LA` (22 rows) |

**No dedicated LA cheap-calendar HTML adapter in v1** — Free topic uses DoLA `is_free` + Eventbrite; editorial sites (Free in LA, GoHiLo) were unreachable at research time.

```bash
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=ticketmaster_la,luma_la,ra_la,19hz_la,eventbrite_la,dola,comedy_venue_la,music_venue_la,recurring,food,food_deals,activities
```

**Topic smoke (`area=la`):**

```bash
curl -s 'http://127.0.0.1:4000/v1/feed?area=la&topics=concerts&mode=all&limit=5' | jq '.cards | length'
curl -s 'http://127.0.0.1:4000/v1/feed?area=la&topics=comedy&mode=all&limit=5' | jq '.cards | length'
curl -s 'http://127.0.0.1:4000/v1/feed?area=la&topics=food&mode=all&limit=5' | jq '.cards | length'
curl -s 'http://127.0.0.1:4000/v1/feed?area=la&topics=activities&mode=all&limit=5' | jq '.cards | length'
curl -s 'http://127.0.0.1:4000/v1/feed?area=la&topics=free&mode=all&limit=5' | jq '.cards | length'
```

**TZ detect:** `America/Los_Angeles` returns `null` from `feedCityFromTimeZone` (ambiguous SF vs LA) — prefer coords → prefs → default.


**Status:** Shipped. `FOOD_METRO_CONFIGS` drives SF + Chicago via the single `food` adapter.

**Work items:**

1. **Refactor `food` adapter for multi-city** ✅
   - `packages/shared/src/foodCityConfig.ts` — SF + CHI configs
   - `packages/ingest/src/adapters/food.ts` — loops configs; FOUND SF only

2. **Extend `foodEditorial.ts`** ✅
   - `eater_chi` outlet for `chicago.eater.com` detail enrich

3. **Taxonomy** ✅
   - `food` added to `CHI_FEED_FILTER_SOURCES`

4. **Smoke test** ✅
   ```bash
   pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=food
   # ~35 Chicago rows, ~83 SF rows (as of initial seed)
   ```

**Follow-ups (optional polish):**

- Filter Eater CHI roundups for out-of-metro cities (e.g. South Bend guides)
- Add Time Out Chicago RSS if Atom feed is stable
- Tighten `cityFromText` for Evanston/Oak Park suburbs vs `chicago` slug

**Acceptance:** ≥15 evergreen food tips, detail enrich works on Infatuation + Eater CHI URLs, UI shows recommendation label.

---

### Phase B — Food deals (P1) ✅

**Status:** Shipped. `CURATED_FOOD_DEALS_CHICAGO` (10 deals) + city-aware timezone in `foodDeals` adapter.

**Smoke test:**

```bash
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=food_deals
# Expect ~10 Chicago rows (one durable row per curated deal; feed expands weekdays)
```

**Work items:**

1. **City-scope curated deals** ✅ — `packages/shared/src/foodDeals.ts`
2. **Update `foodDeals` adapter** ✅ — `America/Chicago` for CHI rows via `timezoneForCity()`
3. **Taxonomy** ✅ — `expandSourceFilter('food')` already includes `food_deals`

---

### Phase C — Comedy depth (P1) ✅

**Status:** Shipped. `recurring_shows.city` column, Chicago seed (7 rooms), `comedy_venue_chi` adapter.

**Smoke test:**

```bash
pnpm db:push && pnpm db:seed
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=recurring,comedy_venue_chi
# Expect ~7 recurring CHI rooms (one row each) + comedy_venue listings (with TICKETMASTER_API_KEY)
```

**Work items:**

1. **Schema: `city` on `recurring_shows`** ✅
2. **Seed Chicago recurring rooms** ✅ — Zanies, Comedy Bar, Laugh Factory, Second City, Lincoln Lodge, iO, Annoyance
3. **`comedy_venue_chi` adapter** ✅ — TM keyword search for Chicago clubs
4. **Taxonomy** ✅ — `recurring` added to `CHI_FEED_FILTER_SOURCES`

---

### Phase D — Movies (deferred)

**Status:** Deferred for Chicago and new metros at MVP. `movies_tms` remains SF/Bay-only (`TMS_ZIP` default `94107`).

**Goal (when resumed):** Movie showtime cards in Chicago / LA feeds.

**Work items:**

1. **City-scoped TMS**
   - Refactor `movies.ts` to accept `{ zip, lat, lng, timezone, city }`
   - CHI: `TMS_ZIP=60601` (or env `TMS_ZIP_CHI`)
   - Emit showtimes for Chicago-area theaters; set theater/event city appropriately

2. **Optional indie theater**
   - Music Box Theatre calendar (HTML scrape — apply [HTML scrape pitfalls](./ingest.md#html-scrape-pitfalls))
   - Gene Siskel Film Center
   - Follow Roxie pattern: film + showtimes batch, not one event per showtime

3. **Taxonomy**
   - Add `indie_theater` to CHI chips if indie adapter ships; TM movies may not need a chip

**Acceptance:** `GET /v1/feed?area=chicago` includes `movie_showtime` cards with posters.

---

### Phase E — Instagram + YouTube (P2–P3)

**Work items:**

1. **`instagram` + `youtube` adapters — metro handles only**
   - IG: `eater_chi`, `infatuationchi`, `timeoutchicago`, local food creators — **not** national `theinfatuation`
   - YT: city channels (`EaterChicago`, `ChooseChicago`) — national `Eater` only if captions still pass locality
   - Tag rows `city: "chicago"` **and** extend `videoLocality.ts` (`LOCAL_RE`, `NEIGHBORHOODS`, `LOCAL_OUTLETS`)
   - Follow [IG / YouTube city expansion](./city-expansion-strategy.md#instagram--youtube-city-expansion) — skip reels without Graph `media_url`; feed re-filters travel captions

2. **Neighborhoods** ✅
   - `CHI_NEIGHBORHOODS` + `neighborhoodsForCity()` in `taxonomy.ts`
   - Onboarding picks chips from the active feed metro — [city-expansion-strategy — Tastes](./city-expansion-strategy.md#tastes--neighborhoods-onboarding)

3. **Demo user profile**
   - Optional second demo user centered on `CHI_DEFAULT`, or metro-aware seed

4. **Partiful / newsletters**
   - Spike only if Phase A–D quality bar is met

---

## Adapter refactor checklist (reusable for any new city)

When adding city **N**:

| Step | Action |
|---|---|
| 1 | Add `N_DEFAULT` + `N_CITIES` set + `areasForCity('n')` in `taxonomy.ts` |
| 1b | Add `N_NEIGHBORHOODS` + wire `neighborhoodsForCity` / onboarding — [expansion strategy](./city-expansion-strategy.md#tastes--neighborhoods-onboarding) |
| 2 | Add `FEED_CITIES` entry + `N_FEED_FILTER_SOURCES` |
| 3 | Implement or configure Phase 1 adapters (TM, Luma, RA, 19hz, Eventbrite, local cheap calendar) |
| 3b | **Ticket flyers for text calendars** — reuse `enrichEventsWithTicketImages()`; install Chromium on ingest host; run `--backfill-ticket-images` once — [ingest.md — Ticket-page flyer scrape](./ingest.md#ticket-page-flyer-scrape-multi-city) |
| 4 | **Category mapping** — each adapter sets `categories[]` per [topic filter contract](./ingest.md#category-mapping-for-topic-filters); port `funcheapTaxonomy` / `mapDo312Categories` patterns for local calendars |
| 5 | Run Phase 1 ingest; verify `eventInArea('n', …)` isolation |
| 6 | Port food vertical (config + curated deals) |
| 7 | Seed `recurring_shows` with `city = 'n'` + comedy subtypes — see [Comedy sourcing](./ingest.md#comedy-sourcing-city-expansion) |
| 7b | Seed jazz / punk / blues / indie **live music** recurring rooms (`music.jazz`, `music.punk`, …) — see [Live music sourcing](./ingest.md#live-music-sourcing-city-expansion) |
| 8 | Add `comedy_venue_*` TM keywords for local clubs (flagship + multi-room venues) |
| 8b | Add `music_venue_*` TM keywords for flagship concert rooms (Independent / Metro / Troubadour-class) — [Live music sourcing](./ingest.md#live-music-sourcing-city-expansion) |
| 9 | Configure TMS zip + optional indie theaters |
| 10 | **Curate evergreen activities** (≥20 rows, iconic + local gems) — [expansion strategy](./city-expansion-strategy.md) |
| 11 | Wire `activities` adapter; set `outdoors` / `arts` categories for topic chips |
| 12 | **Topic smoke-test** — API checks below for `area=n` |
| 13 | Update web city selector (already generic if `FEED_CITIES` updated) |
| 14 | **City loading phrase** — add a metro-flavored “Gathering the …” line in `apps/web/src/app/[city]/page.tsx` (SF: fog, Chicago: wind; invent one local weather/place cue per city) |
| 14b | **City hero** — Unsplash cover + party palette + place-specific lede in `apps/web/src/lib/city-heroes.ts` — [expansion strategy — City hero](./city-expansion-strategy.md#city-hero-web); run `pnpm check:city-heroes` to verify every cover URL returns 200 |
| 14c | **Venue / locality geo** — add city + common venue centroids to `packages/shared/src/venueGeo.ts` so address-only Funcheap/scrape rows get weather + maps — [architecture](./architecture.md#event-location--weather) |
| 14d | **Feed demotions** — no demotion-specific city lists. Rules use `eventInArea` / `FEED_AREAS` (`packages/shared/src/feedDemotion.ts`). After taxonomy is wired, existing metro filters and Admin metro dropdown pick up the new area automatically. Revisit ops rules only if a local venue needs burying — [Ranking](./ranking.md#feed-demotion-rules) |
| 14e | **IG / YouTube** — metro seed handles in `igCreators.ts` / `CURATED_CHANNELS` + `videoLocality.ts` (local regex, neighborhoods, outlets, foreign drop). Target ≥15 IG handles/metro (outlets + creators). Admin can add more at `/admin/instagram`. Do not ingest travel captions or reels without `media_url` — [expansion strategy](./city-expansion-strategy.md#instagram--youtube-city-expansion) |
| 15 | Document adapters in [ingest.md](./ingest.md) |

## Suggested implementation order (Chicago)

```
Done (Chicago): Phase A–C + evergreen activities + hero
Deferred: Phase D (TMS) for CHI and LA
Next:    Los Angeles MVP (taxonomy → Phase 1 calendars → food → comedy → activities → hero)
Later:   Phase E polish (IG, partiful) for any metro
```

## Code touchpoints (quick reference)

| Concern | File(s) |
|---|---|
| City/area/filter chips | `packages/shared/src/taxonomy.ts` (`FEED_TOPICS`, `feedFilterSourcesForCity`) |
| Curated food deals | `packages/shared/src/foodDeals.ts` (`CURATED_FOOD_DEALS_SF`, `CURATED_FOOD_DEALS_CHICAGO`) |
| Food metro config | `packages/shared/src/foodCityConfig.ts` (`FOOD_METRO_CONFIGS`) |
| Food ingest | `packages/ingest/src/adapters/food.ts`, `foodDeals.ts`, `foodEditorial.ts` |
| Instagram / YouTube | `packages/ingest/src/igCreators.ts`, `adapters/instagram.ts`, `youtube.ts`; locality `packages/shared/src/videoLocality.ts`; Admin `/admin/instagram` |
| Comedy recurring | `packages/db/src/seed.ts`, `packages/ingest/src/adapters/recurringComedy.ts` |
| Live music rooms | `packages/db/src/seed.ts` (`jazzSeed` / `liveMusicBarSeed`), `ticketmaster.ts` (`music_venue_*`) |
| TM / Luma factories | `packages/ingest/src/adapters/ticketmaster.ts`, `luma.ts` |
| Adapter registry | `packages/ingest/src/runner.ts` |
| Feed ranking geo | `apps/api/src/index.ts` (`metroFromArea`, radius widening) |
| Web city selector | `apps/web/src/app/page.tsx`, `apps/web/src/lib/feed-prefs.ts` |
| Feed loading copy | `apps/web/src/app/[city]/page.tsx` — per-`area` “Gathering the …” (fog / wind / …) |
| City hero | `apps/web/src/lib/city-heroes.ts`, `CityHero.tsx`, `CityHeroFx.tsx` — [expansion strategy](./city-expansion-strategy.md#city-hero-web) |
| Detail drawer | `apps/web/src/components/detail/DetailDrawer.tsx`, `LumaMeshBackground.tsx` |

## Verification matrix

Before calling Chicago (or any metro) "seeded" for a vertical:

| Check | Command / action |
|---|---|
| Row count by source+city | SQL on `events` |
| Metro isolation | Compare `area=chicago` vs `area=bay` feed counts; zero cross-leak |
| Interest routing | User with `food` weight 1.0 sees food cards in CHI |
| Detail enrich | Open Infatuation/Eater CHI URL from detail page |
| Ingest audit | `ingest_runs` status ok for new adapters |
| Source chips | Only show adapters with data; hide empty chips (product decision) |
| **Topic: Concerts** | `GET /v1/feed?area=chicago&topics=concerts&mode=all&limit=10` — expect 19hz, RA, TM, `music_venue`, Do312, jazz/punk recurring |
| **Topic: Comedy** | `…&topics=comedy` — expect `comedy_venue`, comedy `recurring`, Do312/chicago_cheap comedy |
| **Topic: Food** | `…&topics=food` — tips + deals |
| **Topic: Happy hours** | `…&topics=happy_hours` — `food_deals` (expanded at feed read) |
| **Topic: Free** | `…&topics=free` — cheap calendars + `isFree` |
| **Topic: Movies** | SF: showtime cards; CHI: event listings until TMS Phase D |
| Category depth (SQL) | See [ingest.md — topic smoke SQL](./ingest.md#category-mapping-for-topic-filters) |

**UI note:** selecting a topic clears source filters (topics replace source browsing). Use **All sources** if testing manually in the browser.

### Chicago topic backfill checklist

Run after adapter category-mapping changes or when Concerts/Comedy chips return empty despite ingest data:

1. Re-ingest Chicago adapters (command in [Topic filter categorization](#topic-filter-categorization-every-metro) above)
2. Run topic API checks from the matrix (expect non-zero for concerts, comedy, food, happy_hours, free)
3. Spot-check Ticketmaster rows: `music.live` / `comedy.club` present, not only `nightlife`
4. Confirm `comedy_venue_chi` runs in Phase 1 (`runner.ts` includes it)
5. Phase D deferred — **Movies** topic may stay thin until TMS ships for that metro

## Future cities

Same playbook applies to LA, NYC, etc. Prioritize:

1. Phase 1 calendar stack (TM + Luma + RA/local equivalent + cheap events site)
2. Food tips (highest taste-signal ROI)
3. Evergreen activities — parks, hikes, local gems ([expansion strategy](./city-expansion-strategy.md))
4. Comedy + **live music rooms** (`music_venue_*` + jazz/punk recurring) + movies (differentiator depth)
5. **Local** IG / YouTube — only with [locality rules](./city-expansion-strategy.md#instagram--youtube-city-expansion)

Avoid launching a city with only Ticketmaster Discovery — the feed feels generic. Minimum viable metro = Phase 1 + food tips + evergreen activities + comedy depth + **live music rooms** + **topic-verified category mapping** (Concerts and Comedy chips must return rows before launch).

## Related docs

- [City expansion strategy](./city-expansion-strategy.md) — evergreen activities, iconic vs local gems (every metro)
- [Architecture — multi-city model](./architecture.md#multi-city-model)
- [Architecture — food vertical](./architecture.md#food-vertical-sf-reference-implementation)
- [Ingest adapter inventory](./ingest.md)
- [Data model — city conventions](./data-model.md#city-conventions)
