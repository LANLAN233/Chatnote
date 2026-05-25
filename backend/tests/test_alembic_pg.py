"""Tests for PostgreSQL Alembic baseline migration."""

import importlib.util
import os

import pytest

# Use file-based import since alembic/versions isn't on the Python path
MIGRATION_PATH = os.path.join(
    os.path.dirname(__file__), "..", "alembic", "versions", "001_pgvector_baseline.py"
)

EXPECTED_TABLES = {
    "users",
    "plugins",
    "user_api_keys",
    "servers",
    "channels",
    "notes",
    "threads",
    "schedules",
    "console_sessions",
    "console_messages",
    "inbox_items",
    "daily_summaries",
    "attachments",
    "server_files",
    "note_embeddings",
}


@pytest.fixture(scope="module")
def migration():
    """Load the baseline migration module from file path."""
    spec = importlib.util.spec_from_file_location(
        "baseline_migration", MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class TestMigrationMetadata:
    """Verify migration revision identifiers."""

    def test_revision_id(self, migration):
        """Migration has correct revision ID."""
        assert migration.revision == "001_pgvector_baseline"

    def test_down_revision_is_none(self, migration):
        """Migration is the root (down_revision = None)."""
        assert migration.down_revision is None

    def test_branch_labels_is_none(self, migration):
        """No branch labels."""
        assert migration.branch_labels is None

    def test_depends_on_is_none(self, migration):
        """No dependencies on other migrations."""
        assert migration.depends_on is None

    def test_has_upgrade_function(self, migration):
        """Migration has an upgrade function."""
        assert hasattr(migration, "upgrade")
        assert callable(migration.upgrade)

    def test_has_downgrade_function(self, migration):
        """Migration has a downgrade function."""
        assert hasattr(migration, "downgrade")
        assert callable(migration.downgrade)


class TestTableCoverage:
    """Verify all 15 tables are referenced in the migration."""

    def test_all_tables_in_upgrade(self, migration):
        """upgrade() source code references all expected table names."""
        source = _get_upgrade_source(migration)
        for table in EXPECTED_TABLES:
            assert table in source, f"Table '{table}' not found in upgrade() body"

    def test_all_tables_in_downgrade(self, migration):
        """downgrade() source code references all expected table names."""
        source = _get_downgrade_source(migration)
        for table in EXPECTED_TABLES:
            assert table in source, f"Table '{table}' not found in downgrade() body"

    def test_exact_table_count_in_upgrade(self, migration):
        """upgrade() creates exactly 15 tables."""
        source = _get_upgrade_source(migration)
        count = source.count("op.create_table(")
        assert count == 15, f"Expected 15 create_table calls, found {count}"

    def test_exact_table_count_in_downgrade(self, migration):
        """downgrade() drops exactly 15 tables."""
        source = _get_downgrade_source(migration)
        count = source.count("op.drop_table(")
        assert count == 15, f"Expected 15 drop_table calls, found {count}"


class TestPgvectorFeatures:
    """Verify pgvector-specific features."""

    def test_create_extension_vector(self, migration):
        """upgrade() creates the vector extension."""
        source = _get_upgrade_source(migration)
        assert "CREATE EXTENSION IF NOT EXISTS vector" in source

    def test_hnsw_index(self, migration):
        """upgrade() creates HNSW index for vector similarity."""
        source = _get_upgrade_source(migration)
        assert "idx_note_embeddings_embedding" in source
        assert "USING hnsw" in source

    def test_tsv_gin_index(self, migration):
        """upgrade() creates GIN tsvector index for full-text search."""
        source = _get_upgrade_source(migration)
        assert "idx_note_embeddings_tsv" in source
        assert "to_tsvector" in source

    def test_vector_column_type(self, migration):
        """note_embeddings has a pgvector Vector column."""
        source = _get_upgrade_source(migration)
        assert "pgvector.sqlalchemy.Vector(768)" in source


class TestJsonbColumns:
    """Verify JSONB columns are used where specified."""

    def test_ai_tags_jsonb(self, migration):
        """Note.ai_tags uses JSONB."""
        source = _get_upgrade_source(migration)
        assert 'sa.JSONB()' in source

    def test_no_sqlite_patterns(self, migration):
        """No SQLite-specific patterns remain."""
        source = _get_upgrade_source(migration)
        assert "CURRENT_TIMESTAMP" not in source
        assert "render_as_batch" not in source
        assert "batch_alter_table" not in source
        assert "FTS5" not in source


def _get_upgrade_source(migration) -> str:
    """Extract the source code of the upgrade() function."""
    import inspect

    return inspect.getsource(migration.upgrade)


def _get_downgrade_source(migration) -> str:
    """Extract the source code of the downgrade() function."""
    import inspect

    return inspect.getsource(migration.downgrade)
