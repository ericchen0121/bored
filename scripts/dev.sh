#!/usr/bin/env bash
# Start web + API for local development with auto-restart on crash.
# Frees ports 3000/4000 before each (re)start so stale processes never block startup.
#
# Always binds for phone-on-Wi‑Fi when a LAN IP is available:
#   Next on 0.0.0.0, NEXT_PUBLIC_API_URL → http://<lan>:4000
# Override: LAN_IP=192.168.x.x pnpm dev
# Localhost-only: DEV_LOCALHOST=1 pnpm dev
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_PORT="${API_PORT:-4000}"
WEB_PORT="${WEB_PORT:-3000}"
DEV_LOCALHOST="${DEV_LOCALHOST:-0}"

detect_lan_ip() {
  local iface ip
  iface="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')"
  if [[ -n "${iface}" ]]; then
    ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
    if [[ -n "${ip}" ]]; then
      echo "${ip}"
      return 0
    fi
  fi
  for iface in en0 en1 en2; do
    ip="$(ipconfig getifaddr "${iface}" 2>/dev/null || true)"
    if [[ -n "${ip}" ]]; then
      echo "${ip}"
      return 0
    fi
  done
  return 1
}

WEB_HOST="127.0.0.1"
API_PUBLIC="http://127.0.0.1:${API_PORT}"
WEB_PUBLIC="http://127.0.0.1:${WEB_PORT}"
LAN_READY=0

if [[ "${DEV_LOCALHOST}" != "1" ]]; then
  if [[ -z "${LAN_IP:-}" ]]; then
    LAN_IP="$(detect_lan_ip || true)"
  fi
  if [[ -n "${LAN_IP}" ]]; then
    WEB_HOST="0.0.0.0"
    API_PUBLIC="http://${LAN_IP}:${API_PORT}"
    WEB_PUBLIC="http://${LAN_IP}:${WEB_PORT}"
    LAN_READY=1
  else
    echo "[dev] no LAN IP detected — localhost only (set LAN_IP=… or connect Wi‑Fi for phone testing)"
  fi
fi

kill_bored_dev_processes() {
  pkill -9 -f "${ROOT}/apps/api" 2>/dev/null || true
  pkill -9 -f "${ROOT}/apps/web" 2>/dev/null || true
  pkill -9 -f '@bored/api exec tsx watch' 2>/dev/null || true
  pkill -9 -f '@bored/web' 2>/dev/null || true
  pkill -9 -f 'tsx watch src/index.ts' 2>/dev/null || true
  pkill -9 -f "next dev --port ${WEB_PORT}" 2>/dev/null || true
}

free_port() {
  local port=$1
  local attempt=0
  while [[ "${attempt}" -lt 10 ]]; do
    local pids
    pids="$(lsof -nP -iTCP:"${port}" -sTCP:LISTEN -t 2>/dev/null || true)"
    if [[ -z "${pids}" ]]; then
      return 0
    fi
    echo "[dev] freeing port ${port} (pids: ${pids})"
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
    sleep 1
    attempt=$((attempt + 1))
  done
  echo "[dev] warning: port ${port} still in use after cleanup"
  return 1
}

cleanup() {
  echo ""
  echo "[dev] shutting down…"
  [[ -n "${API_PID:-}" ]] && kill "${API_PID}" 2>/dev/null || true
  [[ -n "${WEB_PID:-}" ]] && kill "${WEB_PID}" 2>/dev/null || true
  kill_bored_dev_processes
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

run_api() {
  while true; do
    free_port "${API_PORT}" || true
    echo "[api] starting → http://127.0.0.1:${API_PORT}/health"
    if [[ "${LAN_READY}" == "1" ]]; then
      echo "[api] phone   → ${API_PUBLIC}/health"
    fi
    (
      cd "${ROOT}"
      API_PORT="${API_PORT}" \
        WEB_ORIGIN="${WEB_PUBLIC}" \
        pnpm --filter @bored/api exec tsx watch src/index.ts
    ) || true
    echo "[api] exited — restart in 2s"
    sleep 2
  done
}

run_web() {
  while true; do
    free_port "${WEB_PORT}" || true
    echo "[web] starting → ${WEB_PUBLIC}"
    (
      cd "${ROOT}/apps/web"
      # Override apps/web/.env.local so phone + desktop both hit a reachable API URL
      NEXT_PUBLIC_API_URL="${API_PUBLIC}" \
        LAN_IP="${LAN_IP:-}" \
        WATCHPACK_POLLING=true \
        pnpm exec next dev --port "${WEB_PORT}" --hostname "${WEB_HOST}"
    ) || true
    echo "[web] exited — restart in 2s"
    sleep 2
  done
}

kill_bored_dev_processes
free_port "${API_PORT}" || true
free_port "${WEB_PORT}" || true
# Brief settle so respawning watchers don't race the bind
sleep 1
free_port "${API_PORT}" || true
free_port "${WEB_PORT}" || true

run_api &
API_PID=$!
sleep 2
run_web &
WEB_PID=$!

echo ""
echo "Bored dev stack (auto-restart on crash). Ctrl+C to stop."
echo "  Web  ${WEB_PUBLIC}"
echo "  API  ${API_PUBLIC}/health"
echo "  Admin ${WEB_PUBLIC}/admin"
if [[ "${LAN_READY}" == "1" ]]; then
  echo ""
  echo "Phone (same Wi‑Fi): open ${WEB_PUBLIC}"
  echo "Mac browser also works at http://127.0.0.1:${WEB_PORT}"
fi
echo ""

wait
