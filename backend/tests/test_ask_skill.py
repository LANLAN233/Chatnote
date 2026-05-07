"""Tests for the $ask Skill — general-purpose AI Q&A with agno tools."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.ask import AskSkill


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _make_mock_model() -> MagicMock:
    """Create a mock OpenAIChat-compatible object."""
    return MagicMock()


def _make_mock_agent_response(content: str, tools: list | None = None) -> MagicMock:
    """Create a mock Agno RunResponse with .content and .tools attributes."""
    resp = MagicMock()
    resp.content = content
    resp.tools = tools
    return resp


def _make_mock_tool_exec(
    tool_name: str, tool_args: dict | None = None, result: str | None = None,
    tool_call_error: bool | None = None,
) -> MagicMock:
    """Create a mock agno ToolExecution object."""
    te = MagicMock()
    te.tool_name = tool_name
    te.tool_args = tool_args or {}
    te.result = result
    te.tool_call_error = tool_call_error
    return te


def _make_skill_context(
    db: AsyncSession, user_id: int = 1,
) -> SkillContext:
    """Create a SkillContext for testing."""
    return SkillContext(
        user_id=user_id,
        db=db,
        model=_make_mock_model(),
    )


# ---------------------------------------------------------------------------
# Test 1: tools are passed to Agent constructor
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_skill_agent_configured_with_tools(db_session: AsyncSession):
    """Agent is constructed with the full tools array (DuckDuckGo, Calculator,
    Python, search_notes, get_stats) and read_tool_call_history=True."""
    ctx = _make_skill_context(db_session)

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=_make_mock_agent_response("Test answer")
        )
        MockAgent.return_value = mock_agent_instance

        await skill.execute("What is 2+2?", ctx)

        # Verify Agent was called with tools kwarg
        call_kwargs = MockAgent.call_args.kwargs
        assert "tools" in call_kwargs, "Agent should receive tools kwarg"
        tools = call_kwargs["tools"]
        assert len(tools) == 5, f"Expected 5 tools, got {len(tools)}"

        # Verify read_tool_call_history was passed
        assert call_kwargs.get("read_tool_call_history") is True


# ---------------------------------------------------------------------------
# Test 2: tool_calls and tool_results captured in SkillResult.data
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_skill_captures_tool_calls(db_session: AsyncSession):
    """When the agent uses tools, tool_calls and tool_results appear in
    SkillResult.data metadata."""
    ctx = _make_skill_context(db_session)

    skill = AskSkill()

    mock_tools = [
        _make_mock_tool_exec(
            tool_name="search_notes",
            tool_args={"query": "calculus"},
            result='{"found": 3, "results": [...]}',
        ),
        _make_mock_tool_exec(
            tool_name="get_stats",
            tool_args={},
            result='{"servers": 2, "channels": 5, "notes": 42}',
        ),
    ]

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=_make_mock_agent_response(
                "Based on your notes, calculus is...", tools=mock_tools
            )
        )
        MockAgent.return_value = mock_agent_instance

        result = await skill.execute("What is calculus?", ctx)

    assert result.type == "output"
    assert result.data is not None, "SkillResult.data should contain metadata"
    assert "tool_calls" in result.data
    assert "tool_results" in result.data

    # tool_calls: [{"tool_name": ..., "tool_args": ..., "tool_call_error": ...}]
    tc = result.data["tool_calls"]
    assert len(tc) == 2
    assert tc[0]["tool_name"] == "search_notes"
    assert tc[0]["tool_args"] == {"query": "calculus"}
    assert tc[1]["tool_name"] == "get_stats"

    # tool_results: [{"tool_name": ..., "result": ...}]
    tr = result.data["tool_results"]
    assert len(tr) == 2
    assert tr[0]["tool_name"] == "search_notes"
    assert "found" in tr[0]["result"]
    assert tr[1]["tool_name"] == "get_stats"
    assert "servers" in tr[1]["result"]


# ---------------------------------------------------------------------------
# Test 3: tool_calls are empty when no tools are used
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_skill_no_tool_calls_when_not_used(db_session: AsyncSession):
    """When the agent does NOT invoke any tools, SkillResult.data contains
    empty tool_calls and tool_results lists."""
    ctx = _make_skill_context(db_session)

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        # response.tools is None → no tools called
        mock_agent_instance.arun = AsyncMock(
            return_value=_make_mock_agent_response(
                "Hello! How can I help?", tools=None
            )
        )
        MockAgent.return_value = mock_agent_instance

        result = await skill.execute("Hello!", ctx)

    assert result.type == "output"
    assert result.data is not None
    assert result.data["tool_calls"] == []
    assert result.data["tool_results"] == []


# ---------------------------------------------------------------------------
# Test 4: empty input returns error (existing behavior preserved)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_skill_empty_input(db_session: AsyncSession):
    """Empty or whitespace-only input returns an error message."""
    ctx = _make_skill_context(db_session)
    skill = AskSkill()

    # No Agent should be created for empty input
    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        result = await skill.execute("   ", ctx)
        MockAgent.assert_not_called()

    assert result.type == "output"
    assert "question" in result.content.lower()
    assert result.data is None  # No tools data when not running agent


# ---------------------------------------------------------------------------
# Test 5: skill handles agent failure gracefully
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_ask_skill_graceful_on_agent_error(db_session: AsyncSession):
    """If the agent run raises an exception, the skill should propagate it
    (the caller is responsible for error handling)."""
    ctx = _make_skill_context(db_session)

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            side_effect=RuntimeError("API connection failed")
        )
        MockAgent.return_value = mock_agent_instance

        with pytest.raises(RuntimeError, match="API connection failed"):
            await skill.execute("Why?", ctx)
