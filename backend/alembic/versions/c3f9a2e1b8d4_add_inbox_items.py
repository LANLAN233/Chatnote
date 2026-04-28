"""add inbox_items table

Revision ID: c3f9a2e1b8d4
Revises: be8180697c58
Create Date: 2026-04-28 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3f9a2e1b8d4'
down_revision: Union[str, None] = 'be8180697c58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables are created automatically by init_db() via Base.metadata.create_all()
    # This migration serves as a schema version marker.
    pass


def downgrade() -> None:
    pass
