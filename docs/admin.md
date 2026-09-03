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
| `/admin/instagram` | IG creators by metro — look up handles, add/disable scrape targets |
| `/admin/instagram/token` | Instagram Graph token status (expiry) + renew; stores refreshed token in DB |
| `/admin/deploys` | Railway service deploy status + links to the project dashboard |
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

## Railway deploys

`GET /v1/admin/deploys` proxies the Railway GraphQL API (latest deploy per service + recent history).

| Env | Notes |
|---|---|
| `RAILWAY_PROJECT_TOKEN` | Preferred. Project token (Project settings → Tokens). Required on the **api** service in production. |
| `RAILWAY_API_TOKEN` | Account/workspace token alternative. Locally, `railway login` is enough (reads `~/.railway/config.json`). |
| `RAILWAY_PROJECT_ID` | Optional; defaults to the Bored project. Injected automatically when the API runs on Railway. |
| `RAILWAY_ENVIRONMENT_ID` | Optional; defaults to `production`. |

The Deploys admin screen links each service to `railway.com/project/...`.

## Instagram token

| Env | Notes |
|---|---|
| `IG_ACCESS_TOKEN` | Bootstrap long-lived user token (Graph Explorer short-lived tokens expire in hours). |
| `IG_BUSINESS_USER_ID` | IG professional account id used for business discovery. |
| `META_APP_ID` / `META_APP_SECRET` | Same Meta app as Graph Explorer. Required to **inspect expiry** and **renew**. |

Renewed tokens are written to `app_settings` (`ig_access_token`) so API + ingest both pick them up without editing Railway env every time. Ingest also auto-renews when fewer than 14 days remain.

**Preferred ops path:** on `/admin/instagram/token`, paste a fresh Graph Explorer short-lived user token → **Exchange & save**. The API uses `META_APP_ID` / `META_APP_SECRET` server-side; the long-lived token is stored in DB and never needs to live in `.env` after that. Admin-gated only — do not log the pasted token.

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
