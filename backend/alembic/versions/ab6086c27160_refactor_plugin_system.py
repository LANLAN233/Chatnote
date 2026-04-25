"""refactor_plugin_system

Revision ID: ab6086c27160
Revises: b8a2e1f3c4d5
Create Date: 2026-04-25 16:18:27.193937

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab6086c27160'
down_revision: Union[str, None] = 'b8a2e1f3c4d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # SQLite requires batch mode for dropping/adding columns
    with op.batch_alter_table('plugins', schema=None) as batch_op:
        # Add new columns
        batch_op.add_column(sa.Column('plugin_id', sa.String(), nullable=False, server_default=''))
        batch_op.add_column(sa.Column('source_path', sa.String(), nullable=False, server_default=''))
        # Drop old columns
        batch_op.drop_column('author')
        batch_op.drop_column('config_schema')
        batch_op.drop_column('description')
        batch_op.drop_column('version')
        batch_op.drop_column('name')
        batch_op.drop_column('entry_point')
        # Create unique constraint on plugin_id
        batch_op.create_unique_constraint('uq_plugins_plugin_id', ['plugin_id'])


def downgrade() -> None:
    with op.batch_alter_table('plugins', schema=None) as batch_op:
        batch_op.drop_constraint('uq_plugins_plugin_id', type_='unique')
        batch_op.add_column(sa.Column('entry_point', sa.VARCHAR(), nullable=False))
        batch_op.add_column(sa.Column('name', sa.VARCHAR(), nullable=False))
        batch_op.add_column(sa.Column('version', sa.VARCHAR(), nullable=False))
        batch_op.add_column(sa.Column('description', sa.TEXT(), nullable=True))
        batch_op.add_column(sa.Column('config_schema', sa.TEXT(), nullable=True))
        batch_op.add_column(sa.Column('author', sa.VARCHAR(), nullable=True))
        batch_op.drop_column('source_path')
        batch_op.drop_column('plugin_id')
