#!/bin/bash
# Runs once, only against a brand-new (empty) Postgres data volume --
# docker-entrypoint-initdb.d convention. Mirrors, verbatim, the
# ADR-006 role/schema split apps/web/README.md and apps/api/README.md
# already document for local dev: a least-privilege role per app, each
# owning exactly one schema and nothing else.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE saltline_web WITH LOGIN PASSWORD '$SALTLINE_WEB_DB_PASSWORD';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO saltline_web;
    GRANT CREATE ON DATABASE "$POSTGRES_DB" TO saltline_web;
    CREATE SCHEMA auth AUTHORIZATION saltline_web;
    REVOKE ALL ON SCHEMA public FROM saltline_web;

    CREATE ROLE saltline_api WITH LOGIN PASSWORD '$SALTLINE_API_DB_PASSWORD';
    GRANT CONNECT ON DATABASE "$POSTGRES_DB" TO saltline_api;
    GRANT CREATE ON DATABASE "$POSTGRES_DB" TO saltline_api;
    CREATE SCHEMA forecast AUTHORIZATION saltline_api;
    REVOKE ALL ON SCHEMA public FROM saltline_api;
EOSQL
