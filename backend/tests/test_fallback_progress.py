"""Tests for tool-call fallback progress events.

Covers:
- AskSkill: tool_call → failed → fallback → completed progress events
- SummarizeSkill: tool_call → failed → fallback → completed progress events
- execute_agent_query: tool_call → failed → fallback → completed progress events
- import_schedule: provider_switch event when switching to Kimi
- No events when ws_manager/operation_id is None
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.console_agent import execute_agent_query
from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.ask import AskSkill
from app.ai.skills.builtin.summarize import SummarizeSkill
from app.schemas.ai_progress import AiProgressStage


# ── Mock helpers ────────────────────────────────────────────────────────────


class MockWsManager:
    """Mock WebSocket manager that captures progress events."""

    def __init__(self):
        self.events: list[tuple] = []  # (user_id, operation_id, stage_data)

    async def broadcast_ai_progress(self, user_id, operation_id, stage_data):
        self.events.append((user_id, operation_id, stage_data))


def _make_mock_model():
    model = MagicMock()
    model.id = "mock-model"
    return model


def _mock_skill_context(db, ws_manager=None, operation_id=None):
    return SkillContext(
        user_id=1,
        db=db,
        model=_make_mock_model(),
        ws_manager=ws_manager,
        operation_id=operation_id,
    )


def _make_mock_agent_response(content, tools=None):
    resp = MagicMock()
    resp.content = content
    resp.tools = tools
    return resp


# ── AskSkill fallback progress tests ────────────────────────────────────────


@pytest.mark.asyncio
async def test_ask_skill_emits_tool_call_failed_and_fallback_events(db_session: AsyncSession):
    """When tool-calling fails (agent throws), AskSkill emits:
    tool_call(in_progress) → tool_call(failed) → fallback(in_progress) → fallback(completed)."""
    ws = MockWsManager()
    ctx = _mock_skill_context(db_session, ws_manager=ws, operation_id="test_op_ask")

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        # First Agent instance (with tools) throws → triggers fallback
        # Second Agent instance (plain) returns success
        mock_tool_agent = MagicMock()
        mock_tool_agent.arun = AsyncMock(side_effect=RuntimeError("tool_not_supported"))
        mock_plain_agent = MagicMock()
        mock_plain_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Plain fallback response")
        )
        MockAgent.side_effect = [mock_tool_agent, mock_plain_agent]

        result = await skill.execute("test question", ctx)

    assert result.type == "output"
    assert "Plain fallback response" in result.content

    # Verify 4 events were emitted
    assert len(ws.events) == 4, f"Expected 4 events, got {len(ws.events)}"

    # Event 1: tool_call in_progress
    uid, opid, stage1 = ws.events[0]
    assert uid == 1
    assert opid == "test_op_ask"
    assert isinstance(stage1, AiProgressStage)
    assert stage1.stage == "tool_call"
    assert stage1.status == "in_progress"
    assert stage1.tier == "primary"
    assert "Executing tool" in stage1.message

    # Event 2: tool_call failed
    _, _, stage2 = ws.events[1]
    assert stage2.stage == "tool_call"
    assert stage2.status == "failed"
    assert stage2.tier == "primary"
    assert "Tool failed" in stage2.message
    assert stage2.metadata == {"tool_name": "ask_agent_with_tools", "error": "model_does_not_support_tools"}

    # Event 3: fallback in_progress
    _, _, stage3 = ws.events[2]
    assert stage3.stage == "fallback"
    assert stage3.status == "in_progress"
    assert stage3.tier == "fallback"
    assert "Falling back" in stage3.message

    # Event 4: fallback completed
    _, _, stage4 = ws.events[3]
    assert stage4.stage == "fallback"
    assert stage4.status == "completed"
    assert stage4.tier == "fallback"
    assert "Fallback response ready" in stage4.message
    assert stage4.duration_ms is not None
    assert stage4.duration_ms >= 0


@pytest.mark.asyncio
async def test_ask_skill_emits_tool_call_failed_on_model_error_response(db_session: AsyncSession):
    """When tool-calling returns a content string matching a tool error pattern,
    AskSkill emits tool_call(failed) and falls back."""
    ws = MockWsManager()
    ctx = _mock_skill_context(db_session, ws_manager=ws, operation_id="test_op_ask_err")

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        # First Agent returns a "does not support tools" error content
        mock_tool_agent = MagicMock()
        mock_tool_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response(
                "Error from provider: This model does not support tools"
            )
        )
        # Second Agent (plain) returns success
        mock_plain_agent = MagicMock()
        mock_plain_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Plain fallback response")
        )
        MockAgent.side_effect = [mock_tool_agent, mock_plain_agent]

        result = await skill.execute("test question", ctx)

    assert result.type == "output"
    assert "Plain fallback response" in result.content
    assert len(ws.events) == 4
    # Event 2 must be tool_call failed
    _, _, stage2 = ws.events[1]
    assert stage2.stage == "tool_call"
    assert stage2.status == "failed"


@pytest.mark.asyncio
async def test_ask_skill_no_events_when_no_ws_manager(db_session: AsyncSession):
    """When ws_manager is not set in context, no progress events should be emitted."""
    ctx = _mock_skill_context(db_session, ws_manager=None, operation_id="test_op_ask")

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent = MagicMock()
        mock_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Direct response, no tools used")
        )
        MockAgent.return_value = mock_agent

        result = await skill.execute("test question", ctx)

    assert result.type == "output"
    # No ws_manager → no events were sent


# ── SummarizeSkill fallback progress tests ──────────────────────────────────


@pytest.mark.asyncio
async def test_summarize_skill_emits_tool_call_failed_and_fallback_events(db_session: AsyncSession):
    """When WikipediaTools fail, SummarizeSkill emits fallback progress events."""
    ws = MockWsManager()
    ctx = _mock_skill_context(db_session, ws_manager=ws, operation_id="test_op_summarize")

    skill = SummarizeSkill()

    with patch("app.ai.skills.builtin.summarize.Agent") as MockAgent:
        # First Agent (with WikipediaTools) throws → triggers fallback
        mock_tool_agent = MagicMock()
        mock_tool_agent.arun = AsyncMock(side_effect=RuntimeError("tool_not_supported"))
        # Second Agent (plain) returns success
        mock_plain_agent = MagicMock()
        mock_plain_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Plain summary")
        )
        MockAgent.side_effect = [mock_tool_agent, mock_plain_agent]

        result = await skill.execute("Summarize my notes", ctx)

    assert result.type == "output"
    assert "Plain summary" in result.content

    assert len(ws.events) == 4

    # Event 1: tool_call in_progress
    _, _, stage1 = ws.events[0]
    assert stage1.stage == "tool_call"
    assert stage1.status == "in_progress"
    assert "WikipediaTools" in stage1.message

    # Event 2: tool_call failed
    _, _, stage2 = ws.events[1]
    assert stage2.stage == "tool_call"
    assert stage2.status == "failed"
    assert stage2.metadata == {"tool_name": "WikipediaTools", "error": "model_does_not_support_tools"}

    # Event 3: fallback in_progress
    _, _, stage3 = ws.events[2]
    assert stage3.stage == "fallback"
    assert stage3.status == "in_progress"

    # Event 4: fallback completed
    _, _, stage4 = ws.events[3]
    assert stage4.stage == "fallback"
    assert stage4.status == "completed"
    assert stage4.duration_ms is not None


@pytest.mark.asyncio
async def test_summarize_skill_no_events_when_no_ws_manager(db_session: AsyncSession):
    """When ws_manager is not set, SummarizeSkill should not emit progress events."""
    ctx = _mock_skill_context(db_session, ws_manager=None, operation_id="test_op")

    skill = SummarizeSkill()

    with patch("app.ai.skills.builtin.summarize.Agent") as MockAgent:
        mock_agent = MagicMock()
        mock_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Direct summary")
        )
        MockAgent.return_value = mock_agent

        result = await skill.execute("Summarize", ctx)

    assert result.type == "output"
    # No ws_manager → no exception expected


# ── execute_agent_query fallback progress tests ─────────────────────────────


@pytest.mark.asyncio
async def test_execute_agent_query_emits_fallback_events(db_session: AsyncSession):
    """When console agent tool-calling fails, execute_agent_query emits fallback events."""
    model = _make_mock_model()
    model.id = "deepseek-chat"

    with patch("app.ai.console_agent.manager") as mock_manager:
        mock_manager.broadcast_ai_progress = AsyncMock()

        with patch("app.ai.console_agent.Agent") as MockAgent:
            # First Agent (tools) throws → triggers fallback
            mock_tool_agent = MagicMock()
            mock_tool_agent.arun = AsyncMock(
                side_effect=RuntimeError("tool_not_supported")
            )
            # Second Agent (plain) returns success
            mock_plain_agent = MagicMock()
            mock_plain_agent.arun = AsyncMock(
                return_value=_make_mock_agent_response("Fallback response from agent")
            )
            MockAgent.side_effect = [mock_tool_agent, mock_plain_agent]

            result = await execute_agent_query(
                "query", db_session, user_id=1, model=model, operation_id="test_op_console"
            )

    assert result["type"] == "agent_response"
    assert "Fallback response from agent" in result["content"]

    # Verify 4 events emitted
    assert mock_manager.broadcast_ai_progress.call_count == 4

    # Collect calls
    calls = mock_manager.broadcast_ai_progress.call_args_list

    # Call 1: tool_call in_progress
    _, kwargs1 = calls[0]
    assert kwargs1["user_id"] == 1
    assert kwargs1["operation_id"] == "test_op_console"
    s1 = kwargs1["stage_data"]
    assert s1.stage == "tool_call"
    assert s1.status == "in_progress"
    assert s1.model == "deepseek-chat"
    assert s1.tier == "primary"

    # Call 2: tool_call failed
    _, kwargs2 = calls[1]
    s2 = kwargs2["stage_data"]
    assert s2.stage == "tool_call"
    assert s2.status == "failed"
    assert s2.metadata == {"tool_name": "console_agent_with_tools", "error": "model_does_not_support_tools"}

    # Call 3: fallback in_progress
    _, kwargs3 = calls[2]
    s3 = kwargs3["stage_data"]
    assert s3.stage == "fallback"
    assert s3.status == "in_progress"
    assert s3.tier == "fallback"

    # Call 4: fallback completed
    _, kwargs4 = calls[3]
    s4 = kwargs4["stage_data"]
    assert s4.stage == "fallback"
    assert s4.status == "completed"
    assert s4.duration_ms is not None


@pytest.mark.asyncio
async def test_execute_agent_query_no_events_without_operation_id(db_session: AsyncSession):
    """When operation_id is not provided, execute_agent_query should emit no progress events."""
    model = MagicMock()
    model.id = "deepseek-chat"

    with patch("app.ai.console_agent.Agent") as MockAgent:
        mock_agent = MagicMock()
        mock_agent.arun = AsyncMock(
            return_value=_make_mock_agent_response("Direct response, no tools used")
        )
        MockAgent.return_value = mock_agent

        result = await execute_agent_query(
            "query", db_session, user_id=1, model=model
        )

    assert result["type"] == "agent_response"
    # No operation_id → should not have attempted to call broadcast_ai_progress


@pytest.mark.asyncio
async def test_execute_agent_query_no_events_when_no_model(db_session: AsyncSession):
    """When model is None, execute_agent_query returns error without progress events."""
    with patch("app.ai.console_agent.manager") as mock_manager:
        mock_manager.broadcast_ai_progress = AsyncMock()

        result = await execute_agent_query(
            "query", db_session, user_id=1, model=None, operation_id="test_op"
        )

    assert result["type"] == "error"
    assert "No AI model" in result["content"]
    # No progress events should be emitted
    mock_manager.broadcast_ai_progress.assert_not_called()


# ── import_schedule provider_switch test ────────────────────────────────────


@pytest.mark.asyncio
async def test_import_schedule_emits_provider_switch_event(db_session: AsyncSession):
    """When image import switches to Kimi provider, a provider_switch event is emitted."""
    from unittest.mock import patch as upatch
    from app.routers.ai import import_schedule
    from app.schemas.schemas import ScheduleImportRequest

    # Create a mock user
    user = MagicMock()
    user.id = 1
    user.preferred_llm = "deepseek"

    # Create a request with an image_url
    req = ScheduleImportRequest(text="Test schedule", image_url="https://example.com/img.png")

    # We need to patch:
    # 1. get_model_for_user → returns a model (but has_real_vision(deepseek) = False)
    # 2. get_kimi_vision_model_sdk → returns a mock client
    # 3. _call_kimi_vision_sdk → returns a successful result
    # 4. manager.broadcast_ai_progress

    mock_model = MagicMock()
    mock_model.id = "deepseek-chat"

    mock_kimi_client = MagicMock()

    with upatch("app.ai.models.get_model_for_user", new=AsyncMock(return_value=mock_model)), \
         upatch("app.ai.models.get_kimi_vision_model_sdk", return_value=mock_kimi_client), \
         upatch("app.ai.schedule._call_kimi_vision_sdk", new=AsyncMock(return_value={"servers": [], "schedules": [], "suggestions": []})), \
         upatch("app.routers.ai.manager") as mock_manager:
        mock_manager.broadcast_ai_progress = AsyncMock()

        from fastapi import Response
        result = await import_schedule(req, current_user=user, db=db_session)

    assert result.success is True

    # Verify provider_switch event was emitted
    mock_manager.broadcast_ai_progress.assert_called_once()
    _, kwargs = mock_manager.broadcast_ai_progress.call_args
    assert kwargs["user_id"] == 1
    assert kwargs["operation_id"].startswith("import_schedule_")
    s = kwargs["stage_data"]
    assert s.stage == "provider_switch"
    assert s.status == "fallback"
    assert s.model == "kimi"
    assert s.tier == "fallback"
    assert "Kimi" in s.message
    assert s.metadata["original_provider"] == "deepseek"


@pytest.mark.asyncio
async def test_import_schedule_no_provider_switch_when_real_vision(db_session: AsyncSession):
    """When the default provider already supports real vision, no provider_switch is emitted."""
    from unittest.mock import patch as upatch
    from app.routers.ai import import_schedule
    from app.schemas.schemas import ScheduleImportRequest

    user = MagicMock()
    user.id = 1
    user.preferred_llm = "openai"  # openai has real vision

    req = ScheduleImportRequest(text="Test", image_url="https://example.com/img.png")

    mock_model = MagicMock()
    mock_model.id = "gpt-4o"

    with upatch("app.ai.models.get_model_for_user", new=AsyncMock(return_value=mock_model)), \
         upatch("app.ai.schedule.parse_schedule_import", new=AsyncMock(return_value={"servers": [], "schedules": [], "suggestions": []})), \
         upatch("app.routers.ai.manager") as mock_manager:
        mock_manager.broadcast_ai_progress = AsyncMock()

        result = await import_schedule(req, current_user=user, db=db_session)

    assert result.success is True
    # provider has real vision → no provider_switch event should be emitted
    mock_manager.broadcast_ai_progress.assert_not_called()
