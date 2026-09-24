#!/usr/bin/env bash
# One-command self-hosted setup: creates .env from the template if
# missing, auto-generates every secret/password left blank in it, then
# builds and starts the whole docker-compose.yml stack. Safe to re-run --
# it never overwrites a secret that's already set, and docker compose
# up/build are already idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  cp deploy/.env.example .env
  echo "Created .env from deploy/.env.example"
fi

# Normalize line endings: a Windows git checkout with core.autocrlf can
# hand this script a CRLF .env even though deploy/.env.example itself is
# LF-only (.gitattributes pins the template, not a file this script
# writes to on first run), which would otherwise silently break the
# "is this var still blank" check below.
sed -i.bak 's/\r$//' .env && rm -f .env.bak

random_hex() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    # Portable fallback if openssl isn't on PATH (e.g. some minimal
    # Git-for-Windows installs): read raw bytes from /dev/urandom,
    # which Git Bash/MSYS2 and WSL both provide, and hex-encode them.
    head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

fill_if_blank() {
  local var_name="$1"
  if grep -qE "^${var_name}=$" .env; then
    local value
    value="$(random_hex)"
    sed -i.bak "s|^${var_name}=\$|${var_name}=${value}|" .env
    rm -f .env.bak
    echo "Generated ${var_name}"
  fi
}

for var in POSTGRES_SUPERUSER_PASSWORD SALTLINE_WEB_DB_PASSWORD SALTLINE_API_DB_PASSWORD INTERNAL_SIGNING_KEY_SECRET BETTER_AUTH_SECRET; do
  fill_if_blank "$var"
done

echo "Building and starting the stack (first run downloads/builds images, can take a few minutes)..."
docker compose up -d --build

echo
echo "Done. Check status with: docker compose ps"
echo "Once containers are healthy, https://www.reelgoodday.com should serve the app."
