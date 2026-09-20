"""create user_preferences table

Revision ID: 28efa8760686
Revises:
Create Date: 2026-09-16 16:19:16.698692

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "28efa8760686"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("units", sa.String(), nullable=False),
        sa.Column("fishing_style", sa.String(), nullable=True),
        sa.Column("wind_threshold_kt", sa.Float(), nullable=True),
        sa.Column("surf_threshold_ft", sa.Float(), nullable=True),
        sa.Column("default_location_id", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("user_id"),
    )


def downgrade() -> None:
    op.drop_table("user_preferences")
