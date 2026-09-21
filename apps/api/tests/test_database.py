"""Tests for app.infra.database (sprint 46, database resilience).

Pooling can't be exercised against a real Postgres connection here (no
live database in CI -- see docs/R2_CI_BASELINE.md's posture on that),
but `create_engine`'s pool settings are plain constructor arguments:
inspecting the resulting (unconnected) engine's pool is enough to prove
they're actually wired, not just present in a docstring. The units
CHECK constraint is exercised for real against the same ephemeral
SQLite database test_preferences_router.py uses, going around the
Pydantic layer entirely via a raw insert -- the whole point of a
defense-in-depth DB constraint is that it holds even when the app-layer
validation is bypassed.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
from sqlalchemy import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import QueuePool

from app.domain.preferences import UserPreferences
from app.infra.database import Base, create_engine


def test_create_engine_configures_a_persistent_pinged_pool() -> None:
    engine = create_engine("postgresql+asyncpg://user:pass@localhost/db")
    pool = engine.pool
    assert isinstance(pool, QueuePool)
    assert pool._pre_ping is True
    assert pool._recycle == 1800
    assert pool.size() == 5
    assert pool._max_overflow == 10


@pytest.fixture
async def sqlite_engine() -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield engine
    await engine.dispose()


async def test_units_check_constraint_rejects_bad_values_at_the_db_layer(
    sqlite_engine: AsyncEngine,
) -> None:
    async with sqlite_engine.begin() as conn:
        with pytest.raises(IntegrityError):
            await conn.execute(
                insert(UserPreferences).values(user_id="raw-insert", units="bogus")
            )


async def test_units_check_constraint_allows_the_two_real_values(
    sqlite_engine: AsyncEngine,
) -> None:
    async with sqlite_engine.begin() as conn:
        await conn.execute(
            insert(UserPreferences).values(user_id="user-a", units="imperial")
        )
        await conn.execute(
            insert(UserPreferences).values(user_id="user-b", units="metric")
        )
