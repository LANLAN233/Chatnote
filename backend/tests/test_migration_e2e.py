"""End-to-end migration verification tests.

Verifies the migration script structure, logic, and the complete data flow
between components — without requiring a PostgreSQL instance.

Note: The one-time SQLite→PostgreSQL migration scripts have been archived to
_archive/migration-scripts/. These tests validate the archived scripts.
"""
import importlib.util
import os
import sys
from pathlib import Path

import pytest


# ── Path Helpers ─────────────────────────────────────────────────────────────

BACKEND_DIR = Path(__file__).resolve().parent.parent
ARCHIVE_DIR = BACKEND_DIR.parent / "_archive" / "migration-scripts"
MIGRATION_SCRIPT = ARCHIVE_DIR / "migrate_sqlite_to_pg.py"
VERIFY_SCRIPT = ARCHIVE_DIR / "verify_migration.py"
BACKFILL_SCRIPT = BACKEND_DIR / "app" / "scripts" / "backfill_embeddings.py"

# Skip all migration tests if the scripts were archived/removed
pytestmark = pytest.mark.skipif(
    not MIGRATION_SCRIPT.exists(),
    reason="Migration scripts archived to _archive/migration-scripts/",
)


# ── Script Existence Tests ───────────────────────────────────────────────────


class TestMigrationScriptExistence:
    """Verify migration-related script files exist on disk."""

    def test_migration_script_exists(self):
        """Migration script file should exist at expected path."""
        assert MIGRATION_SCRIPT.exists(), (
            f"Migration script not found at {MIGRATION_SCRIPT}"
        )

    def test_verify_script_exists(self):
        """Verification script should exist at expected path."""
        assert VERIFY_SCRIPT.exists(), (
            f"Verification script not found at {VERIFY_SCRIPT}"
        )

    def test_backfill_script_exists(self):
        """Backfill script should exist at expected path."""
        assert BACKFILL_SCRIPT.exists(), (
            f"Backfill script not found at {BACKFILL_SCRIPT}"
        )

    def test_migration_script_is_python(self):
        """Migration script should be a .py file."""
        assert MIGRATION_SCRIPT.suffix == ".py"

    def test_migration_script_readable(self):
        """Migration script should be readable."""
        assert os.access(str(MIGRATION_SCRIPT), os.R_OK), (
            f"Migration script not readable: {MIGRATION_SCRIPT}"
        )


# ── Script Structure Tests ───────────────────────────────────────────────────


class TestMigrationScriptStructure:
    """Verify migration script import structure and key components."""

    def test_migration_spec_loads_without_error(self):
        """Migration script import spec should load without executing."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        assert spec is not None, (
            f"Could not create module spec for {MIGRATION_SCRIPT}"
        )
        mod = importlib.util.module_from_spec(spec)
        assert mod is not None

    def test_migration_script_has_main_function(self):
        """Migration script should define a main() function."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "main"), (
            "Migration script missing main() function"
        )
        assert callable(mod.main)

    def test_migration_script_has_run_migration(self):
        """Migration script should define a run_migration() async function."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "run_migration"), (
            "Migration script missing run_migration() function"
        )

    def test_migration_script_has_dry_run(self):
        """Migration script should define a dry_run() async function."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "dry_run"), (
            "Migration script missing dry_run() function"
        )

    def test_migration_script_has_verify(self):
        """Migration script should define a verify() async function."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "verify"), (
            "Migration script missing verify() function"
        )

    def test_migration_order_is_defined(self):
        """Migration script should define MIGRATION_ORDER list."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "MIGRATION_ORDER"), (
            "Migration script missing MIGRATION_ORDER"
        )
        assert isinstance(mod.MIGRATION_ORDER, list)
        assert len(mod.MIGRATION_ORDER) > 0

    def test_migration_order_includes_note_embeddings(self):
        """MIGRATION_ORDER should include note_embeddings table."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert "note_embeddings" in mod.MIGRATION_ORDER, (
            "MIGRATION_ORDER missing note_embeddings table — pgvector table"
        )

    def test_auto_increment_tables_includes_note_embeddings(self):
        """AUTOINCREMENT_TABLES should include note_embeddings for sequence reset."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert "note_embeddings" in mod.AUTOINCREMENT_TABLES, (
            "AUTOINCREMENT_TABLES missing note_embeddings"
        )

    def test_batch_size_is_100(self):
        """Migration BATCH_SIZE should be 100 for performance."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.BATCH_SIZE == 100

    def test_migration_has_fix_note_fks(self):
        """Migration script should have _fix_note_fks for circular FK handling."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "_fix_note_fks"), (
            "Migration script missing _fix_note_fks — circular FK resolution"
        )

    def test_migration_has_reset_sequences(self):
        """Migration script should have reset_sequences for auto-increment IDs."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "reset_sequences"), (
            "Migration script missing reset_sequences"
        )


# ── Data Flow Integration Tests ──────────────────────────────────────────────


class TestDataFlowIntegration:
    """Verify the complete data flow — services, schemas, models are connected."""

    def test_all_search_services_importable(self):
        """Search, embedding, and note services should all be importable."""
        from app.services.search import hybrid_search, vector_search, fulltext_search
        from app.services.embedding import EmbeddingService
        from app.services.note_service import fetch_notes_semantic

        assert hybrid_search is not None
        assert vector_search is not None
        assert fulltext_search is not None
        assert EmbeddingService is not None
        assert fetch_notes_semantic is not None

    def test_note_embedding_model_importable(self):
        """NoteEmbedding model should be importable with Vector column."""
        from app.models.note_embedding import NoteEmbedding

        assert NoteEmbedding is not None
        assert NoteEmbedding.__tablename__ == "note_embeddings"
        assert hasattr(NoteEmbedding, "note_id")
        assert hasattr(NoteEmbedding, "embedding")
        assert hasattr(NoteEmbedding, "embedding_model")

    def test_search_schema_importable(self):
        """NoteSearchResult schema should be importable."""
        from app.schemas.schemas import NoteSearchResult

        assert NoteSearchResult is not None

    def test_search_schema_has_source_field(self):
        """NoteSearchResult must have 'source' field for migration compatibility."""
        from app.schemas.schemas import NoteSearchResult

        fields = NoteSearchResult.model_fields
        assert "source" in fields, (
            "NoteSearchResult missing 'source' field — required for hybrid search tagging"
        )
        assert fields["source"].annotation is str


class TestSchemaConsistency:
    """Verify schema consistency across the search pipeline."""

    def test_note_search_result_matches_search_output(self):
        """NoteSearchResult schema fields must cover search output keys."""
        from app.schemas.schemas import NoteSearchResult

        schema_fields = set(NoteSearchResult.model_fields.keys())
        search_output_keys = {"note_id", "content", "score", "source"}
        missing = search_output_keys - schema_fields
        assert not missing, (
            f"Search output keys not in schema: {missing}"
        )

    def test_note_embedding_table_matches_backfill(self):
        """NoteEmbedding table name matches what backfill/migration expects."""
        from app.models.note_embedding import NoteEmbedding

        assert NoteEmbedding.__tablename__ == "note_embeddings", (
            f"Expected table name 'note_embeddings', got '{NoteEmbedding.__tablename__}'"
        )

    def test_embedding_dimension_consistent(self):
        """Embedding dimension (768) matches pgvector column and OpenAI model."""
        from app.services.embedding import EmbeddingService
        from app.models.note_embedding import NoteEmbedding

        # EmbeddingService uses 768
        assert EmbeddingService._dimensions == 768

        # NoteEmbedding Vector column should be Vector(768)
        from pgvector.sqlalchemy import Vector
        emb_col = NoteEmbedding.__table__.columns["embedding"]
        assert emb_col.type.dim == 768, (
            f"NoteEmbedding.embedding Vector dimension mismatch: "
            f"expected 768, got {emb_col.type.dim}"
        )


# ── Migration Data Integrity Tests ────────────────────────────────────────────


class TestMigrationTypeConversions:
    """Verify migration type conversion helpers exist and work correctly."""

    def test_parse_jsonb_available(self):
        """parse_jsonb function should be available in migration script."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "parse_jsonb")
        assert callable(mod.parse_jsonb)

    def test_convert_bool_available(self):
        """convert_bool function should be available in migration script."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "convert_bool")
        assert callable(mod.convert_bool)

    def test_parse_sqlite_datetime_available(self):
        """parse_sqlite_datetime function should be available."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert hasattr(mod, "parse_sqlite_datetime")

    def test_convert_bool_0_is_false(self):
        """convert_bool(0) should return False."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.convert_bool(0) is False

    def test_convert_bool_1_is_true(self):
        """convert_bool(1) should return True."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.convert_bool(1) is True

    def test_convert_bool_none_is_none(self):
        """convert_bool(None) should return None."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.convert_bool(None) is None

    def test_parse_jsonb_none_is_none(self):
        """parse_jsonb(None) should return None."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.parse_jsonb(None) is None

    def test_parse_jsonb_empty_string_is_none(self):
        """parse_jsonb('') should return None."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert mod.parse_jsonb("") is None

    def test_parse_jsonb_valid_json(self):
        """parse_jsonb should parse valid JSON string."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        result = mod.parse_jsonb('["tag1", "tag2"]')
        assert result == ["tag1", "tag2"]


class TestMigrationConstants:
    """Verify migration constants are complete and consistent."""

    def test_jsonb_columns_include_note_fields(self):
        """JSONB_COLUMNS should include notes table fields."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert "notes" in mod.JSONB_COLUMNS
        assert "ai_tags" in mod.JSONB_COLUMNS["notes"]
        assert "user_tags" in mod.JSONB_COLUMNS["notes"]

    def test_boolean_columns_include_notes_fields(self):
        """BOOLEAN_COLUMNS should include notes table boolean fields."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        assert "notes" in mod.BOOLEAN_COLUMNS
        assert "is_pinned" in mod.BOOLEAN_COLUMNS["notes"]
        assert "is_edited" in mod.BOOLEAN_COLUMNS["notes"]

    def test_pg_dsn_is_configured(self):
        """PG_DSN should be set to a valid PostgreSQL connection string."""
        spec = importlib.util.spec_from_file_location(
            "migrate_sqlite_to_pg",
            str(MIGRATION_SCRIPT),
        )
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)

        dsn = mod.PG_DSN
        assert dsn.startswith("postgresql://"), (
            f"PG_DSN should start with 'postgresql://', got: {dsn}"
        )
