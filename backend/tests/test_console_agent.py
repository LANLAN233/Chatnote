"""Tests for console_agent — AI agent tool integration (Phase 15).

Tests cover:
- create_console_ai_agent(): tools added when model available, None when not
- execute_agent_query(): tool calls captured, graceful degradation without model
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.console_agent import (
    create_console_ai_agent,
    execute_agent_query,
)


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------


def _make_mock_model() -> MagicMock:
    """Create a mock OpenAIChat-compatible object."""
    return MagicMock()


def _make_mock_agent_response(content: str, tools: list | None = None) -> MagicMock:
    """Create a mock agno RunResponse with .content and .tools attributes."""
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


# ---------------------------------------------------------------------------
# Test: create_console_ai_agent — tools added when model available
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_console_ai_agent_with_model_adds_tools(db_session: AsyncSession):
    """When a model is provided, the agent is created with search_notes
    and get_stats tools and read_tool_call_history=True."""
    model = _make_mock_model()

    with patch("app.ai.console_agent.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        MockAgent.return_value = mock_agent_instance

        agent = create_console_ai_agent(db_session, user_id=1, model=model)

        assert agent is not None, "Agent should be created when model is available"
        assert agent is mock_agent_instance

        # Verify Agent was called with tools kwarg
        call_kwargs = MockAgent.call_args.kwargs
        assert "tools" in call_kwargs, "Agent should receive tools kwarg"
        tools = call_kwargs["tools"]
        assert len(tools) == 2, f"Expected 2 tools (search_notes, get_stats), got {len(tools)}"

        # Verify tool names (closure wrappers)
        tool_names = [t.__name__ for t in tools]
        assert "search_notes" in tool_names
        assert "get_stats" in tool_names

        # Verify read_tool_call_history was passed
        assert call_kwargs.get("read_tool_call_history") is True

        # Verify agent name
        assert call_kwargs.get("name") == "Console Agent"


# ---------------------------------------------------------------------------
# Test: create_console_ai_agent — returns None without model
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_console_ai_agent_without_model_returns_none(db_session: AsyncSession):
    """When model is None, create_console_ai_agent returns None (graceful)."""
    agent = create_console_ai_agent(db_session, user_id=1, model=None)
    assert agent is None, "Agent should be None when no model is available"


# ---------------------------------------------------------------------------
# Test: execute_agent_query — tool calls captured in response
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_agent_query_captures_tool_calls(db_session: AsyncSession):
    """When the agent uses tools, tool_calls and tool_results appear in the
    returned dict under 'data'."""
    model = _make_mock_model()

    mock_tools = [
        _make_mock_tool_exec(
            tool_name="search_notes",
            tool_args={"query": "高数"},
            result='{"found": 3, "results": [{"preview": "高等数学笔记..."}]}',
        ),
        _make_mock_tool_exec(
            tool_name="get_stats",
            tool_args={},
            result='{"servers": 2, "channels": 5, "notes": 42}',
        ),
    ]

    with patch("app.ai.console_agent.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=_make_mock_agent_response(
                "You have 3 notes about 高数 out of 42 total.", tools=mock_tools
            )
        )
        MockAgent.return_value = mock_agent_instance

        result = await execute_agent_query("我这周高数笔记有几条？", db_session, user_id=1, model=model)

    assert result["type"] == "agent_response"
    assert "content" in result
    assert result["data"] is not None

    # tool_calls: [{"tool_name": ..., "tool_args": ..., "tool_call_error": ...}]
    tc = result["data"]["tool_calls"]
    assert len(tc) == 2
    assert tc[0]["tool_name"] == "search_notes"
    assert tc[0]["tool_args"] == {"query": "高数"}
    assert tc[1]["tool_name"] == "get_stats"

    # tool_results: [{"tool_name": ..., "result": ...}]
    tr = result["data"]["tool_results"]
    assert len(tr) == 2
    assert tr[0]["tool_name"] == "search_notes"
    assert "found" in tr[0]["result"]
    assert tr[1]["tool_name"] == "get_stats"
    assert "notes" in tr[1]["result"]


# ---------------------------------------------------------------------------
# Test: execute_agent_query — empty tool calls when no tools used
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_agent_query_no_tool_calls_when_not_used(db_session: AsyncSession):
    """When the agent does NOT invoke any tools, data contains empty lists."""
    model = _make_mock_model()

    with patch("app.ai.console_agent.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=_make_mock_agent_response("Hello! How can I help?", tools=None)
        )
        MockAgent.return_value = mock_agent_instance

        result = await execute_agent_query("Hello!", db_session, user_id=1, model=model)

    assert result["type"] == "agent_response"
    assert result["data"]["tool_calls"] == []
    assert result["data"]["tool_results"] == []


# ---------------------------------------------------------------------------
# Test: execute_agent_query — error without model (graceful degradation)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_agent_query_without_model_returns_error(db_session: AsyncSession):
    """When model is None, execute_agent_query returns an error message
    without creating an Agent or making API calls."""
    with patch("app.ai.console_agent.Agent") as MockAgent:
        result = await execute_agent_query("What are my notes?", db_session, user_id=1, model=None)
        MockAgent.assert_not_called()

    assert result["type"] == "error"
    assert "API key" in result["content"] or "model" in result["content"].lower()
    assert "data" not in result  # No tool data when agent not created


# ---------------------------------------------------------------------------
# Test: execute_agent_query — empty input returns prompt
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_agent_query_empty_input(db_session: AsyncSession):
    """Empty or whitespace-only input returns a prompt without creating Agent."""
    model = _make_mock_model()

    with patch("app.ai.console_agent.Agent") as MockAgent:
        result = await execute_agent_query("   ", db_session, user_id=1, model=model)
        MockAgent.assert_not_called()

    assert result["type"] == "text"
    assert "query" in result["content"].lower() or "command" in result["content"].lower()


# ---------------------------------------------------------------------------
# Test: execute_agent_query — exception handling
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_agent_query_handles_agent_exceptions(db_session: AsyncSession):
    """When agent.arun raises an exception, execute_agent_query catches it
    and returns an error response (no unhandled exception)."""
    model = _make_mock_model()

    with patch("app.ai.console_agent.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            side_effect=RuntimeError("Connection timeout")
        )
        MockAgent.return_value = mock_agent_instance

        result = await execute_agent_query("Search notes", db_session, user_id=1, model=model)

    assert result["type"] == "error"
    assert "Connection timeout" in result["content"] or "failed" in result["content"].lower()
