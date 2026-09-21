"""create analytics_event table

Revision ID: 0dec7a45d7ba
Revises: 600375436618
Create Date: 2026-09-21 17:14:03.018429

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0dec7a45d7ba"
down_revision: str | None = "600375436618"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_event",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=True),
        sa.Column("location_id", sa.String(), nullable=True),
        sa.Column("state", sa.String(), nullable=True),
        sa.Column("latency_ms", sa.Float(), nullable=True),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_analytics_event_event_type"),
        "analytics_event",
        ["event_type"],
        unique=False,
    )
    op.create_index(
        op.f("ix_analytics_event_occurred_at"),
        "analytics_event",
        ["occurred_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_analytics_event_occurred_at"), table_name="analytics_event")
    op.drop_index(op.f("ix_analytics_event_event_type"), table_name="analytics_event")
    op.drop_table("analytics_event")
