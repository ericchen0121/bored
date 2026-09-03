# Ship checklist — keep prod like local

When multiple agents change code + local DB, **do not** dump the local database to Railway. Prod stays healthy by: **rebuild skewed services → migrate → sync secrets → re-ingest what local has that prod lacks → smoke-test**.

Local inventory is the *source of truth for intent* (which adapters, which tokens, which features). Prod is rebuilt from migrations + ingest, not copied rows.

## What broke last time (Sep 2026 — IG reels)

| Failure | Why |
|---|---|
| Web new, API old | Railway **Redeploy** reused a stale image; `videos=only` ignored → Eventbrite shown as “reels” |
| Migrations missing on prod | Old image only had `/drizzle` through `0003`; `app_settings` / IG tables never applied |
| 0 Instagram / YouTube rows | Local had manual `instagram` ingest; prod daily cron never landed (or token dead) |
| Graph 400s | Prod `IG_ACCESS_TOKEN` expired; local had a renewed token in `app_settings` only |

## Golden rules

1. **Never “Redeploy” after code changes** — always `railway up --service <svc>` (or a GitHub deploy that **rebuilds**). Redeploy ≠ rebuild.
2. **Ship API + web + ingest together** when the change touches shared feed/media contracts, schema, or adapters. Version skew is the #1 prod break.
3. **Never `pg_dump` local → prod** as the default. Prefer migrate + targeted ingest. Dump only for emergency forensics.
4. **Durable secrets live in two places**: Railway env (bootstrap) **and** DB (`app_settings` for IG token). Sync both when you renew locally.
5. **Phase 1 cron ≠ all adapters.** Instagram / YouTube / newsletters / etc. need `ingest-daily` or an explicit `--only=…` one-shot.

## Pre-ship: classify what changed

Walk the branch (or agent chats) and tick every bucket that applies:

| Bucket | Examples | Prod must get |
|---|---|---|
| **A. Schema** | New `drizzle/000N_*.sql`, `app_settings`, `ig_creators` | Fresh **api** image (entrypoint runs `pnpm db:migrate`) |
| **B. API / shared feed contract** | `videos=`, media proxy, ranker, schemas | Rebuild **api** (+ **web** if it calls new fields) |
| **C. Web-only UI** | CSS, carousel chrome | Rebuild **web** only (still smoke feed) |
| **D. Ingest adapters / seeds** | New IG handles, YT channels, venue adapters | Rebuild **ingest-*** + one-shot or wait for cron |
| **E. Secrets / tokens** | Renewed `IG_ACCESS_TOKEN`, new `YOUTUBE_API_KEY` | Set on **api + all ingest-***; persist IG into `app_settings` |
| **F. Local-only data** | You ran `pnpm ingest:once -- --only=instagram` locally | Same one-shot against **prod** after API is current |

If unsure: treat as **A+B+D+E**.

## Ship sequence (agents: follow in order)

### 1. Commit migrations

```bash
# Local schema must be in /drizzle, not only db:push
pnpm db:generate   # if schema.ts changed
git status drizzle/
```

No new SQL under `drizzle/` while local has extra tables → **stop** and generate.

### 2. Rebuild (do not Redeploy)

```bash
railway up --service api          # migrate on boot
railway up --service web          # if web or NEXT_PUBLIC_* changed
railway up --detach --service ingest-phase1
railway up --detach --service ingest-movies
railway up --detach --service ingest-daily
```

Confirm the new deployment `meta.reason` is **`deploy`** (build), not a no-op redeploy of the same `imageDigest`.

### 3. Sync secrets that local used

```bash
# Example: IG token (prefer DB-stored long-lived token)
# 1) Write into prod app_settings (via railway ssh -s api + postgres)
# 2) railway variables --service api|ingest-* --set IG_ACCESS_TOKEN=…
# Same pattern for YOUTUBE_API_KEY, META_APP_*, IG_BUSINESS_USER_ID
```

`railway run` uses `postgres.railway.internal` and **fails on your laptop**. One-shots: **`railway ssh -s api`** (or a running ingest image) with prod `DATABASE_URL`.

### 4. Re-ingest adapters that local has and prod lacks

Compare source counts (local `.env` DB vs prod via ssh):

```text
instagram, youtube, food_deals, activities, theater, newsletter, …
```

Then one-shot only what’s missing or stale:

```bash
railway ssh -s api -- bash -lc \
  'cd /app && pnpm --filter @bored/ingest exec tsx src/cli.ts --once --only=instagram,youtube'
```

| Adapter class | Cron coverage | Typical one-shot after ship |
|---|---|---|
| Phase 1 (19hz, luma, TM, funcheap, …) | `ingest-phase1` every 6h | Optional if feed already dense |
| Movies | `ingest-movies` every 12h | Rarely needed |
| IG / YT / Phase 2 | `ingest-daily` 06:15 UTC | **Required** if you ingested locally while building the feature |

### 5. Smoke (must pass before calling it done)

```bash
curl -sS https://bored-api.up.railway.app/health
# Schema: prod has app_settings / latest drizzle tags (ssh + SQL)
# Feed contract
curl -sS 'https://bored-api.up.railway.app/v1/feed?mode=today&area=bay&limit=200&videos=only' \
  | jq '[.cards[].source] | group_by(.) | map({(.[0]): length})'
# Expect instagram/youtube — NOT eventbrite/funcheap as the only “reels”
# Media (pick an IG id from videos=only)
curl -sSI "https://bored-api.up.railway.app/v1/events/<id>/media/stream"   # video/mp4
```

Browser: hard-refresh prod; carousel titles should be real reels/shorts.

### 6. Optional script

```bash
pnpm ship:preflight    # local vs prod source counts + migration hints
```

## Agent protocol (multi-agent → one ship)

1. **One ship owner** merges agent branches and runs this checklist once — don’t let each agent “partial deploy.”
2. Before shipping, ask: *“What did we change only on the local DB?”* → that list becomes §4 one-shots.
3. Prefer documenting ops in the PR: `Migrations: 0007_…` / `Ingest: instagram,youtube` / `Secrets: IG token renewed`.
4. If web ships without API (or vice versa) for a contract change → **roll forward** the lagging service immediately; don’t leave skew overnight.

## Anti-patterns

- Railway dashboard **Redeploy** after merging feed/schema/ingest work
- Assuming daily cron will catch up “soon enough” for a feature launch the same day
- Renewing IG token only in local `.env` / local `app_settings`
- Putting Instagram CDN URLs in the client (CORP) — always `/v1/events/:id/media/stream`
- Baselining migrations on Railway (`pnpm db:baseline` is **local-only** after `db:push`)

## Related

- [Deploy](./deploy.md) — Railway topology, env vars, first boot
- [Ingest](./ingest.md) — adapters, schedules, IG/YouTube rules
- [Productionize](./productionize.md) — data-model hygiene
- [Admin](./admin.md) — `/admin/instagram` token status / renew
