"""Tests for the @Server #Channel context loading feature in console.py.

Covers _load_context() helper and the context_loaded routing branch
in both console_execute() and server_console_execute().

Also covers loaded_notes injection into $ask and $query skills
when a session has loaded_context.
"""

from __future__ import annotations

import json

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from unittest.mock import AsyncMock, MagicMock, patch

from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.ask import AskSkill
from app.ai.skills.builtin.query import FETCH_LIMIT, QuerySkill
from app.models.models import Channel, ConsoleSession, Note, Server
from app.routers.console import _dispatch_skill, _route_query_skill


# ===========================================================================
# Helpers
# ===========================================================================


async def _seed_server_with_notes(db_session, server_name: str = "MathClass", channel_name: str = "极限", note_count: int = 3):
    """Create a server + channel and populate with test notes."""
    server = Server(user_id=1, name=server_name)
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name=channel_name)
    db_session.add(channel)
    await db_session.flush()

    for i in range(note_count):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"Test note {i + 1} about mathematics and limits",
        )
        db_session.add(note)
    await db_session.flush()

    return server, channel


# ===========================================================================
# Test 1: @Server #Channel (no question) → context_loaded
# ===========================================================================


@pytest.mark.asyncio
async def test_context_load_at_server_channel_no_question(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST @MathClass #极限 (no question, AI enabled) → context_loaded response."""
    server, channel = await _seed_server_with_notes(db_session, note_count=5)

    response = await client.post(
        "/api/console/execute",
        json={"input": "@MathClass #极限", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "context_loaded"
    assert data["data"]["server_name"] == "MathClass"
    assert data["data"]["channel_name"] == "极限"
    assert data["data"]["notes_count"] == 5
    assert data["data"]["server_id"] == server.id
    assert data["data"]["channel_id"] == channel.id
    assert isinstance(data["data"]["loaded_context_summary"], list)
    assert len(data["data"]["loaded_context_summary"]) == 3  # preview = first 3
    assert data["data"]["session_id"] is not None

    # Verify loaded_context is persisted on the session
    result = await db_session.execute(
        select(ConsoleSession).where(ConsoleSession.id == data["data"]["session_id"])
    )
    session = result.scalar_one()
    assert session.loaded_context is not None
    assert "MathClass" in session.loaded_context
    assert "极限" in session.loaded_context


# ===========================================================================
# Test 2: @NonexistentServer #Channel → error
# ===========================================================================


@pytest.mark.asyncio
async def test_context_load_nonexistent_server(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST @NonExistentServer #极限 (AI enabled) → error '服务器不存在'."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "@NonExistentServer #极限", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert data["data"]["type"] == "error"
    assert "不存在" in data["data"]["content"]
    assert "NonExistentServer" in data["data"]["content"]


# ===========================================================================
# Test 3: @Server #Channel question → query routing (regression)
# ===========================================================================


@pytest.mark.asyncio
async def test_context_load_with_question_still_routes_to_query(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST @MathClass #极限 What is a limit? (AI enabled) → query routing, NOT context_loaded."""
    await _seed_server_with_notes(db_session)

    response = await client.post(
        "/api/console/execute",
        json={"input": "@MathClass #极限 What is a limit?", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    # Must route to query skill, not context_loaded
    assert data["data"].get("type") != "context_loaded"
    assert data["data"].get("routed_skill") == "query"


# ===========================================================================
# Test 4: @Server #Channel with AI OFF → note creation
# ===========================================================================


@pytest.mark.asyncio
async def test_context_load_ai_off_falls_through_to_note(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST @MathClass #极限 (AI disabled) → falls through to note creation, not context_loaded."""
    await _seed_server_with_notes(db_session)

    response = await client.post(
        "/api/console/execute",
        json={"input": "@MathClass #极限", "ai_enabled": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Must fall through to note creation, NOT context_loaded
    assert data["data"].get("type") != "context_loaded"
    assert "note" in data["data"]


# ===========================================================================
# Test 5: #Channel in server-scoped console → context_loaded
# ===========================================================================


@pytest.mark.asyncio
async def test_server_scoped_context_load_channel_no_question(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST #极限 (no question, AI enabled) to server-scoped console → context_loaded."""
    server, channel = await _seed_server_with_notes(db_session, note_count=4)

    response = await client.post(
        f"/api/server/{server.id}/console/execute",
        json={"input": "#极限", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "context_loaded"
    assert data["data"]["server_name"] == "MathClass"
    assert data["data"]["channel_name"] == "极限"
    assert data["data"]["notes_count"] == 4
    assert data["data"]["server_id"] == server.id
    assert data["data"]["channel_id"] == channel.id
    assert isinstance(data["data"]["loaded_context_summary"], list)
    assert len(data["data"]["loaded_context_summary"]) == 3


# ===========================================================================
# Test 6: @Server only (no #Channel) → context_loaded (all channels)
# ===========================================================================


@pytest.mark.asyncio
async def test_context_load_server_only_no_question(
    client: AsyncClient, auth_headers: dict, db_session
):
    """POST @MathClass (no #Channel, AI enabled) → context_loaded for entire server."""
    server, _ = await _seed_server_with_notes(db_session, note_count=2)

    # Create a second channel with notes
    channel2 = Channel(server_id=server.id, name="general")
    db_session.add(channel2)
    await db_session.flush()
    note = Note(channel_id=channel2.id, user_id=1, content="General channel note")
    db_session.add(note)
    await db_session.flush()

    response = await client.post(
        "/api/console/execute",
        json={"input": "@MathClass", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "context_loaded"
    assert data["data"]["server_name"] == "MathClass"
    assert data["data"]["channel_name"] is None  # no specific channel
    assert data["data"]["notes_count"] == 3  # 2+1 from both channels
    assert data["data"]["server_id"] == server.id


# ===========================================================================
# Test 7: _dispatch_skill passes loaded_notes to SkillContext
# ===========================================================================


@pytest.mark.asyncio
async def test_dispatch_skill_receives_loaded_notes(db_session: AsyncSession):
    """_dispatch_skill should pass loaded_notes into SkillContext when provided."""
    with (
        patch("app.routers.console.get_model_for_user") as mock_get_model,
        patch("app.routers.console.skill_registry.dispatch") as mock_dispatch,
    ):
        mock_get_model.return_value = MagicMock()
        mock_dispatch.return_value = MagicMock(type="output", content="OK", data=None)

        test_notes = ["[极限] Note about limits", "[极限] Another note"]
        await _dispatch_skill(
            "ask", "What is a limit?", 1, db_session,
            loaded_notes=test_notes,
        )

        # Verify SkillContext was constructed with loaded_notes
        call_args = mock_dispatch.call_args
        context: SkillContext = call_args.args[2]  # skill_name, skill_args, context
        assert context.loaded_notes == test_notes


# ===========================================================================
# Test 8: _dispatch_skill passes None when loaded_notes omitted
# ===========================================================================


@pytest.mark.asyncio
async def test_dispatch_skill_loaded_notes_none_by_default(db_session: AsyncSession):
    """When loaded_notes is not passed, SkillContext.loaded_notes should be None."""
    with (
        patch("app.routers.console.get_model_for_user") as mock_get_model,
        patch("app.routers.console.skill_registry.dispatch") as mock_dispatch,
    ):
        mock_get_model.return_value = MagicMock()
        mock_dispatch.return_value = MagicMock(type="output", content="OK", data=None)

        await _dispatch_skill("ask", "What is a limit?", 1, db_session)

        call_args = mock_dispatch.call_args
        context: SkillContext = call_args.args[2]
        assert context.loaded_notes is None


# ===========================================================================
# Test 9: $ask skill prepends loaded_notes to prompt
# ===========================================================================


@pytest.mark.asyncio
async def test_ask_skill_prepends_loaded_notes(db_session: AsyncSession):
    """When SkillContext has loaded_notes, AskSkill should prepend them to the
    user prompt before sending to the AI agent."""
    ctx = SkillContext(
        user_id=1,
        db=db_session,
        model=MagicMock(),
        loaded_notes=["[极限] 极限是微积分的基本概念", "[极限] 数列极限的定义"],
    )

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=MagicMock(content="回答：极限指的是...", tools=None)
        )
        MockAgent.return_value = mock_agent_instance

        await skill.execute("什么是极限？", ctx)

        # Verify the input passed to agent.arun includes the prepended context
        call_args = mock_agent_instance.arun.call_args
        input_text = call_args.kwargs.get("input", "")
        assert "以下是用户已加载的参考笔记" in input_text
        assert "极限是微积分的基本概念" in input_text
        assert "数列极限的定义" in input_text
        assert "什么是极限？" in input_text


# ===========================================================================
# Test 10: $ask skill without loaded_notes passes args as-is
# ===========================================================================


@pytest.mark.asyncio
async def test_ask_skill_without_loaded_notes_passes_args_directly(db_session: AsyncSession):
    """When SkillContext has NO loaded_notes, the original question is passed unchanged."""
    ctx = SkillContext(
        user_id=1,
        db=db_session,
        model=MagicMock(),
    )

    skill = AskSkill()

    with patch("app.ai.skills.builtin.ask.Agent") as MockAgent:
        mock_agent_instance = MagicMock()
        mock_agent_instance.arun = AsyncMock(
            return_value=MagicMock(content="回答", tools=None)
        )
        MockAgent.return_value = mock_agent_instance

        await skill.execute("什么是极限？", ctx)

        call_args = mock_agent_instance.arun.call_args
        input_text = call_args.kwargs.get("input", "")
        assert input_text == "什么是极限？"
        assert "以下是用户已加载的参考笔记" not in input_text


# ===========================================================================
# Test 11: $query skill merges loaded_notes with fetched notes (deduplication)
# ===========================================================================


@pytest.mark.asyncio
async def test_query_skill_merges_loaded_notes_deduplicate(db_session: AsyncSession):
    """When SkillContext has loaded_notes that overlap with fetched notes,
    QuerySkill should deduplicate by content and not exceed FETCH_LIMIT * 2."""
    server = Server(user_id=1, name="MathServer")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="极限")
    db_session.add(channel)
    await db_session.flush()

    # Create notes that will be fetched by fetch_notes_for_context
    for i in range(3):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"DB note {i + 1} about calculus",
        )
        db_session.add(note)
    await db_session.flush()

    ctx = SkillContext(
        user_id=1,
        db=db_session,
        model=MagicMock(),
        server_context={"server_id": server.id, "server_name": server.name, "channel_id": channel.id, "channel_name": channel.name},
        # loaded_notes contain 2 notes: one DUPLICATE of what's in DB, one NEW
        loaded_notes=[
            "[极限] DB note 1 about calculus",  # same as first fetched note — should be deduplicated
            "[极限] Session context note about limits",  # unique — should be appended
        ],
    )

    skill = QuerySkill()

    # Mock the retrieval and answer agents to avoid actual AI calls
    with (
        patch.object(skill, "_retrieve_top_notes") as mock_retrieve,
        patch.object(skill, "_generate_answer") as mock_answer,
    ):
        mock_retrieve.return_value = ["[极限] DB note 1 about calculus"]
        mock_answer.return_value = "Answer based on notes."

        result = await skill.execute("what are limits?", ctx)

    assert result.type == "output"
    # Should have merged: 3 fetched + 1 new loaded_note = 4 total notes
    # (the duplicate "[极限] DB note 1 about calculus" is NOT counted twice)
    assert "检索到 4 条笔记" in result.content


# ===========================================================================
# Test 12: $query skill without loaded_notes has unchanged behavior
# ===========================================================================


@pytest.mark.asyncio
async def test_query_skill_without_loaded_notes_unchanged(db_session: AsyncSession):
    """When SkillContext has NO loaded_notes, query behavior is unchanged
    (only fetched notes are used)."""
    server = Server(user_id=1, name="MathServer")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="极限")
    db_session.add(channel)
    await db_session.flush()

    for i in range(3):
        note = Note(channel_id=channel.id, user_id=1, content=f"DB note {i + 1}")
        db_session.add(note)
    await db_session.flush()

    ctx = SkillContext(
        user_id=1,
        db=db_session,
        model=MagicMock(),
        server_context={"server_id": server.id, "server_name": server.name, "channel_id": channel.id, "channel_name": channel.name},
    )

    skill = QuerySkill()

    with (
        patch.object(skill, "_retrieve_top_notes") as mock_retrieve,
        patch.object(skill, "_generate_answer") as mock_answer,
    ):
        mock_retrieve.return_value = ["[极限] DB note 1"]
        mock_answer.return_value = "Answer based on notes."

        result = await skill.execute("what are limits?", ctx)

    assert result.type == "output"
    assert "检索到 3 条笔记" in result.content


# ===========================================================================
# Test 13: _route_query_skill passes loaded_notes through to _dispatch_skill
# ===========================================================================


@pytest.mark.asyncio
async def test_route_query_skill_passes_loaded_notes(db_session: AsyncSession):
    """_route_query_skill should pass loaded_notes through to _dispatch_skill."""
    server = Server(user_id=1, name="MathServer")
    db_session.add(server)
    await db_session.flush()

    parsed = MagicMock()
    parsed.server_name = "MathServer"
    parsed.channel_name = None
    parsed.content = MagicMock()
    parsed.content.strip.return_value = "what is calculus?"

    test_notes = ["[极限] Some note content"]

    with (
        patch("app.routers.console.get_model_for_user") as mock_get_model,
        patch("app.routers.console.skill_registry.dispatch") as mock_dispatch,
    ):
        mock_get_model.return_value = MagicMock()
        mock_dispatch.return_value = MagicMock(type="output", content="OK", data=None)

        await _route_query_skill(
            parsed, 1, db_session,
            loaded_notes=test_notes,
        )

        call_args = mock_dispatch.call_args
        context: SkillContext = call_args.args[2]
        assert context.loaded_notes == test_notes
