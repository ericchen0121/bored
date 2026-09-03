# City expansion strategy

Cross-cutting playbook for what **every metro** should ship beyond timed event calendars. SF is the reference; Chicago is the first expansion target. See [City seeding plan](./city-seeding.md) for metro-specific phases and adapter checklists.

## Why evergreen activities

Calendar ingest (Ticketmaster, Luma, Do312, …) fills the feed with **dated listings**. That alone feels generic — the same concerts and ticketed shows any aggregator has.

Evergreen activities are **durable “things to do”** you’d find in a city guidebook, local blog, or “best of” list:

- Hikes and trailheads
- Green spaces and parks (hang-out spots, not just event venues)
- Signature walks and viewpoints (“walk Golden Gate Park end to end”)
- Recurring local pastimes — arcade bars, thrift districts, food-truck yards, driving ranges, axe throwing, mini-golf, mural routes

They are **not tied to a showtime**. Like food tips, they answer: *“What should I do this afternoon?”* without requiring a ticket drop.

## Two layers: iconic vs local gems

Every city seed should explicitly cover **both** layers. Tag or bucket curated rows so ranking and UI can surface the right vibe.

| Layer | What it is | User intent | Examples |
|---|---|---|---|
| **Iconic / visitor** | Postcard stuff — guidebooks, “top 10”, first-time SF/CHI | “I’m here for the weekend; hit the highlights” | Walk Golden Gate Park · Alamo Square · Lincoln Park Zoo · Navy Pier · Millennium Park |
| **Local gems** | Places regulars love but many locals still haven’t tried | “I’ve lived here 5 years — what did I miss?” | Emporium / Detour arcade bars · Wasteland thrift · Spark Social (food trucks + mini-golf) · Presidio driving range · downtown CHI mini-golf · graffiti mural routes · axe throwing in GG Park |

**Product goal:** A feed that feels like a well-read friend, not a tourism board. Iconic rows establish credibility; local-gem rows drive saves and “I had no idea” moments.

### Heuristics for classification

| Signal | Likely **iconic** | Likely **local gem** |
|---|---|---|
| Source | Time Out / Eater “best of”, official park pages, guidebook lists | Reddit threads, local Substacks, friend recommendations, niche blogs |
| Search volume | High generic queries (“things to do in SF”) | Long-tail (“arcade bar SF”, “mini golf downtown Chicago”) |
| Venue type | Landmark parks, famous viewpoints, major museums | Specialty retail, hybrid yards (food + games), neighborhood murals |
| Repeat visit | Worth doing once as a visitor | Worth doing monthly as a local |

When in doubt, **prefer local gems** — iconic stuff is already over-represented in generic feeds.

## Activity categories (seed every city)

Use this checklist when curating a new metro. Aim for **≥3 rows per category** where the city has real options; skip categories that don’t apply.

| Category | `categories` / tags | Topic chip(s) | Notes |
|---|---|---|---|
| **Hikes & trails** | `outdoors` | Arts & culture (partial), tastes | Named trailheads, loop hikes, urban stairways, waterfront paths |
| **Parks & green space** | `outdoors`, `free` | Free, Arts & culture | Day-hang parks (Dolores, Humboldt, Lincoln Park), not just event lawns |
| **Signature walks** | `outdoors`, `arts` | Arts & culture | End-to-end park walks, waterfront promenades, neighborhood strolls |
| **Hidden play** | `outdoors`, `family`, `nightlife` | — | Mini-golf, driving ranges, axe throwing, bowling, arcade bars, batting cages |
| **Shopping & browse** | `arts`, `free` | Arts & culture, Free | Thrift/vintage corridors, flea markets, record stores, maker markets |
| **Food yards & trucks** | `food`, `outdoors` | Food & drink | Permanent food-truck parks, night markets (evergreen locations, not one-off festivals) |
| **Street art & murals** | `arts`, `free` | Arts & culture, Free | Self-guided mural routes, legal walls, district clusters |
| **Viewpoints & photo spots** | `outdoors`, `free` | Free, Arts & culture | Hills, piers, rooftops (public access only) |

Categories map to `INTEREST_CATEGORIES` in `taxonomy.ts` and to **feed topic chips** via `matchesFeedTopic()` — see [Category mapping for topic filters](./ingest.md#category-mapping-for-topic-filters).

## Reference seeds

### San Francisco / Bay

| Layer | Examples |
|---|---|
| Iconic | Golden Gate Park (full walk) · Dolores Park · Crissy Field · Lands End · Ferry Building waterfront |
| Local gems | **Arcade bars:** Emporium, Detour · **Thrift:** Wasteland (Haight), Community Thrift · **Food yards:** Spark Social (SoMa — trucks + mini-golf) · **Driving range:** Presidio Golf Course practice area · **Axe throwing:** Bad Axe Throwing / park-adjacent pop-ups · **Murals:** Clarion Alley, Balmy Alley, Mission District routes |

### Chicago

| Layer | Examples |
|---|---|
| Iconic | Millennium Park · Lakefront Trail · Lincoln Park · Navy Pier (iconic even if touristy) · 606 trail |
| Local gems | **Mini-golf downtown** (locals often don’t know it exists) · **Arcade / bar games** · **Thrift:** Unique, Village Discount, cross-neighborhood vintage corridors · **Food yards:** Politan Row, Logan Square farmers market adjacency · **Murals:** Pilsen, Wabash Arts corridor |

Use these tables as **editorial targets**, not exhaustive lists. Each new city gets its own curated file (see implementation below).

## Implementation model

Follow the **food tips vertical** pattern — same tables, same feed UX, curated + lightly scraped sources.

```mermaid
flowchart LR
  subgraph editorial [Editorial]
    Curated[curatedActivities.ts per metro]
    Guides[City guide RSS / blogs]
  end

  subgraph ingest [Ingest]
    Adapter[activities adapter]
  end

  subgraph storage [Postgres]
    Events[events table]
  end

  Curated --> Adapter
  Guides --> Adapter
  Adapter --> Events
  Events --> Feed[GET /v1/feed]
```

### Data shape

- **Source:** `activities` (new) or extend `food`-style editorial adapter
- **`city`:** canonical slug (`sf`, `chicago`, …)
- **`startsAt`:** stable suggestion slot (same as food tips — `suggestionStartsAt`, not a real reservation time)
- **`categories` / `tags`:** `outdoors`, `arts`, etc. + **`audience:iconic` | `audience:local_gem`** (tag or `rawPayload`)
- **No invented showtimes** — these are recommendations, not ticketed events

### Suggested curated schema

```ts
type CuratedActivity = {
  city: string;
  title: string;
  description: string;
  venueName?: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
  url?: string;
  audience: "iconic" | "local_gem";
  activityKind:
    | "hike"
    | "park"
    | "walk"
    | "play"
    | "shop"
    | "food_yard"
    | "murals"
    | "viewpoint";
  categories: string[];
  tags?: string[];
};
```

Store per-metro lists in `packages/shared/src/curatedActivities.ts` (or split `curatedActivities.sf.ts` / `.chi.ts` as lists grow).

### Source ideas (ingest, not just manual seed)

| Source type | Examples | Use for |
|---|---|---|
| City guide RSS | Time Out, Eater “best things to do”, local magazine hubs | Iconic + seasonal refreshes |
| Park districts | SF Rec & Park, Chicago Park District | Trails, facilities, hours |
| Hiking / outdoors blogs | Local trail write-ups, AllTrails editorial (link-out) | Hikes, loops |
| Local Substacks / reddit wiki | “Hidden gems”, “underrated” threads | Local-gem discovery |
| Existing newsletter adapter | Broke-Ass Stuart, Eddie's List *guides* (not weekly roundups) | Extraction candidates — see [ingest.md](./ingest.md) |

**Do not** ingest weekly “events this weekend” roundups as single evergreen rows — same rule as newsletter adapter.

### Feed & ranking

- Surface under **Outdoors** / **Arts & culture** topic chips and interest weights (`outdoors`, `arts`)
- Balance iconic vs local_gem in ranking: boost local gems for users with `onboardingComplete` and repeat opens; keep a few iconic anchors for new users
- Label in UI: **“Recommendation”** (like food tips), optionally sub-label **“Local gem”** vs **“Classic”**

## Every-city checklist

Add these steps to the [adapter refactor checklist](./city-seeding.md#adapter-refactor-checklist-reusable-for-any-new-city):

| Step | Action |
|---|---|
| A1 | Draft **≥20 curated activities** — at least 40% `local_gem`, cover ≥5 activity categories |
| A2 | Add metro block to `curatedActivities.ts` (or city config) |
| A3 | Wire **`activities` adapter** (materialize curated rows + optional guide RSS) |
| A4 | Set `city`, geo, neighborhood on every row; smoke-test `area=` isolation |
| A5 | Verify feed shows recommendations alongside food tips; no fake times in detail |
| A6 | Set `categories[]` on every activity row (`outdoors`, `arts`, `food`, …) for topic chips — [ingest contract](./ingest.md#category-mapping-for-topic-filters) |
| A7 | Document iconic vs local split in PR / seed notes for future editors |
| A8 | Ship **metro neighborhood chips** (`N_NEIGHBORHOODS` + `neighborhoodsForCity`) — [Tastes / neighborhoods](#tastes--neighborhoods-onboarding) |
| A9 | **Local weather geo** — extend `venueGeo.ts` with metro localities / common venues so address-only listings get weather + maps — [architecture — Event location & weather](./architecture.md#event-location--weather) |
| A10 | **Feed demotions** — do **not** hardcode city lists in demotion matching. Rules resolve metro via `eventInArea` / `FEED_AREAS` (`feedDemotion.ts`). Adding a city to taxonomy is enough for metro filters + Admin area dropdown; only create ops rules when a local venue needs burying — [Ranking](./ranking.md#feed-demotion-rules), [city-seeding §14d](./city-seeding.md#adapter-refactor-checklist-reusable-for-any-new-city) |
| A11 | **IG / YouTube locality** — add metro handles + neighborhood regexes; never trust `city:` from the account list alone — [Instagram & YouTube](#instagram--youtube-city-expansion) |
| A12 | **Live music rooms** — `music_venue_*` TM keywords + jazz/punk/blues recurring seed — [Live music sourcing](./ingest.md#live-music-sourcing-city-expansion) |

**Acceptance:** ≥15 evergreen activity cards per metro, both audience layers represented, detail page enriches from source URL when available. Address-only listings in the metro still show **local** weather (not downtown of another city).

## Tastes / neighborhoods (onboarding)

Neighborhood chips on **Edit tastes** must be **metro-specific**. SF Mission pills must never appear while the user’s active feed city is Chicago (and vice versa).

| Piece | Where | Guidance |
|---|---|---|
| **SF / Bay list** | `taxonomy.ts` → `NEIGHBORHOODS` | City + East Bay / Peninsula chips used for SF tastes |
| **Chicago list** | `taxonomy.ts` → `CHI_NEIGHBORHOODS` | Align labels with ingest (`food.ts`, Do312, curated activities) — e.g. Wicker Park, Logan Square, West Loop, The Loop, Pilsen |
| **Resolver** | `neighborhoodsForCity(city)` | Single entry point for web + API |
| **Defaults** | `defaultNeighborhoodsForCity(city)` | Empty-profile defaults (not hard-coded Mission/North Beach) |
| **UI** | `apps/web/src/app/onboarding/page.tsx` | Resolve city from `readFeedPrefs()` / `metroFromArea`; filter saved prefs to the active metro’s list; save `lat`/`lng`/`radiusMiles` from that metro’s `*_DEFAULT` |
| **Hint copy** | `tastesNeighborhoodHint(city)` in `taxonomy.ts` | Under neighborhood chips: `{TASTES_METRO_LABELS[city]} — switch city on the feed to edit the other metro.` Must track the active feed metro — never hard-code SF. |
| **Metro labels** | `TASTES_METRO_LABELS` | SF uses **SF / Bay** (chips include East Bay / Peninsula); other metros use their city name. Extend when adding a feed city. |
| **API** | `GET /v1/meta/taxonomy` → `neighborhoodsByCity` | Flat `neighborhoods` remains SF-only for legacy; prefer `neighborhoodsByCity` |

When adding city **N**:

1. Add `N_NEIGHBORHOODS` (≈12–20 chips locals actually choose)
2. Extend `neighborhoodsForCity` / `defaultNeighborhoodsForCity`
3. Add `TASTES_METRO_LABELS.n` (onboarding hint under neighborhood pills)
4. Add `neighborhoodsByCity.n` on taxonomy meta
5. Keep chip names in sync with adapter `neighborhood` strings so ranking prefs match rows

**Acceptance:** With feed city = Chicago, `/onboarding` shows only Chicago neighborhoods and saving recenters ranking geo on `CHI_DEFAULT`.

## City hero (web)

Every metro needs a **place-specific feed hero** — not a generic “what’s on” blurb that could sit on any aggregator.

| Piece | Where | Guidance |
|---|---|---|
| **Cover photo** | `apps/web/src/lib/city-heroes.ts` → `CITY_HERO_IMAGES` | Unsplash (or similar) dusk/night skyline that takes a saturated color wash; credit + permalink stored |
| **Party palette** | `CITY_HERO_PALETTES` | 4 hot colors (magenta / coral / amber / cyan family) for canvas orbs + sparks |
| **Hero lede** | `cityHeroLede()` | ≤~110 chars; local friend voice; name neighborhoods, rooms, or metro-specific cues — **never** “music, comedy, and the odd gem…” |
| **Title** | `cityHeroTitle()` | `FEED_CITY_LABELS` or area override (e.g. Bay Area) |
| **Loading phrase** | City feed page | Metro-flavored “Gathering the …” (fog / wind / …) — see [city-seeding checklist](./city-seeding.md#adapter-refactor-checklist-reusable-for-any-new-city) |

**UI contract:** full-bleed cover (viewport edge-to-edge), Partiful-adjacent color energy (canvas FX + hot gradient veil) instead of a calm soft blur. Respect `prefers-reduced-motion` (static orbs, no spark rain).

### Current copy

| Metro / area | Lede |
|---|---|
| San Francisco | Foghorn nights, Mission dance floors, and sold-out standup rooms. |
| Bay Area | East Bay warehouses, Peninsula stages, and everything between the bridges. |
| Chicago | Lakefront golden hour, warehouse bass, and rooms that laugh all week. |
| Los Angeles | Hillside sunsets, taco trucks, and rooms that run late in Hollywood. |

When adding city **N**, ship hero image + palette + lede in the same PR as the web city selector. Run `pnpm check:city-heroes` — every Unsplash `src` must return HTTP 200 (photos get removed from CDN over time).

### SF status — shipped ✅

- `CURATED_ACTIVITIES_SF` — 34 rows (13 iconic, 21 local gems)
- `activities` adapter wired in ingest runner
- Feed/detail UI: untimed tips with `Classic · …` / `Local gem · …` labels
- City hero: Unsplash cover + party FX + SF / Bay ledes

### Chicago status — shipped ✅

- `CURATED_ACTIVITIES_CHI` — 35 rows (10 iconic, 25 local gems)
- City-aware timezone (`America/Chicago`) in `activities` adapter
- **Things to do** topic chip (`topics=activities`) — not a source chip
- Includes Pilsen murals, Puttery mini-golf, Emporium/Replay arcade bars, Politan Row, Diversey range, and lakefront/park loops
- City hero: Unsplash cover + party FX + Chicago lede
- **Movies TMS deferred** — metro otherwise launch-ready for taste-driven users

### Los Angeles status — MVP complete

- Slug `la` on `FEED_CITIES`; Phase 1 adapters (`ticketmaster_la`, `luma_la`, `ra_la`, `19hz_la`, `eventbrite_la`, `comedy_venue_la`)
- Food tips (Eater LA + Infatuation), curated deals, comedy recurring + `comedy_venue_la`
- Live music rooms: `music_venue_la` + Catalina / Zebulon / Lodge Room / Troubadour / Smell recurring
- `CURATED_ACTIVITIES_LA` (22 rows) + hero (“Gathering the haze…”); Movies TMS deferred at MVP
- Topic smoke verified: concerts, comedy, food, activities, free (`area=la`)

## Priority vs other verticals

| Priority | Vertical | Rationale |
|---|---|---|
| P0 | Phase 1 calendars + food tips | Minimum viable metro ([city-seeding](./city-seeding.md)) |
| **P1** | **Evergreen activities** | High taste signal, differentiates from Ticketmaster-only feeds; reuses food-style UX |
| P1 | Food deals, comedy depth, **live music rooms** | Engagement loops for repeat users |
| P2 | Movies, **local** Instagram / YouTube | Depth — only after calendars + food feel native |

Ship **food tips + evergreen activities** before calling a city “launch-ready” for taste-driven users. Ship **IG / YT** only with locality rules below — a carousel of NYC reels on the SF feed is worse than no carousel.

## Instagram & YouTube (city expansion)

Short-form video is how openings and neighborhood food actually spread. It is also the easiest vertical to make a metro feel fake: influencers tagged to SF still post NYC, LA, Paris.

**Rule:** `city` on the row is the **account’s home metro**, not proof the caption is local. Ingest **and** the feed must run `isVideoContentLocalToMetro()` (`packages/shared/src/videoLocality.ts`).

### Two account types

| Flag | Who | Keep a post when |
|---|---|---|
| `localOutlet: true` | Metro-branded desks — `eater_sf`, `eater_chi`, `timeoutlosangeles`, `onlyinsf`, `do312`, … | Caption is **not** strongly another city. Bare “Chicago’s Kasama” in an SF restaurant rec is OK. |
| Influencer (no outlet flag) | Food creators who travel | Caption has a **local** hashtag, neighborhood, or city name (`#sfeats`, Mission, `#chicagoeats`, DTLA). |

Never put national accounts (`theinfatuation`, `tastingtable`, `Eater`) on a metro list unless every post still passes locality (prefer city-specific handles: `infatuationsf`, `EaterLA`).

### Caption / tag locality (every metro)

Extend **all three** when adding city **N** — do not copy SF hashtags onto Chicago rows:

| Piece | File | What to add for N |
|---|---|---|
| Local regex | `videoLocality.ts` → `LOCAL_RE.n` | City name, `#n…` food tags, metro nicknames (`#312`, `#dtla`) |
| Neighborhoods | `NEIGHBORHOODS.n` | Same chips as tastes (`N_NEIGHBORHOODS`) plus common `#hashtag` forms |
| Foreign drop | `FOREIGN_STRONG` | Other Bored metros + NYC + travel (`#nyc`, `in NYC`, 📍 NYC, Paris, Tokyo, …) |
| Outlet list | `LOCAL_OUTLETS.n` | Handles that are *this* city’s desk |

`FOREIGN_STRONG` must stay **strong** (hashtags, “in Chicago”, pin lines). Do **not** drop an SF Eater rec because it mentions another city’s restaurant by name.

Feed filter uses `videoMetroFromFeedArea(area)` (`sf` + `bay` → Bay Area). Same helper for Chicago / LA.

### What to ingest vs skip

| Keep | Skip |
|---|---|
| Food tip / opening / city-guide / dated event **and** locality pass | Travel vlogs, nails, merch, “NYC day in my life” |
| Reels/videos with a Graph **`media_url`** (or carousel child video URL) | Reels Graph returns without `media_url` (~often) — they cannot play in-app |
| YouTube **Shorts** (`≤90s`) that pass locality | Long uploads; national `Eater` shorts with no metro cue |

`foodInfluencer` does **not** bypass locality or “is this food/event?” heuristics.

### Playback (do not hotlink Instagram CDN)

Browsers block `cdninstagram.com` (`Cross-Origin-Resource-Policy`). Players use API proxies only:

- `GET /v1/events/:id/media/stream` — video
- `GET /v1/events/:id/media/poster` — poster

Feed ranking drops Instagram videos with empty `rawPayload.mediaUrl` so the carousel never shows “Watch on Instagram” as the primary player.

### Per-city minimum bar

Before calling IG/YT “shipped” for a metro:

- [ ] ≥3 `localOutlet` IG handles (Eater / Time Out / city guide or equivalent)
- [ ] ≥3 local food creators **and** locality tests (spot-check: no `#nyceats` on that metro’s Today carousel)
- [ ] ≥15 active scrape handles total for that metro (seed + admin) — SF reference; CHI/LA should not stay outlet-only
- [ ] Neighborhood regexes covering the tastes chip list
- [ ] Optional: 1–3 YouTube channels with `localOutlet` (or national channels that still require caption metro)
- [ ] `IG_ACCESS_TOKEN` + `IG_BUSINESS_USER_ID` (and `YOUTUBE_API_KEY` for Shorts) on the ingest worker
- [ ] Smoke: `GET /v1/feed?area=<slug>&mode=today` — Reels row titles/captions are this metro; click-to-play uses `/media/stream`, not Instagram embed
- [ ] Admin: `/admin/instagram` lists the metro’s handles; new creators can be added without a code deploy

### Metro depth tracker

| Metro | Outlets / guides | Food creators (seed) | Notes |
|---|---|---|---|
| SF / Bay | ✓ (Eater, Infatuation, FOUND, Time Out, …) | ✓ deep seed list | Reference |
| Chicago | ✓ (Eater, Infatuation, Time Out, Do312, Block Club, …) | ✓ expanded seed influencers | Keep growing via Admin → Instagram |
| LA | ✓ (Eater, Infatuation, Time Out, LAist, DiscoverLA, …) | ✓ expanded seed influencers | Keep growing via Admin → Instagram |

### Code touchpoints

| Concern | File |
|---|---|
| Locality + outlet lists | `packages/shared/src/videoLocality.ts` |
| IG handles (seed + admin merge) | `packages/ingest/src/igCreators.ts` (`SEED_IG_CREATORS` + `ig_creators` table) |
| YT channels | `packages/ingest/src/adapters/youtube.ts` (`CURATED_CHANNELS`) |
| Feed drop (geo + unplayable) | `apps/api/src/index.ts` feed filter |
| Player | `ReelsPlayer` / `instagramMediaStreamUrl` — never CDN `mediaUrl` |
| Admin scrape list | `/admin/instagram` |

## Related docs

- [City seeding plan](./city-seeding.md) — Chicago phases, adapter checklist
- [Architecture — food vertical](./architecture.md#food-vertical-sf-reference-implementation) — evergreen recommendation pattern to copy
- [Ingest — newsletter / guides](./ingest.md) — what to extract vs skip; [IG / YouTube](./ingest.md#instagram--youtube-reels)
