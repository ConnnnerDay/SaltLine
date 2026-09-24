# Self-hosting Saltline on home hardware

This is the deployment target recorded in `docs/CANONICAL_ROADMAP.md`'s
"Product decisions on record (2026-09-24)" entry, replacing the original
Vercel + Render + Neon target: Postgres, `apps/api`, `apps/web`, and the
Cloudflare Tunnel connector itself all run as containers in one
`docker-compose.yml` on a home machine. No port-forwarding, no exposed
home IP, no cloud hosting bill, and only one tool to have running
(Docker Desktop) -- no separate native install for anything.

An earlier version of this setup ran the tunnel connector as a native
Windows service instead of a container, reaching into Docker's published
port from outside Docker entirely. That hit a real Windows-specific bug
(`localhost` resolving to the IPv6 `::1` first, which nothing was
listening on, surfacing as a Cloudflare 502) and meant two different
things to keep running and update. Keeping the connector in Docker
avoids both problems: it reaches `apps/web` by Docker's own internal DNS
(`web:3000`), never through the host machine's network stack at all.

## Architecture

```
Internet --> Cloudflare (TLS, DNS) --> cloudflared (container, outbound-only tunnel)
                                              |  Docker-internal network (web:3000)
                                              v
                                        apps/web (Next.js BFF)
                                              |  signed internal requests
                                              v
                                        apps/api (FastAPI)
                                              |
                                              v
                                         Postgres (auth + forecast schemas)
```

`apps/api` and `postgres` have no published ports at all -- only
reachable from other containers on the compose network. `apps/web` is
`expose`d (container-network-only, not published to the host), reachable
only from `cloudflared` on that same network. The browser only ever
talks to `apps/web` through the tunnel, matching the canonical "browser
calls the BFF only" contract. This is arguably a stricter enforcement of
that rule than the original Vercel/Render setup, since there's no public
URL for `apps/api` to (mis)route to, and no host port for `apps/web`
either.

## Prerequisites

- A Windows machine at home, on and reachable, with Docker Desktop
  installed (WSL2 backend) so `docker compose version` works from a
  terminal (Git Bash is what the commands below assume). Docker Desktop
  is the only thing that needs to be running -- nothing else installed
  natively.
- A domain name with its DNS managed by Cloudflare (free tier is fine).
  This runbook uses `www.reelgoodday.com`.
- No router/firewall changes needed -- the tunnel is an outbound
  connection to Cloudflare, not an inbound one.

## 1. Get the code onto the machine

```bash
git clone https://github.com/ConnnnerDay/SaltLine.git
cd SaltLine
```

(Or `git pull` if it's already cloned there.)

## 2. If you previously ran cloudflared as a native Windows service, stop it

Skip this if you're starting fresh. Otherwise: open **Services**
(Win+R -> `services.msc`), find `cloudflared`, stop it, and set its
startup type to **Disabled** (or uninstall it outright). Two connectors
racing for the same tunnel causes flaky, unpredictable routing.

## 3. Create (or reuse) the Cloudflare Tunnel, as a Docker connector

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
-> **Networks -> Tunnels**:

- **Starting fresh:** Create a tunnel -> Cloudflared -> name it (e.g.
  `ReelGoodDay`) -> on "Install and run a connector," choose **Docker**
  and copy the token from the `tunnel run --token ...` command shown
  (you don't need to run that command yourself -- `docker-compose.yml`'s
  `cloudflared` service does).
- **Reusing an existing tunnel** (e.g. one previously set up with the
  Windows connector): open that tunnel -> **Rotate token** -> copy the
  new token. Rotating invalidates the old native-service token, which is
  fine since that service is now stopped.

Paste the token into `.env` as `CLOUDFLARE_TUNNEL_TOKEN` (step 4 creates
that file if it doesn't exist yet).

Then add (or re-add) the **Published application** route:

- Subdomain: `www`
- Domain: `reelgoodday.com`
- Service type: `HTTP`
- URL: `web:3000` (the container's Docker DNS name, not `localhost` or
  `127.0.0.1` -- there's no Windows loopback in this path anymore)

If you had an old route pointing at `localhost:3000` or `127.0.0.1:3000`
from a previous attempt, delete it first rather than editing in place --
editing was observed to sometimes silently drop the route's DNS record
in this exact setup. After adding it, confirm in the main Cloudflare
dashboard (not Zero Trust) -> `reelgoodday.com` -> **DNS** -> **Records**
that a `CNAME` for `www` pointing to `<tunnel-id>.cfargotunnel.com`
actually exists.

Do **not** add a route for `apps/api` -- it should stay unreachable from
the internet.

## 4. Run the setup script

```bash
bash deploy/setup.sh
```

This does everything else:

- creates `.env` from `deploy/.env.example` if it doesn't exist yet
  (`DOMAIN` already set to `www.reelgoodday.com`);
- fills in every blank secret/password in it
  (`POSTGRES_SUPERUSER_PASSWORD`, `SALTLINE_WEB_DB_PASSWORD`,
  `SALTLINE_API_DB_PASSWORD`, `INTERNAL_SIGNING_KEY_SECRET`,
  `BETTER_AUTH_SECRET`) with a freshly generated random value;
- builds and starts the whole stack, including `cloudflared`
  (`docker compose up -d --build`).

`CLOUDFLARE_TUNNEL_TOKEN` is **not** auto-generated -- paste in the real
value from step 3 before running this, or `docker compose up` will fail
with a clear "set CLOUDFLARE_TUNNEL_TOKEN in .env" error. `SMTP_*` is
deliberately left blank: accounts auto-confirm and no verification/reset
emails send until you fill those in later, same as the legacy app's
documented behavior with SMTP unset.

Safe to re-run any time -- it never overwrites a secret `.env` already
has, and starting an already-running stack is a no-op. First run takes a
few minutes (building both images).

On first boot, Postgres also creates the `saltline_web`/`saltline_api`
roles and `auth`/`forecast` schemas (`deploy/postgres/init-roles.sh`,
mirroring `apps/web/README.md` and `apps/api/README.md`'s local-dev
instructions exactly), then `api` runs `alembic upgrade head` and `web`
runs `npm run migrate:auth` before either starts serving.

Check everything came up:

```bash
docker compose ps
docker compose logs -f web api cloudflared
```

## 5. Verify

- `https://www.reelgoodday.com` should load the app over a real
  Cloudflare TLS certificate.
- Register an account, confirm you land on the dashboard/forecast flow.
- `docker compose exec api curl -s http://localhost:8000/health/ready`
  should return `{"status":"ok"}`.

## After a machine restart

Docker Desktop needs to be running, and (if it isn't set to launch
automatically) the containers need to come back up -- all of them have
`restart: unless-stopped`, so once Docker's daemon is up they restart on
their own, `cloudflared` included. From PowerShell:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"; for ($i=0; $i -lt 60 -and -not (docker info 2>$null); $i++) { Start-Sleep 2 }; Set-Location "$env:USERPROFILE\SaltLine"; docker compose up -d; docker compose ps
```

## Updating

```bash
git pull
bash deploy/setup.sh
```

Migrations re-run automatically and no-op if already applied; existing
secrets in `.env` are left untouched.

## Backups

Postgres data lives in the `postgres_data` named volume. Back up both
schemas the same way `docs/DB_RESILIENCE.md` documents for local dev,
just pointed at the containerized database:

```bash
docker compose exec postgres pg_dump -U saltline_api -d saltline -n forecast \
  --no-owner --no-privileges -f /tmp/forecast_backup.sql
docker compose cp postgres:/tmp/forecast_backup.sql ./forecast_backup.sql

docker compose exec postgres pg_dump -U saltline_web -d saltline -n auth \
  --no-owner --no-privileges -f /tmp/auth_backup.sql
docker compose cp postgres:/tmp/auth_backup.sql ./auth_backup.sql
```

Store these off the box (they're the only copy of real account and
forecast-cache data once the machine's disk is the only copy of
anything). A simple scheduled task running the two commands above plus
an off-box copy (another machine, an object-storage bucket, etc.) is
enough for v1 -- there's no managed-backup equivalent to Neon's here, so
this is now your responsibility to actually run.

## What changed vs. the original cloud plan

`docs/CANONICAL_ROADMAP.md`'s canonical technical contract originally
named Vercel (web) + Render (API) + pooled Neon (Postgres). The product
owner directed a switch to self-hosting on home hardware for cost
reasons; see that document's "Product decisions on record (2026-09-24)"
entry for the recorded decision and the updated contract table. The
ADR-006 database ownership model (separate least-privilege roles/schemas
per app) is unchanged -- only *where* Postgres runs changed, not how the
two apps are isolated from each other inside it.
