"""add_threads_table

Revision ID: 21bd0ea3c109
Revises: d4e8f1a2b3c5
Create Date: 2026-05-07 15:48:04.944626

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21bd0ea3c109'
down_revision: Union[str, None] = 'd4e8f1a2b3c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'threads',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('channel_id', sa.Integer(), nullable=False),
        sa.Column('parent_note_id', sa.Integer(), nullable=False),
        sa.Column('title', sa.Text(), nullable=False),
        sa.Column('created_by', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.ForeignKeyConstraint(['channel_id'], ['channels.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_note_id'], ['notes.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['users.id'], ondelete='CASCADE'),
    )

    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.add_column(sa.Column('thread_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_notes_thread_id', 'threads', ['thread_id'], ['id'], ondelete='CASCADE')


def downgrade() -> None:
    with op.batch_alter_table('notes', schema=None) as batch_op:
        batch_op.drop_constraint('fk_notes_thread_id', type_='foreignkey')
        batch_op.drop_column('thread_id')

    op.drop_table('threads')
