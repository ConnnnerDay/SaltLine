# Self-hosting Saltline on home hardware

This is the deployment target recorded in `docs/CANONICAL_ROADMAP.md`'s
"Product decisions on record (2026-09-24)" entry, replacing the original
Vercel + Render + Neon target: Postgres, `apps/api`, and `apps/web` run
in Docker (Docker Desktop, on Windows) on one home machine, with a
Cloudflare Tunnel connector running natively on that same machine
publishing only the Next.js app to the internet. No port-forwarding, no
exposed home IP, no cloud hosting bill.

## Architecture

```
Internet --> Cloudflare (TLS, DNS) --> cloudflared (native Windows connector,
                                        outbound-only tunnel)
                                              |
                                              v
                                    localhost:3000 (published by Docker)
                                              |
                                              v
                                        apps/web (Next.js BFF)
                                              |  signed internal requests
                                              v
                                        apps/api (FastAPI)
                                              |
                                              v
                                         Postgres (auth + forecast schemas)
```

`apps/api` and `postgres` have no published ports at all -- only reachable
from other containers on the compose network. `apps/web` is published
only to `127.0.0.1:3000`, reachable from the tunnel connector on the same
machine but not from the LAN or internet directly. The browser only ever
talks to `apps/web` (through the tunnel), matching the canonical "browser
calls the BFF only" contract. This is arguably a stricter enforcement of
that rule than the original Vercel/Render setup, since there's no public
URL for `apps/api` to (mis)route to.

## Prerequisites

- A Windows machine at home, on and reachable, with Docker Desktop
  installed (WSL2 backend) so `docker compose version` works from a
  terminal (Git Bash is what the commands below assume).
- A domain name with its DNS managed by Cloudflare (free tier is fine).
  This runbook uses `www.reelgoodday.com` -- the tunnel's Published
  application route was created for that hostname specifically, not the
  bare `reelgoodday.com` apex, so that's the one that resolves.
- No router/firewall changes needed -- the tunnel is an outbound
  connection from your machine to Cloudflare, not an inbound one.

## 1. Get the code onto the machine

```bash
git clone https://github.com/ConnnnerDay/saltline.git
cd saltline
```

(Or `git pull` if it's already cloned there.)

## 2. Create the Cloudflare Tunnel (skip if already done)

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/):

1. **Networks -> Tunnels -> Create a tunnel -> Cloudflared.** Name it
   (e.g. `ReelGoodDay`).
2. On "Install and run a connector," choose **Windows** and run the
   install command it shows in a terminal on this machine. Once it
   connects, the tunnel's Overview page shows it **Healthy** with an
   active replica.
3. Add a **Published application** route:
   - Subdomain: `www`
   - Domain: `reelgoodday.com`
   - Service type: `HTTP`
   - URL: `localhost:3000`

   Do **not** add a route for `apps/api` -- it should stay unreachable
   from the internet. `localhost:3000` won't actually answer until step
   3 below starts the app stack, but the route can be saved now.

Only `www.reelgoodday.com` resolves through the tunnel this way -- the
bare `reelgoodday.com` apex has no route and won't load. That's fine for
now; add a second **Published application** route (same steps, blank
subdomain) later if the apex should work too.

## 3. Run the setup script

```bash
bash deploy/setup.sh
```

This one command does everything else:

- creates `.env` from `deploy/.env.example` if it doesn't exist yet
  (`DOMAIN` already set to `www.reelgoodday.com`);
- fills in every blank secret/password in it
  (`POSTGRES_SUPERUSER_PASSWORD`, `SALTLINE_WEB_DB_PASSWORD`,
  `SALTLINE_API_DB_PASSWORD`, `INTERNAL_SIGNING_KEY_SECRET`,
  `BETTER_AUTH_SECRET`) with a freshly generated random value;
- builds and starts the whole stack (`docker compose up -d --build`).

There is no `CLOUDFLARE_TUNNEL_TOKEN` variable to fill in -- the tunnel
connector runs natively (step 2 above), not from this `.env`. `SMTP_*`
is deliberately left blank: accounts auto-confirm and no verification/
reset emails send until you fill those in later, same as the legacy
app's documented behavior with SMTP unset.

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
docker compose logs -f web api
```

## 4. Verify

- `https://www.reelgoodday.com` should load the app over a real Cloudflare
  TLS certificate.
- Register an account, confirm you land on the dashboard/forecast flow.
- `docker compose exec api curl -s http://localhost:8000/health/ready`
  should return `{"status":"ok"}`.

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
