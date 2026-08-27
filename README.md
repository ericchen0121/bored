# Bored — Events discovery

Web-first feed of things to do in **San Francisco / Bay Area** and **Chicago**: music, comedy, tech, food, cheap finds, and movies — with a shared API ready for iOS later.

## Docs

- [Documentation index](./docs/README.md)
- [Architecture](./docs/architecture.md)
- [City seeding plan](./docs/city-seeding.md)
- [City expansion strategy](./docs/city-expansion-strategy.md)
- [API](./docs/api.md)
- [Ingest](./docs/ingest.md)
- [Ranking](./docs/ranking.md)
- [Data model](./docs/data-model.md)
- [Monetization](./docs/monetization.md)

## Stack

- `apps/web` — Next.js UI
- `apps/api` — Hono REST API (`/v1/feed`, `/v1/events`, `/v1/movies`, `/v1/me/*`)
- `packages/shared` — Zod schemas + affinity/adjacent/serendipity ranker
- `packages/db` — Postgres + Drizzle
- `packages/ingest` — Source adapters + cron runner

## Quick start

```bash
# 1. Postgres (docker compose up -d, or point DATABASE_URL at local Postgres)
# 2. Copy env and set DATABASE_URL
cp .env.example .env

# 3. Install
pnpm install

# 4. Schema + seed
pnpm db:push
pnpm db:seed

# 5. Optional: pull live sources
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --phase1

# 6. Run API + web
pnpm dev:api   # :4000
pnpm dev:web   # :3000
```

- Web: http://localhost:3000
- API: http://localhost:4000/health

## Ingest

```bash
pnpm --filter @bored/ingest exec tsx src/cli.ts --once --phase1
pnpm --filter @bored/ingest exec tsx src/cli.ts --once
pnpm --filter @bored/ingest exec tsx src/cli.ts --schedule
```

Optional keys in `.env`: `TICKETMASTER_API_KEY`, `TMS_API_KEY`, `YOUTUBE_API_KEY`, `IG_ACCESS_TOKEN`, `IG_BUSINESS_USER_ID`.

Film posters/ratings come from Letterboxd + Rotten Tomatoes scrapes (no TMDB). Optional `YOUTUBE_API_KEY` fills trailers when pages lack an embed.

Adapters skip gracefully when keys are missing. Seed data still powers a demo feed.

See [docs/ingest.md](./docs/ingest.md) for the full adapter list.

## Feed ranking

~65% affinity / ~25% adjacent / ~10% serendipity, using interest weights, neighborhoods, budget, distance, and save/dismiss/going signals.

Modes: Tonight · This weekend · For you · All events. Cities: San Francisco · Chicago. Areas: All SF · All Bay Area · Chicago.

Details: [docs/ranking.md](./docs/ranking.md).
