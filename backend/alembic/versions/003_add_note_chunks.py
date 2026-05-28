"""Add note_chunks table for multi-granularity embedding search.

Creates the note_chunks table with pgvector support and HNSW index.
Each note can be split into multiple chunks, each independently embedded.

Key design choices:
- HNSW index: same configuration as note_embeddings (m=16, ef_construction=128)
- chunk_index: ordinal position within the parent note (for ordering)
- FK to notes with CASCADE delete (clean up chunks when note is deleted)
- No UNIQUE constraint on (note_id, chunk_index) — allows duplicate indices
  if needed by the chunking algorithm (e.g., overlapping windows).

Revision ID: 003_add_note_chunks
Revises: 002_add_enabled_providers
Create Date: 2026-05-29
"""
from typing import Sequence, Union

from alembic import op
import pgvector.sqlalchemy  # noqa: F401
import sqlalchemy as sa


# revision identifiers
revision: str = "003_add_note_chunks"
down_revision: Union[str, None] = "002_add_enabled_providers"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create note_chunks table
    op.create_table(
        "note_chunks",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("note_id", sa.Integer(), nullable=False),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", pgvector.sqlalchemy.Vector(768), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["note_id"], ["notes.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    # 2. Index for FK lookups (delete chunks by note_id when regenerating)
    op.create_index(
        "idx_note_chunks_note_id",
        "note_chunks",
        ["note_id"],
    )

    # 3. HNSW index for vector similarity search (same config as note_embeddings)
    op.execute(
        "CREATE INDEX idx_note_chunks_embedding ON note_chunks "
        "USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 128)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_note_chunks_embedding")
    op.execute("DROP INDEX IF EXISTS idx_note_chunks_note_id")
    op.drop_table("note_chunks")
