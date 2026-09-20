"""create saved_location table

Revision ID: a763f8747baa
Revises: 28efa8760686
Create Date: 2026-09-16 17:01:12.202372

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a763f8747baa"
down_revision: str | None = "28efa8760686"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_location",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("location_id", sa.String(), nullable=False),
        sa.Column("saved_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "location_id"),
    )
    op.create_index(
        op.f("ix_saved_location_user_id"), "saved_location", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_saved_location_user_id"), table_name="saved_location")
    op.drop_table("saved_location")
