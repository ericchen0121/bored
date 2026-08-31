# Go-live / productionize cleanup

Checklist of data-model and ingest inefficiencies to fix before (or right after) treating Bored as production-ready. Captured from an audit after the food_deals day-expansion fix (Aug 2026).

**Status legend:** `[ ]` todo · `[~]` in progress · `[x]` done

---

## Principles

1. **Templates stay templates** — recurring schedules (happy hours, weekly comedy) are one durable row + expand at feed read. Do not materialize ~28 calendar days into `events`.
2. **Ingest must garbage-collect** — upsert alone never removes obsolete `sourceEventId`s. Closed-set adapters replace; scrapers need `lastSeenAt` / past-event purge.
3. **Feed fairness** — uncapped multi-metro curated pulls and multi-hundred-day exhibition runs crowd out real discovery.

---

## P0 — Same class as old food_deals (day expansion)

### 1. Recurring comedy → durable row + feed expand `[x]`

| | |
|---|---|
| **Problem** | `recurringComedy` expands each `recurring_shows` template into one `events` row per matching day over 28 days (~4 rows/week/room). |
| **Fix** | One durable `events` row per active show; schedule in `rawPayload`; `startsAt` = next occurrence; feed expands for tonight / weekend / by-time (`expandRecurringRowsForFeed`). Prune orphans via `replaceForSource`. |
| **Files** | `packages/ingest/src/adapters/recurringComedy.ts`, `packages/shared/src/recurringSchedule.ts`, `apps/api` feed expand |

### 2. Runner GC: keep-ids + purge past `[x]`

| | |
|---|---|
| **Problem** | Runner sets `lastSeenAt` but almost nothing deletes. do312 and other calendars leave hundreds of past rows; removed curated ids linger. |
| **Fix** | (a) Closed-set adapters return `replaceForSource` → delete `events` for that source not in this fetch’s ids (`food_deals`, `recurring`, `activities`, `new_restaurants`). (b) After `runAll`, purge events/showtimes with `startsAt` older than grace (~36h / 12h). |
| **Files** | `packages/ingest/src/runner.ts`, `types.ts` |

---

## P1 — Coalesce orphans & long runs

### 3. Ticketmaster / comedy_venue coalesce id rewrite `[x]`

| | |
|---|---|
| **Problem** | Coalesce rewrote `sourceEventId` to `${source}:<hash>`; native TM ids stopped updating and lingered (hundreds of orphans). |
| **Fix** | Keep canonical **native** TM id; siblings in `rawPayload.coalescedFrom`. After upsert, delete orphan ids + purge legacy `ticketmaster:<32-hex>` / `comedy_venue:<32-hex>` rows. |
| **Files** | `packages/shared/src/coalesceEventOccurrences.ts`, `ticketmaster.ts`, `runner.ts` |

### 4. Cap / group long multi-day TM runs `[x]`

| | |
|---|---|
| **Problem** | One attraction × many performance days flooded the feed (exhibitions, long comedy sits). |
| **Fix** | After same-day coalesce, `capMultiDayRuns` keeps the next **7** distinct local days per title+venue; marks `runTruncated` / `runDayCount` on payload; dropped day ids deleted as orphans. |

### 4b. DoLA / Do312 exhibitions as durable runs `[x]`

| | |
|---|---|
| **Problem** | Discover LA / Do Stuff emit months-long installations as daily timed rows (early `begin_time`, no end) → false **Now** badge and top-of-Today spam. |
| **Fix** | Detect exhibitions; collapse to one durable row with `rawPayload.exhibition`; feed expand + overlap window; `isFeedEventLive` skips live badge; prune/purge preserve ongoing runs; optional curated `activities` tip for flagship installs. |
| **Files** | `packages/shared/src/exhibitions.ts`, `doStuffMedia.ts`, `runner.ts`, feed expand in `apps/api`, UI live helpers |
| **Docs** | [Ingest — Long-running exhibitions](./ingest.md#long-running-exhibitions-dola--do312) |

---

## P2 — Feed & tip hygiene

### 5. Curated feed query: city + freshness `[x]`

| | |
|---|---|
| **Problem** | When food / activities topics are on, API pulls **all** curated rows with no city filter (multi-metro over-fetch). |
| **Fix** | Filter curated `WHERE` by `eventInArea` / city; don’t rely on fake `suggestionStartsAt` for inclusion. |

### 6. Evergreen tip model clarity `[x]`

| | |
|---|---|
| **Problem** | Food tips, activities, new restaurants, IG tips use fake `startsAt` slots so they appear in timed windows. |
| **Fix** | `events.kind=recommendation` + curated feed path (timed SQL excludes recommendations); keep suggestion slots for ranking but GC tips not seen in 45 days. |

### 7. Ticket platform ↔ 19hz dual storage `[x]`

| | |
|---|---|
| **Problem** | RA / Eventbrite / Dice and 19hz both stored when 19hz deep-links the same ticket URL; feed shows duplicate cards. |
| **Fix** | Prefer platform row at ingest and skip/prune 19hz twin when URL/id matches; keep feed merge as safety net. Enrich genre tags from 19hz. |

### 8. Do312 dual listings (same-source soft coalesce) `[x]`

| | |
|---|---|
| **Problem** | Do312 publishes two calendar rows for one night (different ids/slugs, `&` vs `x`, shorter vs “at Venue”); feed showed duplicate cards with near-identical posters/ticket URLs. |
| **Fix** | Soft-coalesce after exact title+venue+day: shared ticket URL, or same source + day + soft title + compatible venue. Prefer flyer/organizer/longer title; delete orphan `sourceEventId`s after upsert. Feed soft pass as safety net. |
| **Files** | `packages/shared/src/coalesceEventOccurrences.ts`, `packages/ingest/src/adapters/do312.ts` |
| **Docs** | [ingest.md — Same-source soft coalesce](./ingest.md#same-source-soft-coalesce-do312) |

---

## P3 — Polish

### 8. Batch upserts `[x]`

Row-by-row `INSERT … ON CONFLICT` in `upsertEvents` / `upsertShowtimes` — latency under full Phase 1. Batch or COPY+merge.

### 9. Showtimes retention `[x]`

Delete `showtimes` with `starts_at` in the past; optional `last_seen_at` on showtimes for TMS/indie.

### 10. Docs drift `[x]`

- Remove outdated food_deals “~196 Chicago weekday rows” / “weekday materializer” wording in `city-seeding.md` / inventory tables.
- Document durable-row + feed-expand for `food_deals` and `recurring`.
- Keep this file as the living go-live checklist.

### 11. `openmic_agg` inactive growth `[x]`

Cap / dedupe inactive `recurring_shows` proposals.

### 12. `contentHash` redundancy `[x]`

Column mostly mirrors `sourceEventId`; use for change detection or simplify.

---

## Done (reference)

- [x] **food_deals** — one durable row per deal; `expandFoodDealRowsForFeed`; orphan prune on ingest (Aug 2026).

---

## Smoke checks after P0–P1

```bash
# Recurring: one row per active show
psql "$DATABASE_URL" -c "SELECT COUNT(*) rows, COUNT(DISTINCT recurring_show_id) shows FROM events WHERE source='recurring';"

# No legacy TM coalesce keys; no run longer than 7 upcoming days
psql "$DATABASE_URL" -c "SELECT COUNT(*) FILTER (WHERE source_event_id ~ '^(ticketmaster|comedy_venue):[a-f0-9]{32}\$') AS legacy FROM events;"

pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=recurring,food_deals,ticketmaster,comedy_venue
```

Feed: Comedy / For you → one card per room; By time → room appears under each matching weekday without duplicate DB rows. Ticketmaster multi-day sits show ≤7 upcoming days (one row per day). DoLA Discover LA installations are one durable exhibition card (`Through …`), not daily live rows.

---

## Smoke checks after P2

```bash
# No 19hz rows that share a ticket URL/id with RA / Eventbrite / Dice
psql "$DATABASE_URL" -c "
  SELECT COUNT(*) AS twins FROM events hz
  WHERE hz.source = '19hz'
    AND EXISTS (
      SELECT 1 FROM events plat
      WHERE (
        (plat.source = 'ra' AND hz.url ILIKE '%ra.co/events/' || plat.source_event_id || '%')
        OR (plat.source = 'eventbrite' AND hz.url ILIKE '%-tickets-' || plat.source_event_id || '%')
        OR (plat.source = 'dice' AND hz.url ILIKE '%dice.fm%/event/' || plat.source_event_id || '%')
      )
    );"

# Food tips use replaceForSource (closed set per metro)
psql "$DATABASE_URL" -c \"SELECT city, COUNT(*) FROM events WHERE source='food' GROUP BY city ORDER BY city;\"

pnpm --filter @bored/shared exec tsc --noEmit
pnpm --filter @bored/api exec tsc --noEmit
```

Feed: SF food topic → Chicago Infatuation/Eater tips excluded; curated tips don’t steal timed-query slots.

---

## Smoke checks after P3

```bash
# Showtimes: past + stale GC (after movies ingest)
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS past FROM showtimes WHERE starts_at < now() - interval '12 hours';"
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS stale FROM showtimes WHERE last_seen_at < now() - interval '3 days';"

# Open mic inactive queue under cap
psql "$DATABASE_URL" -c "SELECT COUNT(*) AS inactive FROM recurring_shows WHERE active = false;"

# contentHash is a content fingerprint (not a copy of source_event_id)
psql "$DATABASE_URL" -c "SELECT COUNT(*) FILTER (WHERE content_hash = source_event_id) AS mirrored, COUNT(*) AS total FROM events;"
```

After a Phase 1 ingest, `mirrored` should drop toward 0 as rows get real fingerprints. Inactive open mics ≤ 40.

---

## Related

- [Ingest](./ingest.md) — adapters & schedules
- [Architecture](./architecture.md) — food / activities verticals
- [Data model](./data-model.md) — `events`, `recurring_shows`, `showtimes`
