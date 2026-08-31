# Local development

How to keep **web** (`:3000`) and **API** (`:4000`) running reliably while you change code, schema, or env.

## One command (recommended)

From the repo root:

```bash
pnpm dev
```

This runs [`scripts/dev.sh`](../scripts/dev.sh), which:

1. **Frees ports 3000 and 4000** — kills stale listeners so `EADDRINUSE` never blocks you after restarts or agent sessions.
2. **Starts API + web together** — same as running both dev servers, but supervised.
3. **Auto-restarts on crash** — if either process exits (compile error, OOM, port glitch), it comes back in ~2s.
4. **Phone-ready by default** — binds Next to `0.0.0.0` and points the client at your LAN IP when Wi‑Fi is available.

Leave this terminal open for the whole session. Use a **second terminal** for ingest, migrations, one-off scripts.

### After `.env` changes

`tsx watch` reloads **code**, not env. After editing `.env` (e.g. `ADMIN_TOKEN`, affiliate keys):

```bash
pnpm dev:restart
```

Same as `pnpm dev` — frees ports and starts fresh so new env vars load.

## URLs

`pnpm dev` / `pnpm dev:restart` print both localhost and LAN URLs when Wi‑Fi is up.

| Service | URL |
|---|---|
| Web (Mac) | http://127.0.0.1:3000 |
| Web (phone, same Wi‑Fi) | printed LAN URL at startup (e.g. `http://192.168.x.x:3000`) |
| API health | http://127.0.0.1:4000/health |
| Admin | http://127.0.0.1:3000/admin |

**Share / SEO URLs locally:** OG images, JSON-LD, and sitemap entries use `siteUrl()`. Locally that defaults to `http://127.0.0.1:3000`. For production-like previews, set `NEXT_PUBLIC_SITE_URL` in `.env` and restart web (`pnpm dev:restart`).

Quick check:

```bash
curl -s http://127.0.0.1:4000/health
# → {"ok":true,"service":"bored-api"}
```

### Phone testing

Same Wi‑Fi as the Mac. After `pnpm dev` or `pnpm dev:restart`, open the printed LAN URL (e.g. `http://192.168.x.x:3000`).

- Override IP: `LAN_IP=192.168.1.20 pnpm dev`
- Localhost only: `DEV_LOCALHOST=1 pnpm dev`
- If the page won’t load: allow Node in **System Settings → Network → Firewall**

## Run services separately

When debugging only one side:

```bash
pnpm dev:api   # :4000, tsx watch
pnpm dev:web   # :3000, next dev
```

Prefer `pnpm dev` day-to-day — separate terminals are easy to orphan and cause port conflicts.

## Common workflows (nothing should block you)

| Change | Action |
|---|---|
| TS/React in `apps/web` | Save — Next hot reloads |
| TS in `apps/api` | Save — `tsx watch` reloads |
| Schema in `packages/db` | `pnpm db:push` — **no restart** needed for most reads; restart if API errors on missing columns |
| `.env` | `pnpm dev:restart` |
| New workspace dependency | `pnpm install` then `pnpm dev:restart` |
| Admin / ingest jobs | Keep `pnpm ingest` in another terminal ([Ingest](./ingest.md)) |

## Troubleshooting

### Port already in use

Don't hunt PIDs manually — use the supervisor:

```bash
pnpm dev:restart
```

It clears `:3000` and `:4000` before starting.

### Feed empty / API errors

1. `curl http://127.0.0.1:4000/health` — if this fails, API isn't up; run `pnpm dev`.
2. Postgres running and `DATABASE_URL` set in `.env`.
3. Optional data: `pnpm db:seed` or a Phase 1 ingest ([Ingest](./ingest.md)).

### Multiple API processes

Symptom: random `EADDRINUSE`, old code still serving, admin auth feels stale.

Cause: several `pnpm dev:api` / agent restarts left watchers running.

Fix: **stop extra terminals**, then:

```bash
pnpm dev:restart
```

Rule: **one** supervised dev stack per machine (`pnpm dev`), not multiple `dev:api` tabs.

### Web file watching on macOS

The dev script sets `WATCHPACK_POLLING=true` for Next.js so saves are picked up reliably.

## Optional: ingest worker

Not part of `pnpm dev` — long-running scraper:

```bash
pnpm ingest   # schedule + admin job poller
```

## Agents / automation

When an agent or script needs the stack up:

```bash
pnpm dev:restart
# wait for "listening on :4000" / Next "Ready"
curl -sf http://127.0.0.1:4000/health
```

Do **not** spawn additional `dev:api` processes unless the supervisor isn't running.

## Related

- [README quick start](../README.md)
- [API](./api.md)
- [Admin](./admin.md)
- [Architecture](./architecture.md)
