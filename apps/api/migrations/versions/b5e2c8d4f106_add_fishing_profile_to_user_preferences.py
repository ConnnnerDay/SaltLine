"""add fishing profile to user_preferences

Revision ID: b5e2c8d4f106
Revises: 9a4d6e1f2c73
Create Date: 2026-11-17 03:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b5e2c8d4f106"
down_revision: str | None = "9a4d6e1f2c73"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences", sa.Column("fishing_types", sa.JSON(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("uses_lures", sa.String(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("uses_live_bait", sa.String(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("uses_cut_bait", sa.String(), nullable=True)
    )
    op.add_column(
        "user_preferences", sa.Column("experience", sa.String(), nullable=True)
    )
    op.add_column(
        "user_preferences",
        sa.Column(
            "profile_completed", sa.Boolean(), nullable=False, server_default=sa.false()
        ),
    )


def downgrade() -> None:
    for column in (
        "profile_completed",
        "experience",
        "uses_cut_bait",
        "uses_live_bait",
        "uses_lures",
        "fishing_types",
    ):
        op.drop_column("user_preferences", column)
