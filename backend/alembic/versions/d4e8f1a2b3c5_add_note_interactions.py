"""add note interactions: pin, reply, user_tags

Revision ID: d4e8f1a2b3c5
Revises: c3f9a2e1b8d4
Create Date: 2026-04-29 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e8f1a2b3c5'
down_revision: Union[str, None] = 'c3f9a2e1b8d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_pinned', sa.Boolean(), nullable=False, server_default='0'))
        batch_op.add_column(sa.Column('reply_to_id', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('user_tags', sa.Text(), nullable=True))
        batch_op.create_foreign_key(
            'fk_notes_reply_to_id',
            'notes',
            ['reply_to_id'],
            ['id'],
            ondelete='SET NULL'
        )


def downgrade() -> None:
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.drop_constraint('fk_notes_reply_to_id', type_='foreignkey')
        batch_op.drop_column('user_tags')
        batch_op.drop_column('reply_to_id')
        batch_op.drop_column('is_pinned')
