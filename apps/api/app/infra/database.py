"""PostgreSQL engine/session setup (sprint 36 -- the first real database
connection this service has had).

Per docs/architecture.md's ADR-006 ("one Neon PostgreSQL project with
separate `auth` and `forecast` schemas, owned by separate least-privilege
roles ... the API role can access only forecast locations, preferences,
station catalogues, observations, forecast snapshots, and refresh
locks"): this module's engine is configured to operate entirely within
the `forecast` schema, via `search_path` set once per session at engine
creation (`-c search_path=forecast` in `connect_args`) rather than
per-model `schema=` arguments scattered across every table -- the
`saltline_api` Postgres role (see apps/api/README.md's "Local dev"
section for how to create it) owns that schema and nothing else, so
there is no `public`/`auth` table this connection could reach even by
mistake.

`DATABASE_URL` is a real local Postgres connection string in dev today;
moving to the real pooled Neon project (still blocked on sprints 9/10's
credentials) is a connection-string change, not a code change -- the
same posture `apps/web/lib/auth.ts` already took for its own,
independent `auth`-schema connection. The two apps never share a
connection string or a role: this one authenticates as `saltline_api`
against `forecast`, `apps/web`'s Better Auth setup authenticates as
`saltline_web` against `auth`, matching ADR-006's role separation.
"""

from __future__ import annotations

import os
from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Declarative base for every ORM model in this service. A single
    shared base (not one per module) is what lets Alembic's autogenerate
    see every model's metadata from one import.
    """


def create_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(
        database_url,
        connect_args={"server_settings": {"search_path": "forecast"}},
    )


def create_sessionmaker(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(engine, expire_on_commit=False)


def required_database_url() -> str:
    """Fails closed, matching `app.api.internal_auth`'s posture for its
    own required env vars: a misconfigured deployment should 500 loudly
    at startup, not silently run against no database.
    """
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError(
            "DATABASE_URL is not set -- required for /v1/me/preferences "
            "(see apps/api/README.md)"
        )
    return url


async def get_db_session(
    sessionmaker: async_sessionmaker[AsyncSession],
) -> AsyncIterator[AsyncSession]:
    async with sessionmaker() as session:
        yield session
