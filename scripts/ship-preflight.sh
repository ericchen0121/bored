#!/usr/bin/env bash
# Compare local DB vs Railway prod for ship readiness.
# Usage: pnpm ship:preflight   (needs local .env DATABASE_URL + railway link)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "missing .env" >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL not set in .env" >&2
  exit 1
fi

echo "== Local drizzle files =="
ls -1 drizzle/*.sql 2>/dev/null | sed 's|drizzle/||' || true

echo
echo "== Local source counts (hidden=false) =="
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "
select source, count(*)::int as n
from events where hidden=false
group by 1 order by n desc;
" || true

echo
echo "== Local IG token =="
psql "$DATABASE_URL" -c "
select length(value) as len, updated_at
from app_settings where key='ig_access_token';
" 2>/dev/null || echo "(no app_settings / no token locally)"

echo
echo "== Prod (railway ssh api) =="
# Remote script uses only double-quoted JS strings to avoid bash nesting hell.
railway ssh -s api -- bash -lc "cd /app && cat > /tmp/ship-preflight.mjs <<'END'
import postgres from '/app/node_modules/.pnpm/postgres@3.4.9/node_modules/postgres/src/index.js';
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const mig = await sql.unsafe('select count(*)::int as n from drizzle.__drizzle_migrations');
const files = await sql.unsafe(\"select tablename from pg_tables where schemaname='public' and tablename in ('app_settings','ig_creators') order by 1\");
const src = await sql.unsafe('select source, count(*)::int as n from events where hidden=false group by 1 order by n desc');
let tok = null;
try {
  const rows = await sql.unsafe(\"select length(value) as len, updated_at from app_settings where key='ig_access_token'\");
  tok = rows[0] ?? null;
} catch {}
console.log(JSON.stringify({ migrations: mig[0], tables: files, sources: src, igToken: tok }, null, 2));
await sql.end({ timeout: 1 });
END
node /tmp/ship-preflight.mjs
echo '--- drizzle in image ---'
ls /app/drizzle/*.sql 2>/dev/null | xargs -n1 basename
"

echo
echo "== Checklist =="
echo "1. Local drizzle/*.sql must all exist under /app/drizzle on prod (rebuild api if not)."
echo "2. Source counts: if local has instagram/youtube >> prod, one-shot ingest on prod."
echo "3. IG token: prod app_settings should be fresh; Graph expiry < 0d → renew + sync."
echo "4. Rebuild api+web+ingest after contract/schema/adapter changes — never Redeploy-only."
echo "See docs/ship-checklist.md"
