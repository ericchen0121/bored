# Ranking

Scoring lives in `packages/shared/src/ranker.ts` so it can be tested without HTTP.

## Modes

| Mode | Window | Strategy |
|---|---|---|
| `tonight` | Rest of day (extended if late) | Time-weighted + prefs |
| `weekend` | ~5 days | Boost Fri–Sun |
| `for_you` | ~14 days | Affinity / adjacent / serendipity mix |
| `all` | ~30 days | Chronological-first, mild taste nudge; **no** hard budget/radius cuts |

## Areas

| Area | Meaning |
|---|---|
| `sf` | San Francisco proper (city + known SF neighborhoods) |
| `bay` | SF + East Bay / Peninsula / South Bay cities |
| `chicago` | City of Chicago + near suburbs (Evanston, Oak Park, …) |

Implemented by `eventInArea` in `packages/shared/src/taxonomy.ts`. SF and Chicago rows never mix — switching `area=chicago` recenters ranking on `CHI_DEFAULT`.

Bay mode also widens default search radius (≥ 35 mi) so Oakland/Berkeley aren’t dropped by distance. Chicago mode widens radius to ≥ 25 mi for near-suburb coverage.

## Buckets (`for_you` / tonight / weekend)

Approximate card mix:

- **~65% affinity** — strong overlap with interest weights
- **~25% adjacent** — related categories (e.g. Punch Line → Coit / open mic)
- **~10% serendipity** — labeled “Outside your usual”

Adjacent map examples:

- `music.electronic` ↔ `music.live`, `nightlife`, and dance genres (`music.house`, `music.techno`, …)
- Dance genres ↔ each other + `music.electronic` / `nightlife` (from 19hz-style tags)
- `comedy.club` ↔ `comedy.showcase`, `comedy.underground`
- `movies.arthouse` ↔ `movies`, `arts`

## Signals that move rank

| Signal | Effect |
|---|---|
| `saved` / `going` | Boost |
| `dismissed` | Hard exclude |
| Neighborhood match | Small boost |
| Distance within radius | Soft score |
| `preferFree` / `budgetMax` | Hard filter (not in `all` mode) |
| Film IMDb (when present) | Small rating boost |

## Prefs

Stored on `user_profiles`:

- `interests[]` — `{ category, weight 0–1 }`
- `neighborhoods[]`
- `budgetMax`, `preferFree`, `nightsOut`
- `lat` / `lng` / `radiusMiles`

After onboarding save, clients should load `/?mode=for_you` so ranking uses the new profile.

## Hard filters (feed query)

Applied **before** ranking; reduce the candidate set:

| Param | Purpose |
|---|---|
| `topics` | Activity type (concerts, happy hours, free, …) — OR across selected ids |
| `sources` | Ingest adapter provenance |
| `categories` | Exact interest category ids |
| `freeOnly` | Free events only |
| `date` | Single local calendar day |

**Topics vs tastes:** onboarding interests (`user_profiles.interests`) only affect score and bucket mix in personalized modes. Topic chips are explicit hard filters for browsing (“show me concerts tonight”) and do not require updating tastes.

## Movie cards

Showtimes are grouped per film into `kind: "movie_showtime"` cards with:

- Poster (`imageUrl`)
- IMDb / RT / Letterboxd badges when enriched
- `showtimesPreview` (next few times)
- Letterboxd deep-link when scrape found a film URL

Film detail (`GET /v1/movies/:id`) also surfaces YouTube trailer embed, RT consensus, and Letterboxd/RT review snippets when enrichment found them.
