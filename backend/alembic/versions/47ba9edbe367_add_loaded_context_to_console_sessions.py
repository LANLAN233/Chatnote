"""add_loaded_context_to_console_sessions

Revision ID: 47ba9edbe367
Revises: 21bd0ea3c109
Create Date: 2026-05-08 02:04:29.999686

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '47ba9edbe367'
down_revision: Union[str, None] = '21bd0ea3c109'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add loaded_context column to console_sessions."""
    op.add_column('console_sessions', sa.Column('loaded_context', sa.Text(), nullable=True))


def downgrade() -> None:
    """Remove loaded_context column from console_sessions."""
    op.drop_column('console_sessions', 'loaded_context')