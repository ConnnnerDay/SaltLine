#!/usr/bin/env bash
# run-saltline.sh -- run the canonical Saltline stack (apps/api + apps/web)
# on one machine, e.g. a home server you open from other devices on the LAN.
#
# The website (apps/web) gets every forecast from the backend (apps/api)
# over a signed internal request. Running them by hand makes it easy to
# start only one, or give them different signing keys -- either way every
# forecast page shows "Couldn't load the forecast". This script starts
# both from ONE settings file so they always match.
#
# First run creates saltline.env (git-ignored) with fresh random secrets;
# fill in the two database URLs (see apps/web/README.md "Authentication
# locally" and apps/api/README.md "/v1/me/preferences locally"), then run
# again. Requires: Python deps for apps/api, `npm ci` done in apps/web.
#
# Usage:  scripts/run-saltline.sh            (web on 0.0.0.0:$PORT, default 5757)
# Check:  curl http://localhost:5757/api/health   ->  {"web":"ok","api":"ok"}

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ROOT}/saltline.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  rand() { python3 -c 'import secrets; print(secrets.token_hex(32))'; }
  cat > "${ENV_FILE}" <<EOF
# Saltline settings for scripts/run-saltline.sh. Keep this file private.
PORT=5757
# The address you open in the browser (used for links and auth cookies).
NEXT_PUBLIC_SITE_URL=http://localhost:5757

# Shared by apps/web and apps/api -- must be identical for both.
INTERNAL_SIGNING_KEY_ID=home
INTERNAL_SIGNING_KEY_SECRET=$(rand)
INTERNAL_API_BASE_URL=http://127.0.0.1:8000

BETTER_AUTH_SECRET=$(rand)

# Fill these in (separate roles/schemas, same database):
WEB_DATABASE_URL=postgresql://saltline_web:CHANGE_ME@localhost:5432/saltline
API_DATABASE_URL=postgresql+asyncpg://saltline_api:CHANGE_ME@localhost:5432/saltline
EOF
  chmod 600 "${ENV_FILE}"
  echo "Created ${ENV_FILE}. Set WEB_DATABASE_URL / API_DATABASE_URL (and"
  echo "NEXT_PUBLIC_SITE_URL to the address you browse to), then run this again."
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if grep -q CHANGE_ME "${ENV_FILE}"; then
  echo "Edit ${ENV_FILE}: the database URLs still contain CHANGE_ME." >&2
  exit 1
fi

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "[saltline] starting apps/api on ${INTERNAL_API_BASE_URL}"
(
  cd "${ROOT}/apps/api"
  DATABASE_URL="${API_DATABASE_URL}" \
    python3 -m uvicorn app.main:app --host 127.0.0.1 --port 8000
) &
pids+=($!)

for _ in $(seq 1 30); do
  if curl -fsS "${INTERNAL_API_BASE_URL}/health/live" >/dev/null 2>&1; then break; fi
  sleep 1
done
curl -fsS "${INTERNAL_API_BASE_URL}/health/live" >/dev/null \
  || { echo "[saltline] apps/api did not start -- see its output above." >&2; exit 1; }

cd "${ROOT}/apps/web"
if [[ ! -d .next ]] || [[ -n "$(find app lib -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]]; then
  echo "[saltline] building apps/web"
  DATABASE_URL="${WEB_DATABASE_URL}" npm run build
fi

echo "[saltline] starting apps/web on 0.0.0.0:${PORT}"
DATABASE_URL="${WEB_DATABASE_URL}" npx next start -H 0.0.0.0 -p "${PORT}" &
pids+=($!)

wait -n "${pids[@]}"
