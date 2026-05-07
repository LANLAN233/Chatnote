"""Tests for agno-compatible tool factory functions."""
from __future__ import annotations

import json

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import (
    get_stats_tool,
    get_today_schedules_tool,
    make_get_stats_tool,
    make_get_today_schedules_tool,
    make_search_notes_tool,
    search_notes_tool,
)
from app.models.models import Channel, Note, Server


# ──────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────


async def _seed_test_data(db: AsyncSession, user_id: int = 1) -> None:
    """Create a server, channel, and a few notes for testing."""
    server = Server(user_id=user_id, name="TestServer")
    db.add(server)
    await db.flush()

    channel = Channel(server_id=server.id, name="general")
    db.add(channel)
    await db.flush()

    note1 = Note(
        channel_id=channel.id,
        user_id=user_id,
        content="Hello world this is a test note",
        content_type="markdown",
    )
    note2 = Note(
        channel_id=channel.id,
        user_id=user_id,
        content="Another note about Python programming",
        content_type="markdown",
    )
    note3 = Note(
        channel_id=channel.id,
        user_id=user_id,
        content="Unrelated content for search testing",
        content_type="markdown",
    )
    db.add_all([note1, note2, note3])
    await db.flush()


# ──────────────────────────────────────────────────────────────
# Test 1: Factory returns callable with correct signature
# ──────────────────────────────────────────────────────────────


class TestFactoryReturnsCallable:
    """Verify each factory returns a callable with expected attributes."""

    @pytest.mark.asyncio
    async def test_make_search_notes_returns_callable(self, db_session: AsyncSession):
        tool = make_search_notes_tool(db_session, 1)
        assert callable(tool)
        assert tool.__name__ == "search_notes"
        assert "Search all user notes" in (tool.__doc__ or "")

    @pytest.mark.asyncio
    async def test_make_get_stats_returns_callable(self, db_session: AsyncSession):
        tool = make_get_stats_tool(db_session, 1)
        assert callable(tool)
        assert tool.__name__ == "get_stats"
        assert "statistics" in (tool.__doc__ or "")

    @pytest.mark.asyncio
    async def test_make_get_today_schedules_returns_callable(self, db_session: AsyncSession):
        tool = make_get_today_schedules_tool(db_session, 1)
        assert callable(tool)
        assert tool.__name__ == "get_today_schedules"
        assert "schedules" in (tool.__doc__ or "")


# ──────────────────────────────────────────────────────────────
# Test 2: Factory callable works with real test DB
# ──────────────────────────────────────────────────────────────


class TestFactoryCallableWorks:
    """Verify factory-produced tools work correctly with real async DB."""

    @pytest.mark.asyncio
    async def test_search_notes_finds_results(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)

        search_fn = make_search_notes_tool(db_session, 1)
        result = await search_fn("Python")
        data = json.loads(result)

        assert data["found"] == 1
        assert len(data["results"]) == 1
        assert "Python programming" in data["results"][0]["preview"]
        assert data["results"][0]["server"] == "TestServer"
        assert data["results"][0]["channel"] == "general"

    @pytest.mark.asyncio
    async def test_search_notes_no_results(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)

        search_fn = make_search_notes_tool(db_session, 1)
        result = await search_fn("zzz_missing_zzz")
        data = json.loads(result)

        assert data["found"] == 0
        assert data["results"] == []

    @pytest.mark.asyncio
    async def test_get_stats_returns_counts(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)

        stats_fn = make_get_stats_tool(db_session, 1)
        result = await stats_fn()
        data = json.loads(result)

        assert data["servers"] == 1
        assert data["channels"] == 1
        assert data["notes"] == 3

    @pytest.mark.asyncio
    async def test_get_today_schedules_returns_data(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)

        sched_fn = make_get_today_schedules_tool(db_session, 1)
        result = await sched_fn()
        data = json.loads(result)

        assert len(data) == 1
        assert "date" in data[0]
        assert "notes_today" in data[0]
        assert data[0]["total_notes"] == 3

    @pytest.mark.asyncio
    async def test_search_notes_empty_query(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)

        search_fn = make_search_notes_tool(db_session, 1)
        result = await search_fn("   ")
        data = json.loads(result)

        assert data["found"] == 0
        assert data["results"] == []


# ──────────────────────────────────────────────────────────────
# Test 3: Closures don't leak between instances
# ──────────────────────────────────────────────────────────────


class TestClosureIsolation:
    """Verify each factory call creates independent closures."""

    @pytest.mark.asyncio
    async def test_different_user_ids_isolated(self, db_session: AsyncSession):
        # Seed data for user 1
        await _seed_test_data(db_session, user_id=1)

        # Seed data for user 2 (different server)
        server2 = Server(user_id=2, name="User2Server")
        db_session.add(server2)
        await db_session.flush()
        channel2 = Channel(server_id=server2.id, name="ch2")
        db_session.add(channel2)
        await db_session.flush()
        note2 = Note(
            channel_id=channel2.id,
            user_id=2,
            content="Secret note for user 2",
            content_type="markdown",
        )
        db_session.add(note2)
        await db_session.flush()

        # Create two isolated tools
        user1_stats = make_get_stats_tool(db_session, 1)
        user2_stats = make_get_stats_tool(db_session, 2)

        r1 = json.loads(await user1_stats())
        r2 = json.loads(await user2_stats())

        # User 1 sees only their own data
        assert r1["servers"] == 1
        assert r1["notes"] == 3

        # User 2 sees only their own data (not user 1's)
        assert r2["servers"] == 1
        assert r2["notes"] == 1
        assert r2["channels"] == 1

    @pytest.mark.asyncio
    async def test_different_db_sessions_isolated(self, db_session: AsyncSession):
        """Two factories with same user_id but should capture the same session."""
        await _seed_test_data(db_session, user_id=1)

        tool_a = make_search_notes_tool(db_session, 1)
        tool_b = make_search_notes_tool(db_session, 1)

        # Both closures should see the same data (same session)
        r_a = json.loads(await tool_a("Python"))
        r_b = json.loads(await tool_b("Python"))

        assert r_a["found"] == r_b["found"] == 1

    @pytest.mark.asyncio
    async def test_closure_does_not_leak_user_id(self, db_session: AsyncSession):
        """Verify the closure uses the captured user_id, not a global."""
        await _seed_test_data(db_session, user_id=1)

        # Create tool with user_id=99 (no data for this user)
        tool = make_get_stats_tool(db_session, 99)
        result = json.loads(await tool())

        assert result["servers"] == 0
        assert result["notes"] == 0


# ──────────────────────────────────────────────────────────────
# Test 4: Backward compatibility — original functions still work
# ──────────────────────────────────────────────────────────────


class TestBackwardCompatibility:
    """Original non-factory functions must still be importable and work."""

    @pytest.mark.asyncio
    async def test_original_search_notes_tool(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)
        result = json.loads(await search_notes_tool("hello", 1, db_session))
        assert result["found"] >= 1

    @pytest.mark.asyncio
    async def test_original_get_stats_tool(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)
        result = json.loads(await get_stats_tool(1, db_session))
        assert result["notes"] == 3

    @pytest.mark.asyncio
    async def test_original_get_today_schedules_tool(self, db_session: AsyncSession):
        await _seed_test_data(db_session, user_id=1)
        result = json.loads(await get_today_schedules_tool(1, db_session))
        assert len(result) == 1
        assert result[0]["total_notes"] == 3
