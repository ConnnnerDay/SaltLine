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

cloudflared runs as a native Windows connector (installed via the
Cloudflare Zero Trust dashboard's tunnel setup), not as a container --
if you already created the tunnel and see it listed as "Healthy" in the
dashboard, that part is done; skip straight to step 4 for the "Public
hostname" route, then step 5 to start the app stack.

## Prerequisites

- A Windows machine at home, on and reachable, with Docker Desktop
  installed (WSL2 backend) so `docker compose version` works from a
  terminal.
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

## 2. Create your `.env`

```bash
cp deploy/.env.example .env
```

(`docker-compose.yml` lives at the repo root, so `.env` must too --
that's why the copy target isn't inside `deploy/`.)

Generate every secret with:

```bash
openssl rand -hex 32
```

Fill in `.env`:

- `DOMAIN=www.reelgoodday.com` (must exactly match the tunnel route's
  hostname, not just the registered domain)
- `POSTGRES_SUPERUSER_PASSWORD`, `SALTLINE_WEB_DB_PASSWORD`,
  `SALTLINE_API_DB_PASSWORD` -- three separate generated values.
- `INTERNAL_SIGNING_KEY_SECRET` -- one generated value (`INTERNAL_SIGNING_KEY_ID`
  can stay `default`).
- `BETTER_AUTH_SECRET` -- one generated value.
- Leave `SMTP_*` blank for now if you don't have an SMTP provider handy --
  accounts will auto-confirm and no verification/reset emails will send,
  same as the legacy app's documented behavior with SMTP unset. Fill
  these in later to turn on real email.

There is no `CLOUDFLARE_TUNNEL_TOKEN` variable -- the tunnel connector
runs natively (step 3), not from this `.env`.

## 3. Create the Cloudflare Tunnel (skip if already done)

In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/):

1. **Networks -> Tunnels -> Create a tunnel -> Cloudflared.**
2. Name it (e.g. `ReelGoodDay`).
3. On the "Install and run a connector" step, choose **Windows** and run
   the install command it shows in a terminal on this machine. Once it
   connects, the tunnel's Overview page shows it as **Healthy** with an
   active replica (this is the same step you already completed if you're
   picking up from here).

## 4. Add the public hostname route

Add a **Published application** route:

- Subdomain: `www`
- Domain: `reelgoodday.com`
- Service type: `HTTP`
- URL: `localhost:3000`

(This step is already done if you're picking up from a completed
`www.reelgoodday.com` route with a Cloudflare-created CNAME to
`<tunnel-id>.cfargotunnel.com`.) Do **not** add a route for `apps/api`
-- it should stay unreachable from the internet. `localhost:3000` won't
actually answer until step 5 starts the app stack, but the route can be
saved now.

Only `www.reelgoodday.com` resolves through the tunnel this way -- the
bare `reelgoodday.com` apex has no route and won't load. That's fine for
now; add a second **Published application** route (same steps, blank
subdomain) later if the apex should work too.

## 5. Start the stack

```bash
docker compose up -d --build
```

First boot: Postgres initializes and creates the `saltline_web`/
`saltline_api` roles and `auth`/`forecast` schemas (`deploy/postgres/
init-roles.sh`, mirroring `apps/web/README.md` and `apps/api/README.md`'s
local-dev instructions exactly), then `api` runs `alembic upgrade head`
and `web` runs `npm run migrate:auth` before either starts serving.
`web` publishes to `127.0.0.1:3000`, which is what the tunnel route in
step 4 forwards to -- no other config needed on the app side.

Check everything came up:

```bash
docker compose ps
docker compose logs -f web api
```

## 6. Verify

- `https://www.reelgoodday.com` should load the app over a real Cloudflare
  TLS certificate.
- Register an account, confirm you land on the dashboard/forecast flow.
- `docker compose exec api curl -s http://localhost:8000/health/ready`
  should return `{"status":"ok"}`.

## Updating

```bash
git pull
docker compose up -d --build
```

Migrations re-run automatically and no-op if already applied.

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
anything). A simple cron job running the two commands above plus an
off-box copy (another machine, an object-storage bucket, etc.) is enough
for v1 -- there's no managed-backup equivalent to Neon's here, so this is
now your responsibility to actually run.

## What changed vs. the original cloud plan

`docs/CANONICAL_ROADMAP.md`'s canonical technical contract originally
named Vercel (web) + Render (API) + pooled Neon (Postgres). The product
owner directed a switch to self-hosting on home hardware for cost
reasons; see that document's "Product decisions on record (2026-09-24)"
entry for the recorded decision and the updated contract table. The
ADR-006 database ownership model (separate least-privilege roles/schemas
per app) is unchanged -- only *where* Postgres runs changed, not how the
two apps are isolated from each other inside it.
