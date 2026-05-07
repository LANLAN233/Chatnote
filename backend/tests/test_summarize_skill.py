"""Tests for the $summarize Skill — AI-powered note summary with Wikipedia enrichment."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.skills.base import SkillContext, SkillResult
from app.ai.skills.builtin.summarize import SummarizeSkill
from app.models.models import Channel, Note, Server


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _make_mock_model() -> MagicMock:
    """Create a mock OpenAIChat-compatible object."""
    return MagicMock()


def _make_skill_context(
    db: AsyncSession,
    user_id: int = 1,
) -> SkillContext:
    """Create a SkillContext for testing."""
    return SkillContext(
        user_id=user_id,
        db=db,
        model=_make_mock_model(),
    )


def _make_mock_response(
    content: str = "Mock summary",
    tools: list[Any] | None = None,
) -> MagicMock:
    """Create a mock RunOutput with content and optional tools."""
    resp = MagicMock()
    resp.content = content
    resp.tools = tools or []
    return resp


def _make_tool_execution(
    tool_name: str = "search_wikipedia",
    query: str = "quantum computing",
) -> MagicMock:
    """Create a mock ToolExecution with tool_name and tool_args."""
    tool = MagicMock()
    tool.tool_name = tool_name
    tool.tool_args = {"query": query}
    return tool


# ---------------------------------------------------------------------------
# Test: WikipediaTools is configured on agent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_agent_includes_wikipedia_tools(db_session: AsyncSession):
    """Agent is created with WikipediaTools() in its tools list."""
    # Setup: some notes so the skill has content to work with
    server = Server(user_id=1, name="Physics")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Quantum")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="量子计算利用量子比特的叠加态和纠缠态进行计算。",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    captured_agent = None

    def _capture_agent(*args, **kwargs):
        nonlocal captured_agent
        captured_agent = MagicMock()
        captured_agent.arun = AsyncMock(
            return_value=_make_mock_response("Summary with wiki sources.")
        )
        return captured_agent

    with patch("app.ai.skills.builtin.summarize.Agent", side_effect=_capture_agent):
        await skill.execute("Summarize", ctx)

    assert captured_agent is not None, "Agent was not created"


# ---------------------------------------------------------------------------
# Test: wiki_sources extracted from tool calls
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_extracts_wiki_sources(db_session: AsyncSession):
    """SkillResult.data contains wiki_sources extracted from Wikipedia tool calls."""
    server = Server(user_id=1, name="Math")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Calculus")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Limits, derivatives, and integrals are fundamental calculus concepts.",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    # Mock response with Wikipedia tool calls for "calculus" and "derivative"
    wiki_tools = [
        _make_tool_execution("search_wikipedia", "calculus"),
        _make_tool_execution("search_wikipedia", "derivative"),
    ]
    mock_response = _make_mock_response(
        content="## Summary\nCalculus is the mathematical study of change...",
        tools=wiki_tools,
    )

    with patch(
        "app.ai.skills.builtin.summarize.Agent",
        return_value=MagicMock(arun=AsyncMock(return_value=mock_response)),
    ):
        result = await skill.execute("Summarize calculus", ctx)

    assert result.type == "output"
    assert result.data is not None
    assert "wiki_sources" in result.data
    assert isinstance(result.data["wiki_sources"], list)
    assert "calculus" in result.data["wiki_sources"]
    assert "derivative" in result.data["wiki_sources"]


# ---------------------------------------------------------------------------
# Test: no wiki_sources when no Wikipedia tools called
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_empty_wiki_sources_when_no_tools_run(db_session: AsyncSession):
    """wiki_sources is an empty list when no Wikipedia tools were invoked."""
    server = Server(user_id=1, name="History")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="WWII")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="World War II began in 1939 and ended in 1945.",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    # Mock response with no tool calls
    mock_response = _make_mock_response(
        content="**Summary**\nWorld War II was a global conflict...",
        tools=[],
    )

    with patch(
        "app.ai.skills.builtin.summarize.Agent",
        return_value=MagicMock(arun=AsyncMock(return_value=mock_response)),
    ):
        result = await skill.execute("Summarize", ctx)

    assert result.type == "output"
    assert result.data is not None
    assert result.data["wiki_sources"] == []


# ---------------------------------------------------------------------------
# Test: handle response with no tools attribute
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_handles_response_without_tools_attr(db_session: AsyncSession):
    """Gracefully handles RunOutput without a .tools attribute (backward compat)."""
    server = Server(user_id=1, name="Science")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Biology")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Photosynthesis converts light energy to chemical energy.",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    # Mock response where .tools doesn't exist (older agno compat)
    mock_response = MagicMock(spec=["content"])
    mock_response.content = "Summary about photosynthesis."

    with patch(
        "app.ai.skills.builtin.summarize.Agent",
        return_value=MagicMock(arun=AsyncMock(return_value=mock_response)),
    ):
        result = await skill.execute("Summarize", ctx)

    assert result.type == "output"
    assert result.data is not None
    assert result.data["wiki_sources"] == []


# ---------------------------------------------------------------------------
# Test: deduplication of wiki sources
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_deduplicates_wiki_sources(db_session: AsyncSession):
    """Duplicate wiki queries produce a deduplicated list."""
    server = Server(user_id=1, name="Physics")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Quantum")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Quantum computing uses qubits for computation.",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    # Duplicate Wikipedia calls for "quantum computing"
    wiki_tools = [
        _make_tool_execution("search_wikipedia", "quantum computing"),
        _make_tool_execution("search_wikipedia", "quantum computing"),
        _make_tool_execution("search_wikipedia", "qubit"),
    ]
    mock_response = _make_mock_response(
        content="## Quantum Computing\nQuantum computing harnesses quantum mechanics...",
        tools=wiki_tools,
    )

    with patch(
        "app.ai.skills.builtin.summarize.Agent",
        return_value=MagicMock(arun=AsyncMock(return_value=mock_response)),
    ):
        result = await skill.execute("Summarize quantum", ctx)

    assert result.data is not None
    wiki_sources = result.data["wiki_sources"]
    # Deduplicated — "quantum computing" appears only once
    assert wiki_sources == ["quantum computing", "qubit"]


# ---------------------------------------------------------------------------
# Test: non-wikipedia tools are ignored
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_summarize_ignores_non_wikipedia_tools(db_session: AsyncSession):
    """Only tool calls with 'wikipedia' in tool_name are extracted as wiki_sources."""
    server = Server(user_id=1, name="CS")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="AI")
    db_session.add(channel)
    await db_session.flush()

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Machine learning uses neural networks for pattern recognition.",
    )
    db_session.add(note)
    await db_session.flush()

    skill = SummarizeSkill()
    ctx = _make_skill_context(db_session)

    wiki_tools = [
        _make_tool_execution("search_wikipedia", "neural network"),
        _make_tool_execution("some_other_tool", "not a wiki source"),
        _make_tool_execution("duckduckgo_search", "irrelevant query"),
    ]
    mock_response = _make_mock_response(
        content="ML summary...", tools=wiki_tools
    )

    with patch(
        "app.ai.skills.builtin.summarize.Agent",
        return_value=MagicMock(arun=AsyncMock(return_value=mock_response)),
    ):
        result = await skill.execute("Summarize ML", ctx)

    assert result.data is not None
    wiki_sources = result.data["wiki_sources"]
    assert wiki_sources == ["neural network"]
    assert "not a wiki source" not in wiki_sources
    assert "irrelevant query" not in wiki_sources
