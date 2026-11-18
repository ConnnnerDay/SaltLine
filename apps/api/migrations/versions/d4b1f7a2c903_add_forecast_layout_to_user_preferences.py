"""add forecast_layout to user_preferences

Revision ID: d4b1f7a2c903
Revises: c7a3e9f1d208
Create Date: 2026-11-18 01:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4b1f7a2c903"
down_revision: str | None = "c7a3e9f1d208"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences", sa.Column("forecast_layout", sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "forecast_layout")
