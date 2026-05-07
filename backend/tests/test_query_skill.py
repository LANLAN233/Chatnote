"""Tests for the $query Skill — two-agent knowledge-base Q&A pipeline."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.query import FETCH_LIMIT, MAX_SOURCE_NOTES, QuerySkill
from app.models.models import Channel, Note, Server


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _make_mock_model() -> MagicMock:
    """Create a mock OpenAIChat-compatible object."""
    return MagicMock()


def _make_mock_agent_response(content: str) -> MagicMock:
    """Create a mock Agno agent response with .content attribute."""
    resp = MagicMock()
    resp.content = content
    return resp


def _make_skill_context(
    db: AsyncSession,
    user_id: int = 1,
    server_context: dict[str, Any] | None = None,
) -> SkillContext:
    """Create a SkillContext for testing."""
    return SkillContext(
        user_id=user_id,
        db=db,
        model=_make_mock_model(),
        server_context=server_context,
    )


# ---------------------------------------------------------------------------
# Test: no server context → error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_no_server_context(db_session: AsyncSession):
    """Returns error when server_context is missing or has no server_id."""
    skill = QuerySkill()
    ctx = _make_skill_context(db_session, server_context={})

    result = await skill.execute("what is calculus?", ctx)
    assert result.type == "error"
    assert "No server specified" in result.content


# ---------------------------------------------------------------------------
# Test: empty notes → graceful message
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_empty_notes(db_session: AsyncSession):
    """Returns a helpful message when the target server has no notes."""
    server = Server(user_id=1, name="EmptyServer")
    db_session.add(server)
    await db_session.flush()

    skill = QuerySkill()
    ctx = _make_skill_context(
        db_session,
        server_context={"server_id": server.id, "server_name": server.name},
    )

    result = await skill.execute("what is calculus?", ctx)
    assert result.type == "output"
    assert "未找到任何笔记" in result.content
    assert "EmptyServer" in result.content


# ---------------------------------------------------------------------------
# Test: empty question → error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_empty_question(db_session: AsyncSession):
    """Returns error when no question is provided."""
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    skill = QuerySkill()
    ctx = _make_skill_context(
        db_session,
        server_context={"server_id": server.id, "server_name": server.name},
    )

    result = await skill.execute("   ", ctx)
    assert result.type == "error"
    assert "question" in result.content.lower()


# ---------------------------------------------------------------------------
# Test: full pipeline with mocked agents
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_with_notes_mocked(db_session: AsyncSession):
    """End-to-end pipeline: retrieval selects top notes, answer agent responds.

    Mocks the Agno Agent to avoid requiring real API keys.
    """
    # Setup: server + channel + 10 notes
    server = Server(user_id=1, name="Math")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Calculus")
    db_session.add(channel)
    await db_session.flush()

    for i in range(10):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"Note {i}: Derivatives are about rates of change. "
            f"The power rule states d/dx x^n = n x^(n-1).",
        )
        db_session.add(note)
    await db_session.flush()

    skill = QuerySkill()
    ctx = _make_skill_context(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
            "channel_id": channel.id,
            "channel_name": channel.name,
        },
    )

    # Mock the retrieval agent → returns indices [2, 5, 7]
    retrieval_response = _make_mock_agent_response("[2, 5, 7]")

    # Mock the answer agent → returns a real answer
    answer_response = _make_mock_agent_response(
        "根据你的笔记，导数描述了函数的变化率。幂法则: d/dx x^n = n x^(n-1)。"
    )

    # Patch Agent class to return our controlled responses
    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ):
        result = await skill.execute("What is the power rule?", ctx)

    assert result.type == "output"
    assert "幂法则" in result.content or "power rule" in result.content.lower()
    assert "问题" in result.content or "question" in result.content.lower()
    assert "置信度" in result.content or "confidence" in result.content.lower()
    # Check data payload
    assert result.data is not None
    assert result.data.get("answer") is not None
    assert isinstance(result.data.get("sources"), list)
    assert len(result.data["sources"]) <= MAX_SOURCE_NOTES
    assert isinstance(result.data.get("confidence"), float)


# ---------------------------------------------------------------------------
# Test: channel filter — only notes from target channel
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_channel_filter(db_session: AsyncSession):
    """When channel_id is provided, only notes from that channel are fetched."""
    server = Server(user_id=1, name="Science")
    db_session.add(server)
    await db_session.flush()

    ch_physics = Channel(server_id=server.id, name="Physics")
    db_session.add(ch_physics)
    await db_session.flush()

    ch_biology = Channel(server_id=server.id, name="Biology")
    db_session.add(ch_biology)
    await db_session.flush()

    # Physics notes (target)
    for i in range(3):
        note = Note(
            channel_id=ch_physics.id,
            user_id=1,
            content=f"Physics note {i}: Newton's law F=ma",
        )
        db_session.add(note)
    # Biology notes (should be excluded)
    for i in range(2):
        note = Note(
            channel_id=ch_biology.id,
            user_id=1,
            content=f"Biology note {i}: DNA replication",
        )
        db_session.add(note)
    await db_session.flush()

    skill = QuerySkill()
    ctx = _make_skill_context(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
            "channel_id": ch_physics.id,
            "channel_name": ch_physics.name,
        },
    )

    # Mock: retrieval selects [0, 1]
    retrieval_response = _make_mock_agent_response("[0, 1]")
    answer_response = _make_mock_agent_response("Newton's laws: F=ma.")

    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ):
        result = await skill.execute("What is Newton's law?", ctx)

    assert result.type == "output"
    assert result.data is not None
    # Only Physics channel notes should be referenced
    for src in result.data["sources"]:
        assert src["channel"] == "Physics"
        assert "Newton" in src["excerpt"] or "F=ma" in src["excerpt"]


# ---------------------------------------------------------------------------
# Helper: sequential agent creation
# ---------------------------------------------------------------------------

def _make_sequential_agent(*responses):
    """Factory that returns Agent mocks in sequence.

    First call → first response (retrieval agent)
    Second call → second response (answer agent)
    """
    call_count = [0]

    def _create_agent(*args, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        if idx >= len(responses):
            # Default fallback
            return _make_mock_agent("[]")
        return _make_mock_agent(responses[idx])

    return _create_agent


def _make_mock_agent(response: MagicMock) -> MagicMock:
    """Create a mock Agent that returns the given response on arun()."""
    agent = MagicMock()
    agent.arun = AsyncMock(return_value=response)
    return agent
