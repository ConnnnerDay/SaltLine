"""add favorite_species to user_preferences

Revision ID: e5c2a8b4d017
Revises: d4b1f7a2c903
Create Date: 2026-11-18 15:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e5c2a8b4d017"
down_revision: str | None = "d4b1f7a2c903"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_preferences", sa.Column("favorite_species", sa.JSON(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("user_preferences", "favorite_species")
