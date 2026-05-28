"""Note chunk model for multi-granularity embedding search.

Each Note can have multiple chunks, each with its own embedding vector.
Chunk-level search provides higher precision for long notes by matching
at the paragraph level instead of the whole-document level.

Pattern: ParentDocumentRetriever — search on chunks (high precision),
           retrieve full parent note content (high completeness).
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from pgvector.sqlalchemy import Vector

from app.database import Base


class NoteChunk(Base):
    __tablename__ = "note_chunks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    note_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(768), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now()
    )

    # relationship
    note: Mapped["Note"] = relationship("Note", back_populates="chunks")
