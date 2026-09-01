#!/usr/bin/env bash
# Provision Railway ingest cron services (replaces always-on ingest worker).
# Requires: railway CLI logged in, repo linked to bored project.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: railway login" >&2
  exit 1
fi

ENV_ID="$(railway status --json | python3 -c "import json,sys; print(json.load(sys.stdin)['environments']['edges'][0]['node']['id'])")"

ensure_service() {
  local name="$1"
  if ! railway status --json | python3 -c "import json,sys; names=[e['node']['name'] for e in json.load(sys.stdin)['services']['edges']]; sys.exit(0 if '${name}' in names else 1)"; then
    echo "Creating service ${name}…"
    railway add --service "$name" >/dev/null
  fi
}

echo "Ensuring ingest cron services exist…"
ensure_service ingest-phase1
ensure_service ingest-movies
ensure_service ingest-daily

python3 - <<PY
import json, os, subprocess, urllib.request

token = json.load(open(os.path.expanduser("~/.railway/config.json")))["user"]["token"]
env_id = "${ENV_ID}"
status = json.load(os.popen("railway status --json"))
name_to_id = {e["node"]["name"]: e["node"]["id"] for e in status["services"]["edges"]}

def gql(query, variables):
    payload = json.dumps({"query": query, "variables": variables}).encode()
    req = urllib.request.Request(
        "https://backboard.railway.com/graphql/v2",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 RailwayCLI/4.0",
        },
    )
    with urllib.request.urlopen(req) as resp:
        body = json.load(resp)
    if body.get("errors"):
        raise SystemExit(body["errors"])
    return body["data"]

schedules = {
    "ingest-phase1": ("phase1", "0 */6 * * *"),
    "ingest-movies": ("movies", "0 */12 * * *"),
    "ingest-daily": ("daily", "15 6 * * *"),
}

ingest_vars = json.loads(subprocess.check_output(["railway", "variables", "--service", "ingest", "--json"], text=True))
skip = {
    "SERVICE", "INGEST_RUN_ON_BOOT", "INGEST_CRON_TASK",
    "RAILWAY_ENVIRONMENT", "RAILWAY_ENVIRONMENT_ID", "RAILWAY_ENVIRONMENT_NAME",
    "RAILWAY_PROJECT_ID", "RAILWAY_PROJECT_NAME", "RAILWAY_SERVICE_ID",
    "RAILWAY_SERVICE_NAME", "RAILWAY_PRIVATE_DOMAIN", "RAILWAY_PUBLIC_DOMAIN",
}

for name, (task, cron) in schedules.items():
    sid = name_to_id[name]
    gql(
        """
        mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
          serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
        }
        """,
        {
            "serviceId": sid,
            "environmentId": env_id,
            "input": {
                "cronSchedule": cron,
                "restartPolicyType": "NEVER",
                "sleepApplication": False,
            },
        },
    )
    subprocess.run(
        [
            "railway", "variables", "--service", name,
            "--set", "SERVICE=ingest-cron",
            "--set", f"INGEST_CRON_TASK={task}",
            "--set", "BROWSER_IMAGE_SCRAPE=0",
            "--skip-deploys",
        ],
        check=True,
    )
    for key, val in sorted(ingest_vars.items()):
        if key in skip or val is None:
            continue
        subprocess.run(
            ["railway", "variables", "--service", name, "--set", f"{key}={val}", "--skip-deploys"],
            check=True,
        )
    print(f"configured {name}: cron={cron} task={task}")

if "ingest" in name_to_id:
    gql(
        """
        mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
          serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input)
        }
        """,
        {
            "serviceId": name_to_id["ingest"],
            "environmentId": env_id,
            "input": {"sleepApplication": True, "cronSchedule": None},
        },
    )
    print("legacy ingest service sleeping (disable/remove when cron is verified)")
PY

echo ""
echo "Deploy cron services:"
echo "  railway up --detach --service ingest-phase1"
echo "  railway up --detach --service ingest-movies"
echo "  railway up --detach --service ingest-daily"
