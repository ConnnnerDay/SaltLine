# Database resilience (sprint 46)

Scope per the roadmap's sprint 46 row: migrations, constraints, indexes,
pooling, backups, and a blank-restore drill, against `apps/api`'s
PostgreSQL `forecast` schema (ADR-006). All of this was exercised against
a real local PostgreSQL 16 instance, the same one sprint 28 onward has
used for `apps/web`'s `auth` schema and this service's `forecast` schema
— not asserted from unit tests alone. Automated backups *of the
production Neon project itself* stay blocked on sprints 9/10 (that
project doesn't exist yet); what's here is the schema-level resilience
posture and a real, evidenced restore procedure that carries over
unchanged once Neon is provisioned — see "What's still blocked" below.

## Migrations

Found and fixed a real bug while exercising this from a genuinely blank
database (not an already-migrated one, which had been masking it):
`migrations/env.py`'s async engine had no `search_path`, so `alembic
upgrade head` tried to `CREATE TABLE` in the `public` schema and failed
with `permission denied for schema public` against exactly the
least-privilege role setup `apps/api/README.md`'s own "Local dev"
section instructs (`REVOKE ALL ON SCHEMA public FROM saltline_api`).
`version_table_schema="forecast"` only relocates the `alembic_version`
bookkeeping table — it doesn't set the connection's `search_path`, so
every migration's own DDL was still landing against `public`, which the
documented setup denies. Fixed by adding the same `connect_args=
{"server_settings": {"search_path": "forecast"}}` `app.infra.database
.create_engine` already uses, to the migration engine in `env.py`.
Confirmed fixed against a fresh database created from the README's exact
setup commands: `alembic upgrade head` now succeeds cleanly, migrating
`-> 28efa8760686 -> a763f8747baa -> 600375436618` (head).

## Constraints

`user_preferences.units` was validated only at the API layer
(`PreferencesUpdate.units: DisplayUnits`, a closed Pydantic enum) — real
for every request through the router, but no guard at all for a future
script or migration writing the table directly. Added a `CHECK`
constraint (`ck_user_preferences_units`, migration `600375436618`)
mirroring the same two values. Verified live, bypassing the API
entirely: a raw `psql` `INSERT ... VALUES ('raw-test', 'bogus')` against
the real local database is rejected —

```
ERROR:  new row for relation "user_preferences" violates check constraint "ck_user_preferences_units"
DETAIL:  Failing row contains (raw-test, bogus, null, null, null, null).
```

— while `'imperial'`/`'metric'` insert normally. `apps/api/tests/
test_database.py` covers the same behavior against the ephemeral SQLite
database the router test suite already uses, going around the Pydantic
layer with a raw `insert()` so the DB-level guard is what's actually
under test, not a restatement of the API-layer validation.

Autogenerate doesn't detect Postgres `CHECK` constraint additions from
reflection — `alembic revision --autogenerate` for this change produced
only the spurious `alembic_version` drop/recreate the README's "Local
dev" section already documents stripping, with no constraint diff at
all. Migration `600375436618` is hand-written for that reason, not
generated-then-edited like the two before it; its own docstring notes
this so the next agent doesn't assume autogenerate output was trusted.

No foreign key was added from either table to Better Auth's `auth`
schema — that absence is deliberate, not a gap: both tables' own
docstrings (`app/domain/preferences.py`, `app/domain/saved_locations.py`)
already document why (ADR-006's schema/role split means this connection
has no grant on `auth` at all), and sprint 45's account-deletion
`beforeDelete` hook exists specifically because there's no FK to cascade
that cleanup automatically. Adding one now would silently reopen a
decision already made on record, not close a real gap.

## Indexes

Reviewed both tables against their actual query patterns
(`app/api/v1/preferences.py`, `app/api/v1/saved_locations.py`):
`user_preferences` is keyed and queried by `user_id` alone (its primary
key, already indexed). `saved_location` is queried by `user_id` (an
explicit `ix_saved_location_user_id` index, sprint 37) and uniqueness-
checked on `(user_id, location_id)` (the `UniqueConstraint` from the
same sprint, which Postgres backs with its own index). No new index is
needed for anything either router actually does today. Noted for a
future pass, not changed here since it's an efficiency observation with
real migration risk, not a correctness gap: the standalone `user_id`
index and the composite unique constraint's index both serve a bare
`WHERE user_id = ...` lookup, so the single-column index is redundant
with the composite one's leading column — dropping it would save one
index's write overhead per insert/delete at no query-plan cost, but
isn't worth doing as a drive-by inside this sprint.

## Pooling

`app.infra.database.create_engine` had no pool configuration at all —
SQLAlchemy's defaults are reasonable for a short-lived script, not for
an always-on service (the canonical contract's Render deployment, not a
per-request serverless function) talking to a pooled, PgBouncer-fronted
Neon endpoint that silently drops idle server-side connections. Added:

- `pool_pre_ping=True` — a cheap `SELECT 1` probe before handing out a
  pooled connection, transparently reconnecting on failure instead of
  surfacing a random mid-request "connection was closed" error.
- `pool_recycle=1800` — forces a periodic reconnect well under a typical
  idle-close window even if `pre_ping`'s probe race loses.
- `pool_size=5`, `max_overflow=10` — conservative for a single small API
  instance against an endpoint that itself caps concurrent server
  connections; easy to raise once real traffic (sprints 57-59) gives
  evidence either bound is too tight.

`apps/api/tests/test_database.py::test_create_engine_configures_a_persistent_pinged_pool`
inspects the constructed (unconnected) engine's `AsyncAdaptedQueuePool`
to confirm these are actually wired, not just documented — pooling
behavior itself needs a live database to observe under load, which CI
doesn't have (same posture `docs/R2_CI_BASELINE.md` already holds for
live upstream providers), so this is what a deterministic suite can
assert.

## Backups and a real blank-restore drill

Procedure (added to `apps/api/README.md`'s "Local dev" section):

```bash
# backup: a plain-SQL dump of the forecast schema only (no --no-owner
# tricks needed beyond stripping ownership/privilege statements, since
# the target role recreates its own schema before restoring)
PGPASSWORD=... pg_dump -h localhost -U saltline_api -d saltline \
  -n forecast --no-owner --no-privileges -f forecast_backup.sql

# restore: into a blank database that already has the same
# least-privilege role/schema setup this README's own "Local dev"
# section creates (see that section for the exact CREATE ROLE/SCHEMA
# commands)
PGPASSWORD=... psql -h localhost -U saltline_api -d <target-db> \
  -f forecast_backup.sql
```

Exercised for real, not just documented: inserted one real
`user_preferences` row and two real `saved_location` rows into the local
database (alongside the migrations above, so `alembic_version` was at
head), `pg_dump`'d the `forecast` schema, then restored that dump into a
**separate, freshly created blank database** with the same role/schema
setup the README's own commands produce — proving a full recover-from-
backup path without needing a destructive drop-and-recreate of the
working database to demonstrate it. Confirmed after restore, against the
new database:

- Both tables' rows are present and byte-identical to what was inserted
  (`SELECT * FROM user_preferences` / `saved_location` match).
- `alembic_version` carries the same head revision (`600375436618`) —
  `alembic current` against the restored database reports `600375436618
  (head)`, and `alembic upgrade head` against it is a clean no-op,
  proving the restored database's migration state is actually consistent
  with the migration history, not just "some data came back."
- The `ck_user_preferences_units` constraint survived the restore and is
  still enforced: a post-restore raw `INSERT ... VALUES (...,  'bogus')`
  against the *restored* database was rejected with the same constraint
  violation as the original.

## What's still blocked

- **Automated backups of the real production database** need the real
  Neon project (sprints 9/10's standing credentials blocker) to exist —
  what Neon's own point-in-time-recovery/branching offers may make a
  hand-rolled `pg_dump` cron unnecessary there; that's an evaluation for
  whichever sprint actually provisions it, not guessed at here.
- **A migration gate wired into a release pipeline** (verifying head
  before promoting a deploy) is sprint 48's ("Release controls") job,
  which itself needs real hosting to promote *to* — this sprint is the
  schema-level resilience posture and a proven manual restore path, not
  the CI/CD wiring around it.
