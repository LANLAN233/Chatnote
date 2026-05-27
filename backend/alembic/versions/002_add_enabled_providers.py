"""Add enabled_providers JSONB column to users table.

This supports multi-provider selection — users can enable multiple
LLM providers instead of being limited to a single preferred_llm.

Revision ID: 002_add_enabled_providers
Revises: 001_pgvector_baseline
Create Date: 2026-05-27
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "002_add_enabled_providers"
down_revision: Union[str, None] = "001_pgvector_baseline"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "enabled_providers",
            sa.JSONB(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "enabled_providers")
