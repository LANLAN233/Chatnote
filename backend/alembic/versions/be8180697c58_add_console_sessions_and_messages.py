"""add console sessions and messages

Revision ID: be8180697c58
Revises: ab6086c27160
Create Date: 2026-04-28 19:04:51.206747

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'be8180697c58'
down_revision: Union[str, None] = 'ab6086c27160'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Tables are created automatically by init_db() via Base.metadata.create_all()
    # This migration serves as a schema version marker.
    pass


def downgrade() -> None:
    pass
