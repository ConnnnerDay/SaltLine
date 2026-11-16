"""create alert_rule table

Revision ID: 9a4d6e1f2c73
Revises: 7c1e5d2a9b40
Create Date: 2026-11-16 20:00:00.000000

"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "9a4d6e1f2c73"
down_revision: str | None = "7c1e5d2a9b40"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "alert_rule",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("location_id", sa.String(), nullable=False),
        sa.Column("min_verdict", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("last_sent_on", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "location_id"),
    )
    op.create_index(
        op.f("ix_alert_rule_user_id"), "alert_rule", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_rule_user_id"), table_name="alert_rule")
    op.drop_table("alert_rule")
