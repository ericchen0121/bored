# Admin dashboard

Ops UI at **`/admin`** (Next.js) talking to **`/v1/admin/*`** (Hono). Gated by shared `ADMIN_TOKEN` — never by `X-User-Id`.

## Setup

1. Set a long random token in `.env`:

```bash
ADMIN_TOKEN=your-secret-here
```

2. Restart dev stack so env reloads: `pnpm dev:restart` (see [Development](./development.md)).
3. Ensure ingest is running with schedule so “Run now” jobs execute:

```bash
pnpm ingest
```

4. Open [http://localhost:3000/admin/login](http://localhost:3000/admin/login) and paste the token.

## Screens

| Route | Purpose |
|---|---|
| `/admin` | Ingest adapters, last-run status, static schedule view, enqueue Phase 1 / all / single adapter |
| `/admin/listings` | Search listings, tag coverage by source |
| `/admin/listings/:id` | Edit title/description/tags/categories/URLs, hide, attach sponsor boost |
| `/admin/demotions` | Feed demotion rules (create/edit, score bury + per-venue cap, venue typeahead) |
| `/admin/sponsors` | CRM list + inventory (active / stale boosts) |
| `/admin/sponsors/:id` | Edit package, attach/clear boosts, 2-week trial preset |
| `/admin/reports` | Outbound click rollups (`outbound_clicks`) for sales |

## How “Run now” works

Admin inserts a row into `ingest_jobs`. The long-running ingest CLI (`--schedule`) polls every ~30s and runs `runAll` / `runAdapter`. The API does **not** scrape.

Static cron metadata is read-only in MVP (see `packages/ingest/src/schedules.ts`). Durable DB schedules are Phase 2.

## Auth

Send `Authorization: Bearer <ADMIN_TOKEN>` (or `X-Admin-Token`). Web stores the token in `sessionStorage` / `localStorage` after login.

If `ADMIN_TOKEN` is unset, admin APIs return **503**.

## Schema notes

- `events.hidden` — soft-hide from public feed/detail; ingest upserts do not clear it.
- `feed_demotion_rules` — ops soft-bury + optional per-venue feed caps (see [Ranking](./ranking.md)).
- `ingest_jobs` — admin trigger queue.
- Sponsors / boosts reuse existing `sponsors` + `events.is_sponsored` columns (see [Monetization](./monetization.md)).

## Related

- [API](./api.md)
- [Ingest](./ingest.md)
- [Monetization](./monetization.md)
- [Data model](./data-model.md)
