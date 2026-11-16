#!/usr/bin/env bash
# install.sh -- one-command self-host install of Saltline on a Debian/Ubuntu
# machine (e.g. a home server opened from other devices on the LAN).
#
#   git clone https://github.com/ConnnnerDay/SaltLine.git && cd SaltLine && ./install.sh
#
# Re-runnable: run it again after `git pull` to update. It sets up and wires
# together everything the site needs, so nothing has to be started by hand:
#   - PostgreSQL database `saltline` with its two least-privilege roles and
#     schemas (auth for the website, forecast for the API)
#   - apps/api (FastAPI) in its own virtualenv, migrated
#   - apps/web (Next.js) installed, migrated and built
#   - saltline.env with random secrets, so both apps share the same signing
#     keys (a mismatch, or the API not running, is what makes every forecast
#     page say "Couldn't load the forecast")
#   - a `saltline` systemd service that runs both apps, starts on boot and
#     restarts on failure; the retired Flask service is stopped and disabled
# It finishes by calling /api/health, which confirms the website can really
# get forecasts from the API.

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
info() { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
fail() { echo -e "${RED}[x]${NC} $*" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ROOT}/saltline.env"
PORT="${PORT:-5757}"
CURRENT_USER="$(id -un)"
LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
LAN_IP="${LAN_IP:-localhost}"
rand() { python3 -c 'import secrets; print(secrets.token_hex(24))'; }
has_systemd() { [[ -d /run/systemd/system ]]; }

# ---------------------------------------------------------------------------
# 1. System packages (Python, PostgreSQL, Node.js 20+)
# ---------------------------------------------------------------------------
info "Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y -qq python3 python3-venv python3-pip postgresql curl ca-certificates iproute2 lsof psmisc procps

node_major="$(node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/' || true)"
if [[ -z "${node_major}" || "${node_major}" -lt 20 ]]; then
    info "Installing Node.js 22 (NodeSource)..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
    sudo apt-get install -y -qq nodejs
fi

if has_systemd; then
    sudo systemctl enable --now postgresql >/dev/null 2>&1 || true
else
    sudo service postgresql start >/dev/null 2>&1 || true
fi

# ---------------------------------------------------------------------------
# 2. Settings file (secrets generated once, kept on re-runs)
# ---------------------------------------------------------------------------
if [[ ! -f "${ENV_FILE}" ]]; then
    info "Creating ${ENV_FILE} with fresh secrets..."
    web_pw="$(rand)"
    api_pw="$(rand)"
    cat > "${ENV_FILE}" <<EOF
# Saltline settings (written by install.sh). Keep this file private.
PORT=${PORT}
# The address you open in the browser (links and sign-in cookies use it).
NEXT_PUBLIC_SITE_URL=http://${LAN_IP}:${PORT}
# Other addresses you may open it by (sign-in only works from trusted ones).
SALTLINE_TRUSTED_ORIGINS=http://localhost:${PORT},http://127.0.0.1:${PORT},http://$(hostname):${PORT},http://$(hostname).local:${PORT}

# Shared by apps/web and apps/api -- must be identical for both.
INTERNAL_SIGNING_KEY_ID=home
INTERNAL_SIGNING_KEY_SECRET=$(rand)
INTERNAL_API_BASE_URL=http://127.0.0.1:8000

BETTER_AUTH_SECRET=$(rand)

SALTLINE_WEB_DB_PASSWORD=${web_pw}
SALTLINE_API_DB_PASSWORD=${api_pw}
WEB_DATABASE_URL=postgresql://saltline_web:${web_pw}@localhost:5432/saltline
API_DATABASE_URL=postgresql+asyncpg://saltline_api:${api_pw}@localhost:5432/saltline
EOF
    chmod 600 "${ENV_FILE}"
fi
# Settings added in later versions, appended to an existing file on update.
if ! grep -q '^SALTLINE_TRUSTED_ORIGINS=' "${ENV_FILE}"; then
    echo "SALTLINE_TRUSTED_ORIGINS=http://localhost:${PORT},http://127.0.0.1:${PORT},http://$(hostname):${PORT},http://$(hostname).local:${PORT}" >> "${ENV_FILE}"
fi
set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

# ---------------------------------------------------------------------------
# 3. Database: roles, schemas (idempotent; passwords follow saltline.env)
# ---------------------------------------------------------------------------
info "Setting up the PostgreSQL database..."
psql_admin() { sudo -u postgres psql -v ON_ERROR_STOP=1 -qtA "$@"; }
if [[ "$(psql_admin -c "SELECT 1 FROM pg_database WHERE datname='saltline'")" != "1" ]]; then
    psql_admin -c "CREATE DATABASE saltline"
fi
psql_admin -d saltline <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saltline_web') THEN
    CREATE ROLE saltline_web LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'saltline_api') THEN
    CREATE ROLE saltline_api LOGIN;
  END IF;
END
\$\$;
ALTER ROLE saltline_web WITH LOGIN PASSWORD '${SALTLINE_WEB_DB_PASSWORD}';
ALTER ROLE saltline_api WITH LOGIN PASSWORD '${SALTLINE_API_DB_PASSWORD}';
GRANT CONNECT, CREATE ON DATABASE saltline TO saltline_web, saltline_api;
CREATE SCHEMA IF NOT EXISTS auth AUTHORIZATION saltline_web;
CREATE SCHEMA IF NOT EXISTS forecast AUTHORIZATION saltline_api;
REVOKE ALL ON SCHEMA public FROM saltline_web, saltline_api;
SQL

# ---------------------------------------------------------------------------
# 4. apps/api: virtualenv, dependencies, migrations
# ---------------------------------------------------------------------------
info "Installing apps/api..."
cd "${ROOT}/apps/api"
[[ -x .venv/bin/python ]] || python3 -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt
DATABASE_URL="${API_DATABASE_URL}" .venv/bin/alembic upgrade head

# ---------------------------------------------------------------------------
# 5. apps/web: dependencies, auth migration, production build
# ---------------------------------------------------------------------------
info "Installing and building apps/web (a few minutes the first time)..."
cd "${ROOT}/apps/web"
npm ci --no-audit --no-fund --loglevel=error
DATABASE_URL="${WEB_DATABASE_URL}" npm run --silent migrate:auth
DATABASE_URL="${WEB_DATABASE_URL}" npm run --silent build
cd "${ROOT}"

# ---------------------------------------------------------------------------
# 6. Free the port: retire the old Flask service / stray Saltline processes
# ---------------------------------------------------------------------------
if has_systemd && systemctl list-unit-files surf-forecast.service >/dev/null 2>&1; then
    if systemctl is-enabled --quiet surf-forecast 2>/dev/null || systemctl is-active --quiet surf-forecast 2>/dev/null; then
        info "Stopping and disabling the retired Flask service (surf-forecast)..."
        sudo systemctl disable --now surf-forecast >/dev/null 2>&1 || true
    fi
fi
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
listeners() {  # PIDs listening on TCP port $1 (lsof, fuser or ss -- whichever sees it)
    local found=""
    command -v lsof >/dev/null 2>&1 && found="$(sudo lsof -t -nP -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -z "${found}" ]] && command -v fuser >/dev/null 2>&1; then
        found="$(sudo fuser "$1/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true)"
    fi
    if [[ -z "${found}" ]] && command -v ss >/dev/null 2>&1; then
        found="$(sudo ss -ltnpH "( sport = :$1 )" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 || true)"
    fi
    if [[ -z "${found}" ]] && port_busy "$1"; then
        # Can't see the owner (restricted /proc): fall back to Saltline's own processes.
        found="$(pgrep -f 'next-server|next start|uvicorn app.main:app|gunicorn' || true)"
    fi
    echo "${found}"
}
if has_systemd; then
    sudo systemctl stop saltline >/dev/null 2>&1 || true  # re-run: our own service
fi
for port in "${PORT}" 8000; do
    for pid in $(listeners "${port}" | sort -u); do
        cmd="$(ps -o args= -p "${pid}" 2>/dev/null || true)"
        if [[ "${cmd}" =~ (next|uvicorn|gunicorn|app\.py|run-saltline|node) ]]; then
            unit="$(ps -o unit= -p "${pid}" 2>/dev/null | tr -d ' ' || true)"
            if has_systemd && [[ "${unit}" == *.service && "${unit}" != user@* ]]; then
                # Killing it alone would just get it restarted by systemd.
                warn "Stopping and disabling ${unit}, which ran an old Saltline process on port ${port}"
                sudo systemctl disable --now "${unit}" >/dev/null 2>&1 || true
            fi
            warn "Stopping an old Saltline process on port ${port} (pid ${pid}): ${cmd:0:80}"
            sudo kill "${pid}" 2>/dev/null || true
        else
            fail "Port ${port} is used by another program (pid ${pid}: ${cmd:0:80}). Stop it, or rerun with PORT=<other port> ./install.sh"
        fi
    done
done
for _ in $(seq 1 10); do
    port_busy "${PORT}" || port_busy 8000 || break
    sleep 1
done
! port_busy "${PORT}" && ! port_busy 8000 \
    || fail "Ports ${PORT}/8000 are still in use after stopping old processes; stop them and rerun."

# ---------------------------------------------------------------------------
# 7. Run it: systemd service (or a background process without systemd)
# ---------------------------------------------------------------------------
if has_systemd; then
    info "Installing the saltline systemd service..."
    sudo tee /etc/systemd/system/saltline.service >/dev/null <<EOF
[Unit]
Description=Saltline (apps/api + apps/web)
After=network-online.target postgresql.service
Wants=network-online.target postgresql.service

[Service]
Type=simple
User=${CURRENT_USER}
WorkingDirectory=${ROOT}
ExecStart=${ROOT}/scripts/run-saltline.sh
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
    sudo systemctl daemon-reload
    sudo systemctl enable saltline >/dev/null
    sudo systemctl restart saltline
else
    warn "No systemd here: starting Saltline in the background (it won't start on boot)."
    nohup "${ROOT}/scripts/run-saltline.sh" > "${ROOT}/saltline.log" 2>&1 &
fi

# ---------------------------------------------------------------------------
# 8. Verify the whole path: browser -> apps/web -> signed call -> apps/api
# ---------------------------------------------------------------------------
info "Waiting for Saltline to come up..."
health=""
for _ in $(seq 1 60); do
    health="$(curl -fsS "http://localhost:${PORT}/api/health" 2>/dev/null || true)"
    [[ "${health}" == *'"api":"ok"'* ]] && break
    sleep 2
done

echo ""
if [[ "${health}" == *'"api":"ok"'* ]]; then
    info "Saltline is running and forecasts are wired up."
    info "Open: http://${LAN_IP}:${PORT}   (this machine: http://localhost:${PORT})"
else
    warn "Saltline started, but the health check did not pass: ${health:-no response}"
    if has_systemd; then
        warn "See: sudo journalctl -u saltline -n 100"
    else
        warn "See: ${ROOT}/saltline.log"
    fi
fi
echo ""
echo "  Update later:  git pull && ./install.sh"
if has_systemd; then
    echo "  Logs:          sudo journalctl -u saltline -f"
    echo "  Restart:       sudo systemctl restart saltline"
fi
echo ""
echo "  Accounts already in the 'saltline' database are kept. If you can't sign"
echo "  in, the old setup used a different database: just register again."
