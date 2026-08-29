#!/usr/bin/env bash
set -euo pipefail

SERVICE="${SERVICE:-api}"

case "$SERVICE" in
  api)
    echo "[entrypoint] migrating database…"
    pnpm db:migrate
    echo "[entrypoint] starting API on PORT=${PORT:-4000}"
    exec pnpm --filter @bored/api start
    ;;
  web)
    echo "[entrypoint] starting web on PORT=${PORT:-3000}"
    exec pnpm --filter @bored/web start
    ;;
  ingest)
    echo "[entrypoint] starting ingest scheduler"
    exec pnpm --filter @bored/ingest start
    ;;
  migrate)
    exec pnpm db:migrate
    ;;
  *)
    echo "Unknown SERVICE=$SERVICE (expected api|web|ingest|migrate)" >&2
    exit 1
    ;;
esac
