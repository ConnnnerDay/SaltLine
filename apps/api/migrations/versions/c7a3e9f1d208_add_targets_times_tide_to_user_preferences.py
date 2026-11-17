"""add target groups, fishing times and tide preference to user_preferences

Revision ID: c7a3e9f1d208
Revises: b5e2c8d4f106
Create Date: 2026-11-17 04:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c7a3e9f1d208"
down_revision: str | None = "b5e2c8d4f106"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences", sa.Column("target_groups", sa.JSON(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("fishing_times", sa.JSON(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("tide_preference", sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "tide_preference")
    op.drop_column("user_preferences", "fishing_times")
    op.drop_column("user_preferences", "target_groups")
