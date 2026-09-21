import asyncio
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

# app.domain.preferences/saved_locations import app.infra.database.Base
# and define their models against it -- importing them here is what
# populates Base.metadata for autogenerate. Every future forecast/
# preferences model needs the same import added here.
from app.domain.analytics import AnalyticsEvent  # noqa: F401
from app.domain.preferences import UserPreferences  # noqa: F401
from app.domain.saved_locations import SavedLocation  # noqa: F401
from app.infra.database import Base

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# DATABASE_URL, not alembic.ini's static sqlalchemy.url: a real
# connection string is an environment secret, not something to commit
# to a config file, matching app.infra.internal_signature's env-var
# posture for its own keys.
config.set_main_option("sqlalchemy.url", os.environ["DATABASE_URL"])

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# ADR-006: this connection only ever operates within the `forecast`
# schema (the saltline_api role owns nothing else) -- the alembic_version
# tracking table lives there too, not in `public`, for the same reason
# app.infra.database.create_engine sets search_path=forecast rather than
# qualifying every table individually.
VERSION_TABLE_SCHEMA = "forecast"

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table_schema=VERSION_TABLE_SCHEMA,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        version_table_schema=VERSION_TABLE_SCHEMA,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """In this scenario we need to create an Engine
    and associate a connection with the context.

    """

    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        # Matches app.infra.database.create_engine: without this, the
        # connection's search_path defaults to "$user", public, so
        # CREATE TABLE lands in (and needs privileges on) public --
        # exactly what ADR-006's REVOKE ALL ON SCHEMA public FROM
        # saltline_api (see README's own setup commands) denies.
        # version_table_schema below only relocates alembic_version
        # itself; it doesn't affect where a migration's own DDL runs.
        connect_args={"server_settings": {"search_path": "forecast"}},
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode."""

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
