# Production deploy (Railway)

How to run Bored in production: **Postgres**, **API**, **web**, and **ingest** (scrapers) on Railway.

## Architecture

| Service | Role | `SERVICE` env | Notes |
|---|---|---|---|
| **Postgres** | Railway plugin | — | Provides `DATABASE_URL` |
| **api** | Hono REST | `api` | Runs `pnpm db:migrate` then listens on `$PORT`; health `GET /health` |
| **web** | Next.js | `web` | Needs `NEXT_PUBLIC_API_URL` at **build** time |
| **ingest** | Cron scrapers | `ingest` | Schedules in `packages/ingest/src/schedules.ts`; Playwright optional |

Local Docker Compose (`docker-compose.yml`) is **dev only** (Postgres). Production DB is the Railway Postgres plugin.

## Prerequisites

1. [Railway CLI](https://docs.railway.com/guides/cli) (`railway` ≥ 4)
2. Logged in: `railway login`
3. Repo secrets ready (API keys, `ADMIN_TOKEN`, Mapbox, etc.) — see [`.env.example`](../.env.example)

## One-time setup

```bash
# From repo root
railway login
bash scripts/railway-setup.sh   # creates project + postgres + api/web/ingest services
```

Or in the Railway dashboard: New Project → Add Postgres → Add three empty services named `api`, `web`, `ingest`, then connect this GitHub repo (or `railway up` from CLI).

### Per-service settings

All three app services build from the **repo root** `Dockerfile`.

| | api | web | ingest |
|---|---|---|---|
| Root directory | `/` | `/` | `/` |
| Dockerfile | `Dockerfile` | `Dockerfile` | `Dockerfile` |
| `SERVICE` | `api` | `web` | `ingest` |
| Health check | `/health` | `/` (or none) | none |
| Build args | — | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN`, `NEXT_PUBLIC_POSTHOG_*` | `INSTALL_PLAYWRIGHT=1` if flyer scrape needed |

### Variables

**Shared (reference Postgres → `DATABASE_URL` on api + ingest):**

| Variable | Services | Notes |
|---|---|---|
| `DATABASE_URL` | api, ingest | From Postgres plugin (SSL auto-detected) |
| `ADMIN_TOKEN` | api | Required for `/admin` + `/v1/admin/*` |
| `WEB_ORIGIN` | api | Public web origin for CORS (e.g. `https://bored.up.railway.app`) |
| `DEMO_USER_ID` | api | Optional; same UUID as local if you want continuity |
| `TICKETMASTER_API_KEY` | ingest | Optional |
| `TMS_API_KEY` | ingest | Optional |
| `YOUTUBE_API_KEY` | ingest | Optional |
| `GOOGLE_MAPS_API_KEY` | ingest | Optional hero photos |
| `IG_ACCESS_TOKEN` / `IG_BUSINESS_USER_ID` | ingest | Optional |
| `BROWSER_IMAGE_SCRAPE` | ingest | `0` until Chromium installed (`INSTALL_PLAYWRIGHT=1`) |
| `INGEST_RUN_ON_BOOT` | ingest | Set `1` to run Phase 1 once when the worker starts |
| `NEXT_PUBLIC_API_URL` | web (**build**) | Public API URL, e.g. `https://api-….up.railway.app` |
| `NEXT_PUBLIC_SITE_URL` | web (**build**) | **Required in production.** Public web origin for canonical URLs, JSON-LD, OG/share cards, sitemap, and `llms.txt` (e.g. `https://bored-app.up.railway.app`) |
| `NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN` | web (**build**) | Map page |
| `NEXT_PUBLIC_POSTHOG_KEY` | web (**build**) | Product analytics (optional) |
| `NEXT_PUBLIC_POSTHOG_HOST` | web (**build**) | PostHog host; default `https://us.i.posthog.com` |

Affiliate / UTM vars (`TICKETMASTER_AFFILIATE_ID`, `OUTBOUND_UTM_*`, …) go on **api**.

After web and api have public domains, set:

```bash
railway variables --service api --set "WEB_ORIGIN=https://bored-app.up.railway.app"
# Rebuild web with the real API URL as a Docker build-arg / Railway variable
railway variables --service web --set "NEXT_PUBLIC_API_URL=https://bored-api.up.railway.app"
railway variables --service web --set "NEXT_PUBLIC_SITE_URL=https://bored-app.up.railway.app"
```

Current production hosts (Railway-provided; `bored` was taken):

| Service | URL |
|---|---|
| web | https://bored-app.up.railway.app |
| api | https://bored-api.up.railway.app |

## Deploy

```bash
railway link          # once
railway up --service api
railway up --service web
railway up --service ingest
```

Or connect GitHub and enable auto-deploy on `main`.

### First boot checklist

1. API logs show `Migrations complete` then `bored api listening on :$PORT`
2. `curl https://<api>/health` → `{"ok":true,"service":"bored-api"}`
3. Open web URL — feed loads (empty until ingest runs)
4. Trigger seed or first scrape:
   ```bash
   railway run --service ingest -- pnpm --filter @bored/ingest once -- --phase1
   ```
   Or wait for the 6h Phase 1 cron / daily full run.
5. Optional flyer backfill (needs Playwright on ingest image):
   ```bash
   railway run --service ingest -- pnpm ingest:backfill-images -- --limit=200
   ```

### Local DB already created with `db:push`

Production uses SQL migrations under `/drizzle`. If your **local** DB was created with `pnpm db:push`, mark the snapshot as applied once:

```bash
pnpm db:baseline
pnpm db:migrate   # should print "Migrations complete" with no DDL
```

Do **not** baseline a fresh Railway database — let the API entrypoint run `pnpm db:migrate` on first boot.

## Local production-like checks

```bash
# Schema SQL (already generated under /drizzle)
pnpm db:generate

# Apply migrations (fresh DB) — local uses DATABASE_URL from .env
pnpm db:migrate

# Image build (optional)
docker build -t bored \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000 \
  --build-arg INSTALL_PLAYWRIGHT=0 \
  .
docker run --rm -e SERVICE=api -e DATABASE_URL -e PORT=4000 -p 4000:4000 bored
```

## Ingest schedules (production)

Same as local `--schedule` ([ingest.md](./ingest.md)):

- Every 6h — Phase 1 adapters
- Every 3h — movies TMS
- Daily 06:15 UTC — all adapters
- Admin job poller — on demand from `/admin`

Keep **ingest** as a always-on worker (not a one-shot cron) so `node-cron` + the admin job poller stay alive.

## Go-live data hygiene

Data-model cleanup (durable schedules, GC, coalesce) is tracked in [productionize.md](./productionize.md). Prefer a clean migrate + Phase 1 ingest on a fresh Railway DB rather than copying a messy local dump.

## Troubleshooting

| Symptom | Fix |
|---|---|
| API crash on migrate | Confirm `DATABASE_URL` linked; check SSL (`DATABASE_SSL=1` if needed) |
| Web calls localhost:4000 | Rebuild web with correct `NEXT_PUBLIC_API_URL` build-arg |
| CORS errors | Set `WEB_ORIGIN` on api to the exact web origin |
| Empty feed | Run Phase 1 ingest; confirm ingest logs + `ingest_runs` table |
| Flyer scrape OOM | Set `BROWSER_IMAGE_SCRAPE=0` or raise ingest memory; cap concurrency |

## Future: Redis (not in stack today)

Bored does **not** run Redis locally or in production. Caching and queues use Postgres and in-process memory instead:

| Need today | Implementation |
|---|---|
| Today feed cache | In-memory `Map` in `apps/api/src/feedCache.ts` (default **15m** TTL via `TODAY_FEED_CACHE_TTL_MS`, max **24** entries, `limit` ≤ 200 only). Shared for **all users** on `mode=today`; dismissals + `prefsSummary` are overlaid per request. |
| Admin ingest queue | Postgres `ingest_jobs`, polled by the ingest worker |
| Adapter / scrape caches | Postgres columns or per-run in-memory maps |

Add Redis (e.g. Railway plugin + `REDIS_URL`) when one of these becomes a bottleneck:

1. **Shared feed cache** — multiple API replicas need the same Today-feed responses without each cold-hitting Postgres.
2. **Distributed rate limiting** — per-IP or per-key throttles on public `/v1/*` endpoints.
3. **Ingest coordination** — cross-worker locks, dedupe, or a BullMQ-style job queue if Postgres polling is too slow or ingest is scaled horizontally.
4. **Real-time ops** — pub/sub for admin job progress or live status without polling.
5. **Session store** — fast revocation / TTL for auth tokens if magic-link usage grows beyond simple DB lookups.

Until then, skip Redis to keep local and production infra minimal.

## Related

- [Development](./development.md) — local `pnpm dev`
- [Ingest](./ingest.md) — adapters & keys
- [Admin](./admin.md) — ops UI
- [Productionize](./productionize.md) — data/GC checklist
