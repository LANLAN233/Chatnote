from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Note, Server
from app.services.note_service import fetch_notes_for_context


@pytest.mark.asyncio
async def test_fetch_notes_empty(db_session: AsyncSession):
    """Returns empty list when server has no notes."""
    server = Server(user_id=1, name="EmptyServer")
    db_session.add(server)
    await db_session.flush()

    result = await fetch_notes_for_context(db_session, user_id=1, server_id=server.id)
    assert result == []


@pytest.mark.asyncio
async def test_fetch_notes_basic(db_session: AsyncSession):
    """Returns formatted strings for all notes in the server."""
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="general")
    db_session.add(channel)
    await db_session.flush()

    # Create 5 notes
    for i in range(5):
        note = Note(channel_id=channel.id, user_id=1, content=f"Note number {i}")
        db_session.add(note)
    await db_session.flush()

    result = await fetch_notes_for_context(db_session, user_id=1, server_id=server.id)
    assert len(result) == 5
    # Verify format: "[channel_name] content"
    for item in result:
        assert item.startswith("[general] ")
        assert "Note number" in item


@pytest.mark.asyncio
async def test_fetch_notes_respects_limit(db_session: AsyncSession):
    """Returns at most `limit` notes even when more exist."""
    server = Server(user_id=1, name="BusyServer")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="spam")
    db_session.add(channel)
    await db_session.flush()

    # Create 30 notes
    for i in range(30):
        note = Note(channel_id=channel.id, user_id=1, content=f"Spam note {i:02d}")
        db_session.add(note)
    await db_session.flush()

    result = await fetch_notes_for_context(db_session, user_id=1, server_id=server.id)
    assert len(result) == 20  # Default limit is 20
    # All items follow expected format
    for item in result:
        assert item.startswith("[spam] ")
        assert "Spam note" in item


@pytest.mark.asyncio
async def test_fetch_notes_channel_filter(db_session: AsyncSession):
    """Filters by channel_id when provided."""
    server = Server(user_id=1, name="FilterServer")
    db_session.add(server)
    await db_session.flush()

    ch_a = Channel(server_id=server.id, name="alpha")
    db_session.add(ch_a)
    await db_session.flush()
    ch_b = Channel(server_id=server.id, name="beta")
    db_session.add(ch_b)
    await db_session.flush()

    # Notes in channel alpha
    for i in range(3):
        note = Note(channel_id=ch_a.id, user_id=1, content=f"Alpha note {i}")
        db_session.add(note)
    # Notes in channel beta
    for i in range(2):
        note = Note(channel_id=ch_b.id, user_id=1, content=f"Beta note {i}")
        db_session.add(note)
    await db_session.flush()

    # Fetch only alpha notes
    result = await fetch_notes_for_context(
        db_session, user_id=1, server_id=server.id, channel_id=ch_a.id
    )
    assert len(result) == 3
    for item in result:
        assert "[alpha]" in item
        assert "Alpha note" in item

    # Fetch only beta notes
    result_beta = await fetch_notes_for_context(
        db_session, user_id=1, server_id=server.id, channel_id=ch_b.id
    )
    assert len(result_beta) == 2
    for item in result_beta:
        assert "[beta]" in item
        assert "Beta note" in item


@pytest.mark.asyncio
async def test_fetch_notes_truncates_long_content(db_session: AsyncSession):
    """Truncates note content to 200 chars, appending '...' if longer."""
    server = Server(user_id=1, name="TruncateServer")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="long-channel")
    db_session.add(channel)
    await db_session.flush()

    # Note with 250 chars
    long_content = "X" * 250
    note = Note(channel_id=channel.id, user_id=1, content=long_content)
    db_session.add(note)
    await db_session.flush()

    result = await fetch_notes_for_context(db_session, user_id=1, server_id=server.id)
    assert len(result) == 1
    formatted = result[0]
    assert formatted.startswith("[long-channel] ")
    # Content should be truncated to 200 chars + "..."
    assert formatted.endswith("...")
    # Total length: "[long-channel] " (15) + 200 chars of X + "..." (3) = 218
    assert len(formatted) == 15 + 200 + 3
