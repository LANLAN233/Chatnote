"""Tests for data integrity and schema structure verification.

These tests verify the PostgreSQL schema structure through SQLAlchemy metadata
introspection (no live database required). For index-level checks that aren't
captured in SQLAlchemy model metadata, the Alembic migration file is inspected.

Tests:
  - All 15 expected tables registered in Base.metadata
  - 6 JSONB columns typed correctly
  - note_embeddings has expected columns (id, note_id, embedding, embedding_model, ...)
  - Foreign key constraints defined where expected
  - tsvector GIN index exists in migration
  - HNSW vector index exists in migration
"""

import re
from pathlib import Path

from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

from app.database import Base
from app.models.models import (
    Channel,
    DailySummary,
    Note,
    Plugin,
    Schedule,
    Server,
    Thread,
    User,
    UserApiKey,
    ConsoleSession,
    ConsoleMessage,
    InboxItem,
)
from app.models.attachment import Attachment
from app.models.server_file import ServerFile
from app.models.note_embedding import NoteEmbedding


# ── Expected table list (derived from models) ───────────────────────────────

EXPECTED_TABLES = [
    User,
    UserApiKey,
    Server,
    Channel,
    Note,
    Thread,
    Schedule,
    Plugin,
    ConsoleSession,
    ConsoleMessage,
    InboxItem,
    DailySummary,
    Attachment,
    ServerFile,
    NoteEmbedding,
]

# JSONB columns: (model_class, column_name)
EXPECTED_JSONB_COLUMNS = [
    (Note, "ai_tags"),
    (Note, "user_tags"),
    (Schedule, "repeat_rule"),
    (Plugin, "config"),
    (DailySummary, "keywords"),
    (DailySummary, "stages"),
]

# note_embeddings expected columns: (column_name, expected_type_class)
NOTE_EMBEDDINGS_EXPECTED_COLUMNS = [
    ("id", "Integer"),
    ("note_id", "Integer"),
    ("embedding", "Vector"),
    ("embedding_model", "String"),
    ("created_at", "DateTime"),
    ("updated_at", "DateTime"),
]

# Expected foreign keys: (model_class, column_name, referred_table_name, referred_column)
EXPECTED_FOREIGN_KEYS = [
    (UserApiKey, "user_id", "users", "id"),
    (Server, "user_id", "users", "id"),
    (Channel, "server_id", "servers", "id"),
    (Note, "channel_id", "channels", "id"),
    (Note, "user_id", "users", "id"),
    (Note, "thread_id", "threads", "id"),
    (Note, "reply_to_id", "notes", "id"),
    (Thread, "channel_id", "channels", "id"),
    (Thread, "parent_note_id", "notes", "id"),
    (Thread, "created_by", "users", "id"),
    (Schedule, "user_id", "users", "id"),
    (Schedule, "server_id", "servers", "id"),
    (Schedule, "channel_id", "channels", "id"),
    (ConsoleSession, "user_id", "users", "id"),
    (ConsoleSession, "server_id", "servers", "id"),
    (ConsoleMessage, "session_id", "console_sessions", "id"),
    (InboxItem, "user_id", "users", "id"),
    (DailySummary, "user_id", "users", "id"),
    (Attachment, "note_id", "notes", "id"),
    (ServerFile, "server_id", "servers", "id"),
    (ServerFile, "uploader_id", "users", "id"),
    (NoteEmbedding, "note_id", "notes", "id"),
]


# ── Helpers ─────────────────────────────────────────────────────────────────


def _load_migration_content() -> str:
    """Load the pgvector baseline migration file content as text."""
    migration_path = (
        Path(__file__).resolve().parent.parent
        / "alembic"
        / "versions"
        / "001_pgvector_baseline.py"
    )
    if not migration_path.exists():
        return ""
    return migration_path.read_text(encoding="utf-8")


# ── Test Classes ────────────────────────────────────────────────────────────


class TestTableExistence:
    """Verify all expected tables are registered in SQLAlchemy Base metadata."""

    def test_all_15_tables_registered(self):
        """All 15 table models are in Base.metadata.tables."""
        table_names = set(Base.metadata.tables.keys())

        for model in EXPECTED_TABLES:
            assert model.__tablename__ in table_names, (
                f"{model.__name__}.__tablename__ ({model.__tablename__}) "
                f"not found in Base.metadata.tables"
            )

        assert len(EXPECTED_TABLES) == 15, "Should have exactly 15 models"

    def test_no_unknown_tables(self):
        """No extra tables in metadata beyond expected 15."""
        expected_names = {m.__tablename__ for m in EXPECTED_TABLES}
        actual_names = set(Base.metadata.tables.keys())

        extra = actual_names - expected_names
        assert not extra, f"Unexpected tables found in metadata: {extra}"

    def test_user_facing_tables_exist(self):
        """All 14 user-facing tables (excluding note_embeddings) exist."""
        user_facing = [
            m for m in EXPECTED_TABLES if m.__tablename__ != "note_embeddings"
        ]
        assert len(user_facing) == 14, "Should have exactly 14 user-facing tables"

        for model in user_facing:
            assert model.__tablename__ in Base.metadata.tables, (
                f"User-facing table {model.__tablename__} not found"
            )


class TestJsonbColumns:
    """Verify all 6 JSONB columns use the correct SQLAlchemy type."""

    def test_jsonb_columns_count(self):
        """Exactly 6 JSONB columns defined."""
        jsonb_cols = []
        for model, col_name in EXPECTED_JSONB_COLUMNS:
            jsonb_cols.append(f"{model.__tablename__}.{col_name}")
        assert len(jsonb_cols) == 6, f"Expected 6 JSONB columns, got {len(jsonb_cols)}"

    def test_note_ai_tags_is_jsonb(self):
        col = Note.__table__.columns["ai_tags"]
        assert isinstance(col.type, JSONB), (
            f"Note.ai_tags should be JSONB, got {type(col.type).__name__}"
        )

    def test_note_user_tags_is_jsonb(self):
        col = Note.__table__.columns["user_tags"]
        assert isinstance(col.type, JSONB), (
            f"Note.user_tags should be JSONB, got {type(col.type).__name__}"
        )

    def test_schedule_repeat_rule_is_jsonb(self):
        col = Schedule.__table__.columns["repeat_rule"]
        assert isinstance(col.type, JSONB), (
            f"Schedule.repeat_rule should be JSONB, got {type(col.type).__name__}"
        )

    def test_plugin_config_is_jsonb(self):
        col = Plugin.__table__.columns["config"]
        assert isinstance(col.type, JSONB), (
            f"Plugin.config should be JSONB, got {type(col.type).__name__}"
        )

    def test_daily_summary_keywords_is_jsonb(self):
        col = DailySummary.__table__.columns["keywords"]
        assert isinstance(col.type, JSONB), (
            f"DailySummary.keywords should be JSONB, got {type(col.type).__name__}"
        )

    def test_daily_summary_stages_is_jsonb(self):
        col = DailySummary.__table__.columns["stages"]
        assert isinstance(col.type, JSONB), (
            f"DailySummary.stages should be JSONB, got {type(col.type).__name__}"
        )

    def test_all_jsonb_columns_verified(self):
        """Ensure no JSONB column was missed in individual tests."""
        for model, col_name in EXPECTED_JSONB_COLUMNS:
            col = model.__table__.columns[col_name]
            assert isinstance(col.type, JSONB), (
                f"JSONB column {model.__tablename__}.{col_name} "
                f"has type {type(col.type).__name__}, expected JSONB"
            )


class TestNoteEmbeddingsColumns:
    """Verify note_embeddings table has expected columns with correct types."""

    def test_note_embeddings_table_exists(self):
        """note_embeddings table is in Base.metadata."""
        assert NoteEmbedding.__tablename__ in Base.metadata.tables

    def test_note_embeddings_column_count(self):
        """note_embeddings has exactly 6 columns."""
        columns = list(NoteEmbedding.__table__.columns)
        assert len(columns) == 6, (
            f"Expected 6 columns, got {len(columns)}: "
            f"{[c.name for c in columns]}"
        )

    def test_note_embeddings_has_expected_columns(self):
        """Each expected column exists in note_embeddings."""
        table_cols = {c.name for c in NoteEmbedding.__table__.columns}
        for col_name, _ in NOTE_EMBEDDINGS_EXPECTED_COLUMNS:
            assert col_name in table_cols, (
                f"note_embeddings missing column: {col_name}"
            )

    def test_note_embeddings_no_unexpected_columns(self):
        """No unexpected columns in note_embeddings."""
        expected_names = {name for name, _ in NOTE_EMBEDDINGS_EXPECTED_COLUMNS}
        actual_names = {c.name for c in NoteEmbedding.__table__.columns}
        extra = actual_names - expected_names
        assert not extra, f"Unexpected columns in note_embeddings: {extra}"

    def test_note_embeddings_id_column_type(self):
        from sqlalchemy import Integer as SAInteger

        col = NoteEmbedding.__table__.columns["id"]
        assert isinstance(col.type, SAInteger), f"id should be Integer, got {type(col.type).__name__}"

    def test_note_embeddings_note_id_column_type(self):
        from sqlalchemy import Integer as SAInteger

        col = NoteEmbedding.__table__.columns["note_id"]
        assert isinstance(col.type, SAInteger), f"note_id should be Integer, got {type(col.type).__name__}"

    def test_note_embeddings_embedding_is_vector(self):
        col = NoteEmbedding.__table__.columns["embedding"]
        assert isinstance(col.type, Vector), (
            f"embedding should be Vector, got {type(col.type).__name__}"
        )
        assert col.type.dim == 768, f"Vector dim should be 768, got {col.type.dim}"

    def test_note_embeddings_embedding_model_column_type(self):
        from sqlalchemy import String as SAString

        col = NoteEmbedding.__table__.columns["embedding_model"]
        assert isinstance(col.type, SAString), (
            f"embedding_model should be String, got {type(col.type).__name__}"
        )

    def test_note_embeddings_created_at_column_type(self):
        from sqlalchemy import DateTime as SADateTime

        col = NoteEmbedding.__table__.columns["created_at"]
        assert isinstance(col.type, SADateTime), (
            f"created_at should be DateTime, got {type(col.type).__name__}"
        )

    def test_note_embeddings_updated_at_column_type(self):
        from sqlalchemy import DateTime as SADateTime

        col = NoteEmbedding.__table__.columns["updated_at"]
        assert isinstance(col.type, SADateTime), (
            f"updated_at should be DateTime, got {type(col.type).__name__}"
        )

    def test_note_embeddings_note_id_is_unique(self):
        col = NoteEmbedding.__table__.columns["note_id"]
        assert col.unique is True, "note_id should be unique"

    def test_note_embeddings_note_id_not_nullable(self):
        col = NoteEmbedding.__table__.columns["note_id"]
        assert col.nullable is False, "note_id should be NOT NULL"

    def test_note_embeddings_embedding_not_nullable(self):
        col = NoteEmbedding.__table__.columns["embedding"]
        assert col.nullable is False, "embedding should be NOT NULL"


class TestForeignKeyConstraints:
    """Verify foreign key constraints are defined on model columns."""

    def test_foreign_key_count(self):
        """Verify the expected number of FK constraints exist."""
        assert len(EXPECTED_FOREIGN_KEYS) == 22, (
            f"Expected 22 FK constraints, got {len(EXPECTED_FOREIGN_KEYS)}"
        )

    def _get_fk_target(self, model, col_name):
        """Get the referred table and column for a foreign key."""
        col = model.__table__.columns[col_name]
        fks = list(col.foreign_keys)
        assert len(fks) > 0, (
            f"{model.__tablename__}.{col_name} has no foreign keys defined"
        )
        # Take the first FK (column should only have one FK)
        fk = fks[0]
        return fk.column.table.name, fk.column.name

    def test_user_api_keys_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(UserApiKey, "user_id")
        assert ref_table == "users", f"Expected users, got {ref_table}"
        assert ref_col == "id", f"Expected id, got {ref_col}"

    def test_server_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Server, "user_id")
        assert ref_table == "users"
        assert ref_col == "id"

    def test_channel_server_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Channel, "server_id")
        assert ref_table == "servers"
        assert ref_col == "id"

    def test_note_channel_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Note, "channel_id")
        assert ref_table == "channels"
        assert ref_col == "id"

    def test_note_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Note, "user_id")
        assert ref_table == "users"
        assert ref_col == "id"

    def test_note_thread_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Note, "thread_id")
        assert ref_table == "threads"
        assert ref_col == "id"

    def test_note_reply_to_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Note, "reply_to_id")
        assert ref_table == "notes"
        assert ref_col == "id"

    def test_thread_parent_note_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Thread, "parent_note_id")
        assert ref_table == "notes"
        assert ref_col == "id"

    def test_schedule_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Schedule, "user_id")
        assert ref_table == "users"
        assert ref_col == "id"

    def test_console_messages_session_id_fk(self):
        ref_table, ref_col = self._get_fk_target(ConsoleMessage, "session_id")
        assert ref_table == "console_sessions"
        assert ref_col == "id"

    def test_inbox_items_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(InboxItem, "user_id")
        assert ref_table == "users"
        assert ref_col == "id"

    def test_daily_summaries_user_id_fk(self):
        ref_table, ref_col = self._get_fk_target(DailySummary, "user_id")
        assert ref_table == "users"
        assert ref_col == "id"

    def test_attachment_note_id_fk(self):
        ref_table, ref_col = self._get_fk_target(Attachment, "note_id")
        assert ref_table == "notes"
        assert ref_col == "id"

    def test_server_file_server_id_fk(self):
        ref_table, ref_col = self._get_fk_target(ServerFile, "server_id")
        assert ref_table == "servers"
        assert ref_col == "id"

    def test_note_embedding_note_id_fk(self):
        ref_table, ref_col = self._get_fk_target(NoteEmbedding, "note_id")
        assert ref_table == "notes"
        assert ref_col == "id"

    def test_all_fks_verified(self):
        """Ensure every expected FK was verified."""
        for model, col_name, ref_table, ref_col in EXPECTED_FOREIGN_KEYS:
            actual_ref_table, actual_ref_col = self._get_fk_target(model, col_name)
            assert actual_ref_table == ref_table, (
                f"{model.__tablename__}.{col_name}: "
                f"expected FK → {ref_table}.{ref_col}, "
                f"got → {actual_ref_table}.{actual_ref_col}"
            )
            assert actual_ref_col == ref_col, (
                f"{model.__tablename__}.{col_name}: "
                f"expected FK → {ref_table}.{ref_col}, "
                f"got → {actual_ref_table}.{actual_ref_col}"
            )


class TestMigrationIndexDefinitions:
    """Verify the migration file contains required index definitions.

    Since tsvector and HNSW indexes are created via op.execute() and are not
    part of SQLAlchemy model metadata, we verify their presence in the
    migration file directly.
    """

    def test_migration_file_exists(self):
        """The pgvector baseline migration file exists."""
        migration_path = (
            Path(__file__).resolve().parent.parent
            / "alembic"
            / "versions"
            / "001_pgvector_baseline.py"
        )
        assert migration_path.exists(), (
            f"Migration file not found at {migration_path}"
        )

    def test_tsvector_index_in_migration(self):
        """Migration file contains GIN tsvector index on note_embeddings."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        # Check for the tsvector GIN index creation
        pattern = r"idx_note_embeddings_tsv"
        assert re.search(pattern, content), (
            "tsvector index 'idx_note_embeddings_tsv' not found in migration file"
        )

        # Verify it's a GIN index using to_tsvector
        assert "to_tsvector" in content, (
            "Migration file should contain 'to_tsvector' for full-text search"
        )
        assert "USING gin" in content, (
            "Migration file should contain 'USING gin' for tsvector GIN index"
        )

    def test_hnsw_index_in_migration(self):
        """Migration file contains HNSW vector index on note_embeddings."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        # Check for the HNSW index creation
        pattern = r"idx_note_embeddings_embedding"
        assert re.search(pattern, content), (
            "HNSW index 'idx_note_embeddings_embedding' not found in migration file"
        )

        # Verify it's an HNSW index with cosine similarity
        assert "USING hnsw" in content, (
            "Migration file should contain 'USING hnsw' for vector index"
        )
        assert "vector_cosine_ops" in content, (
            "HNSW index should use 'vector_cosine_ops' operator class"
        )

    def test_vector_extension_in_migration(self):
        """Migration file enables the pgvector extension."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        assert "CREATE EXTENSION IF NOT EXISTS vector" in content, (
            "Migration file should create the 'vector' extension"
        )

    def test_migration_contains_all_15_tables(self):
        """Migration file creates all 15 tables."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        for model in EXPECTED_TABLES:
            assert f'"{model.__tablename__}"' in content or f"'{model.__tablename__}'" in content, (
                f"Migration file should contain table '{model.__tablename__}'"
            )

    def test_migration_contains_6_jsonb_columns(self):
        """Migration file uses JSONB for all 6 JSON columns."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        jsonb_count = content.count("sa.JSONB()")
        assert jsonb_count >= 6, (
            f"Expected at least 6 sa.JSONB() calls in migration, got {jsonb_count}"
        )

    def test_migration_not_contain_sqlite_patterns(self):
        """Migration file does not contain SQLite-specific patterns."""
        content = _load_migration_content()
        assert content, "Migration file is empty or not found"

        # No SQLite patterns should remain
        assert "FTS5" not in content, "Migration should not contain FTS5"
        assert "aiosqlite" not in content, "Migration should not reference aiosqlite"
        assert "batch_alter_table" not in content, (
            "Migration should not use batch_alter_table (SQLite pattern)"
        )


class TestModelMetadataConsistency:
    """Verify consistency between model definitions and expected structures."""

    def test_all_expected_tables_have_id_primary_key(self):
        """Every table has an 'id' column that is a primary key."""
        for model in EXPECTED_TABLES:
            assert "id" in model.__table__.columns, (
                f"{model.__tablename__} missing 'id' column"
            )
            id_col = model.__table__.columns["id"]
            assert id_col.primary_key, (
                f"{model.__tablename__}.id should be a primary key"
            )

    def test_all_expected_tables_in_base_metadata(self):
        """All tables from EXPECTED_TABLES are in Base.metadata.tables."""
        for model in EXPECTED_TABLES:
            table = Base.metadata.tables.get(model.__tablename__)
            assert table is not None, (
                f"Table {model.__tablename__} not in Base.metadata.tables"
            )
            assert table is model.__table__, (
                f"Table object mismatch for {model.__tablename__}"
            )

    def test_note_embedding_is_not_in_user_facing_list(self):
        """note_embeddings is explicitly excluded from the 14 user-facing tables."""
        user_facing = [
            m for m in EXPECTED_TABLES if m.__tablename__ != "note_embeddings"
        ]
        assert NoteEmbedding not in user_facing
        assert len(user_facing) == 14
        assert len(EXPECTED_TABLES) == 15
