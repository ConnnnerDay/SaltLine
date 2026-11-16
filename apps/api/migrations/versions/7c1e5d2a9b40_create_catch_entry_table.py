"""create catch_entry table

Revision ID: 7c1e5d2a9b40
Revises: 0dec7a45d7ba
Create Date: 2026-11-16 19:30:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c1e5d2a9b40"
down_revision: str | None = "0dec7a45d7ba"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "catch_entry",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("location_id", sa.String(), nullable=False),
        sa.Column("species", sa.String(), nullable=False),
        sa.Column("caught_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("length_in", sa.Float(), nullable=True),
        sa.Column("weight_lb", sa.Float(), nullable=True),
        sa.Column("kept", sa.Boolean(), nullable=False),
        sa.Column("bait", sa.String(), nullable=True),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("conditions", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_catch_entry_user_id"), "catch_entry", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_catch_entry_user_id"), table_name="catch_entry")
    op.drop_table("catch_entry")
