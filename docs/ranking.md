# Ranking

Scoring lives in `packages/shared/src/ranker.ts` so it can be tested without HTTP.

## Modes

| Mode | Window | Strategy |
|---|---|---|
| `for_you` | ~14 days | Affinity / adjacent / serendipity mix |
| `today` | Full local calendar day | Chronological; earlier-today collapsed in UI |
| `weekend` | ~5 days | Boost Fri–Sun; optional `date=` day filter |
| `date` | ~30 days (or single day via `date=`) | Chronological-first, mild taste nudge; **no** hard budget/radius cuts |

## Areas

| Area | Meaning |
|---|---|
| `sf` | San Francisco proper (city + known SF neighborhoods) |
| `bay` | SF + East Bay / Peninsula / South Bay cities |
| `chicago` | City of Chicago + near suburbs (Evanston, Oak Park, …) |

Implemented by `eventInArea` in `packages/shared/src/taxonomy.ts`. SF and Chicago rows never mix — switching `area=chicago` recenters ranking on `CHI_DEFAULT`.

Bay mode also widens default search radius (≥ 35 mi) so Oakland/Berkeley aren’t dropped by distance. Chicago mode widens radius to ≥ 25 mi for near-suburb coverage.

## Buckets (`for_you` / weekend)

Approximate card mix:

- **~65% affinity** — strong overlap with interest weights
- **~25% adjacent** — related categories (e.g. Punch Line → Coit / open mic)
- **~10% serendipity** — labeled “Outside your usual”

Adjacent map examples:

- `music.electronic` ↔ `music.live`, `nightlife`, and dance genres (`music.house`, `music.techno`, …)
- Dance genres ↔ each other + `music.electronic` / `nightlife` (from 19hz-style tags)
- Live styles (`music.rock`, `music.indie`, `music.jazz`, `music.hip_hop`, `music.blues`, …) ↔ `music.live` (Ticketmaster genre tags map here)
- `comedy.club` ↔ `comedy.showcase`, `comedy.underground`
- `movies.arthouse` ↔ `movies`, `arts`

## Signals that move rank

| Signal | Effect |
|---|---|
| `saved` / `going` | Boost |
| `dismissed` | Hard exclude |
| Neighborhood match | Small boost |
| Distance within radius | Soft score |
| `preferFree` / `budgetEnabled` + `budgetTier` ($–$$$$) | Hard filter when enabled (not in Today / Select Date / topic browse) |
| Film IMDb (when present) | Small rating boost |
| Exhibition (`tags` / `rawPayload.exhibition`) | Mild score penalty; no live boost; midday sort slot on day browse |
| **Sponsored** (`isSponsored`) | Separated from organic ranking, then **injected** at capped intervals (see below) |
| **Demotion rules** | Score × multiplier + optional max cards per venue (see below) |

## Feed demotion rules

Ops-managed rows in `feed_demotion_rules` (Admin → **Demotions**). Matching listings stay in the feed but rank lower and/or are capped per venue.

| Field | Match |
|---|---|
| `metro` | Feed area / city via taxonomy `eventInArea` (self-corrects when metros are added); null = all |
| `source` | Exact ingest source id |
| `venueContains` | Case-insensitive substring on `venueName` **or** title (Funcheap often omits venue) |
| `categoryContains` | Case-insensitive substring on any category id |
| `scoreMultiplier` | Multiplies organic score (0–1); used in `for_you` / `weekend` |
| `maxPerVenue` | Max cards from that venue in one response (all modes); null = uncapped |

Multiple matching rules multiply scores and take the strictest venue cap. Seed includes **The Function** (Funcheap comedy venue). Logic: `packages/shared/src/feedDemotion.ts`.

## Sponsored injection

After `rankFeed` on organic items, active sponsored events (`isSponsored` and not past `sponsorEndsAt`) are ranked separately and merged via `injectSponsoredIntoFeed` (`packages/shared/src/sponsoredFeed.ts`):

| Rule | Value |
|---|---|
| Interval | 1 per ~8 cards |
| Max share | ≤12% of feed |
| First slot | Index 0 for Today / weekend / Select Date; index 3 for For you |
| Thin feeds | If organic length &lt; firstIndex+1, label only — no extra inject |

Cards expose `isSponsored` + optional `boostWeight`. UI shows a **Sponsored** label instead of the affinity bucket. Schema: `events.is_sponsored`, `boost_weight`, `sponsor_ends_at`, optional `sponsors` table — see [Monetization](./monetization.md).

## Prefs

Stored on `user_profiles`:

- `interests[]` — `{ category, weight 0–1 }`
- `neighborhoods[]`
- `budgetEnabled`, `budgetTier` (1–4 = $–$$$$); legacy `budgetMax` USD still accepted on write
- `preferFree`, `nightsOut`
- `lat` / `lng` / `radiusMiles`

After onboarding save, clients should load `/?mode=for_you` so ranking uses the new profile. Cold start and `/{city}` without `?mode=` always land on **Today** (shared/cacheable); For you is opt-in via the mode switch or that explicit URL.

## Hard filters (feed query)

Applied **before** ranking; reduce the candidate set:

| Param | Purpose |
|---|---|
| `topics` | Activity type (concerts, happy hours, free, …) — OR across selected ids |
| `sources` | Ingest adapter provenance |
| `categories` | Exact interest category ids |
| `freeOnly` | Free events only |
| `date` | Single local calendar day (metro TZ). Full day window; web collapses earlier (non-live) on Today — see [Architecture](./architecture.md#timezones--live--earlier-today) |

**Topics vs tastes:** onboarding interests (`user_profiles.interests`) only affect score and bucket mix in personalized modes. Topic chips are explicit hard filters for browsing (“show me concerts tonight”) and do not require updating tastes.

**For You + topic:** when `mode=for_you` and `topics` is set, ranking uses `rankForYouTopicFeed` — Today matches first (chrono), then This Weekend (Fri–Sun), then the rest of the horizon (personalized). Topic browse also skips budget/radius hard culls (same idea as source chips) so thin topics still fill.

## Movie cards

Showtimes are grouped per film into `kind: "movie_showtime"` cards with:

- Poster (`imageUrl`)
- IMDb / RT / Letterboxd badges when enriched
- `showtimesPreview` (next few times)
- Letterboxd deep-link when scrape found a film URL

Film detail (`GET /v1/movies/:id`) also surfaces YouTube trailer embed, RT consensus, and Letterboxd/RT review snippets when enrichment found them.
