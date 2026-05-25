"""Tests for PostgreSQL model layer - JSONB types, NoteEmbedding, model metadata."""

from sqlalchemy.dialects.postgresql import JSONB
from pgvector.sqlalchemy import Vector

from app.database import Base


class TestNoteEmbeddingModel:
    """Verify NoteEmbedding model definition."""

    def test_note_embedding_imports(self):
        """NoteEmbedding can be imported."""
        from app.models.note_embedding import NoteEmbedding

        assert NoteEmbedding is not None

    def test_note_embedding_tablename(self):
        """NoteEmbedding table name is 'note_embeddings'."""
        from app.models.note_embedding import NoteEmbedding

        assert NoteEmbedding.__tablename__ == "note_embeddings"

    def test_note_embedding_in_base_registry(self):
        """NoteEmbedding is registered in Base metadata."""
        from app.models.note_embedding import NoteEmbedding

        assert NoteEmbedding.__tablename__ in Base.metadata.tables

    def test_note_embedding_has_vector_column(self):
        """NoteEmbedding has a Vector(768) embedding column."""
        from app.models.note_embedding import NoteEmbedding

        embedding_col = NoteEmbedding.__table__.columns["embedding"]
        assert isinstance(embedding_col.type, Vector)
        assert embedding_col.type.dim == 768

    def test_note_embedding_note_id_unique(self):
        """note_id column is unique (one embedding per note)."""
        from app.models.note_embedding import NoteEmbedding

        note_id_col = NoteEmbedding.__table__.columns["note_id"]
        assert note_id_col.unique is True

    def test_note_embedding_has_note_relationship(self):
        """NoteEmbedding has a relationship back to Note."""
        from app.models.note_embedding import NoteEmbedding

        assert hasattr(NoteEmbedding, "note")
        assert NoteEmbedding.__mapper__.relationships["note"] is not None


class TestNoteJsonbColumns:
    """Verify Note model uses JSONB for JSON-as-text columns."""

    def test_note_ai_tags_is_jsonb(self):
        """Note.ai_tags uses JSONB, not Text."""
        from app.models.models import Note

        col = Note.__table__.columns["ai_tags"]
        assert isinstance(col.type, JSONB)

    def test_note_user_tags_is_jsonb(self):
        """Note.user_tags uses JSONB, not Text."""
        from app.models.models import Note

        col = Note.__table__.columns["user_tags"]
        assert isinstance(col.type, JSONB)

    def test_note_has_embedding_record_relationship(self):
        """Note has embedding_record relationship."""
        from app.models.models import Note

        assert hasattr(Note, "embedding_record")
        rel = Note.__mapper__.relationships["embedding_record"]
        assert rel.uselist is False  # one-to-one


class TestOtherJsonbColumns:
    """Verify other models using JSONB columns."""

    def test_schedule_repeat_rule_is_jsonb(self):
        """Schedule.repeat_rule uses JSONB."""
        from app.models.models import Schedule

        col = Schedule.__table__.columns["repeat_rule"]
        assert isinstance(col.type, JSONB)

    def test_plugin_config_is_jsonb(self):
        """Plugin.config uses JSONB."""
        from app.models.models import Plugin

        col = Plugin.__table__.columns["config"]
        assert isinstance(col.type, JSONB)

    def test_daily_summary_keywords_is_jsonb(self):
        """DailySummary.keywords uses JSONB."""
        from app.models.models import DailySummary

        col = DailySummary.__table__.columns["keywords"]
        assert isinstance(col.type, JSONB)

    def test_daily_summary_stages_is_jsonb(self):
        """DailySummary.stages uses JSONB."""
        from app.models.models import DailySummary

        col = DailySummary.__table__.columns["stages"]
        assert isinstance(col.type, JSONB)


class TestLegacyModelsIntact:
    """Verify all legacy models still import and have correct table names."""

    def test_user_model(self):
        from app.models.models import User

        assert User.__tablename__ == "users"

    def test_server_model(self):
        from app.models.models import Server

        assert Server.__tablename__ == "servers"

    def test_channel_model(self):
        from app.models.models import Channel

        assert Channel.__tablename__ == "channels"

    def test_note_model(self):
        from app.models.models import Note

        assert Note.__tablename__ == "notes"

    def test_thread_model(self):
        from app.models.models import Thread

        assert Thread.__tablename__ == "threads"

    def test_schedule_model(self):
        from app.models.models import Schedule

        assert Schedule.__tablename__ == "schedules"

    def test_plugin_model(self):
        from app.models.models import Plugin

        assert Plugin.__tablename__ == "plugins"

    def test_console_session_model(self):
        from app.models.models import ConsoleSession

        assert ConsoleSession.__tablename__ == "console_sessions"

    def test_console_message_model(self):
        from app.models.models import ConsoleMessage

        assert ConsoleMessage.__tablename__ == "console_messages"

    def test_inbox_item_model(self):
        from app.models.models import InboxItem

        assert InboxItem.__tablename__ == "inbox_items"

    def test_daily_summary_model(self):
        from app.models.models import DailySummary

        assert DailySummary.__tablename__ == "daily_summaries"

    def test_attachment_model(self):
        from app.models.attachment import Attachment

        assert Attachment.__tablename__ == "attachments"

    def test_server_file_model(self):
        from app.models.server_file import ServerFile

        assert ServerFile.__tablename__ == "server_files"

    def test_note_embedding_in_all(self):
        """NoteEmbedding is exported from __init__.py."""
        from app.models import NoteEmbedding

        assert NoteEmbedding is not None
