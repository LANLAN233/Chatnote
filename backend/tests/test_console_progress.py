"""Tests for console progress events emitted via WebSocket during console_execute()."""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.models.models import Channel, Note, Server
from app.schemas.ai_progress import AiProgressStage


@pytest.mark.asyncio
async def test_console_execute_returns_operation_id(client: AsyncClient, auth_headers: dict):
    """HTTP response must include a valid UUID operation_id for all paths."""
    # Test /help command path
    response = await client.post(
        "/api/console/execute",
        json={"input": "/help"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "operation_id" in data["data"]
    op_id = data["data"]["operation_id"]
    # Must be a valid UUID
    uuid.UUID(op_id)


@pytest.mark.asyncio
async def test_console_execute_note_fallback_returns_operation_id(
    client: AsyncClient, auth_headers: dict
):
    """Fallback path (regular note input) must also include operation_id."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "This is a test note about linear algebra"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "operation_id" in data["data"]
    uuid.UUID(data["data"]["operation_id"])


@pytest.mark.asyncio
async def test_parsing_event_emitted_for_help_command(client: AsyncClient, auth_headers: dict):
    """Even a simple /help command should emit a parsing progress event."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "/help"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        op_id = data["data"]["operation_id"]

        # At least one call (parsing) should have been made
        assert mock_broadcast.call_count >= 1

        # First call should be the parsing event with correct operation_id
        first_call_args = mock_broadcast.call_args_list[0]
        user_id_arg, op_id_arg, stage_arg = first_call_args[0]
        assert isinstance(stage_arg, AiProgressStage)
        assert stage_arg.stage == "parsing"
        assert stage_arg.status == "completed"
        assert op_id_arg == op_id


@pytest.mark.asyncio
async def test_fallback_event_emitted_for_note_input(client: AsyncClient, auth_headers: dict):
    """Regular note input should emit parsing + fallback progress events."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "Some random note content"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        op_id = data["data"]["operation_id"]

        calls = mock_broadcast.call_args_list
        assert len(calls) >= 2  # parsing + fallback at minimum

        # First call: parsing
        _, op_id_1, stage_1 = calls[0][0]
        assert stage_1.stage == "parsing"
        assert op_id_1 == op_id

        # Last call: fallback
        _, op_id_last, stage_last = calls[-1][0]
        assert stage_last.stage == "fallback"
        assert stage_last.status == "fallback"
        assert op_id_last == op_id


@pytest.mark.asyncio
async def test_skill_dispatch_events_emitted(client: AsyncClient, auth_headers: dict):
    """$skill input should emit skill_dispatch + skill_execution events."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "$ask What is Python?", "ai_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        op_id = data["data"]["operation_id"]

        calls = mock_broadcast.call_args_list
        assert len(calls) >= 3  # parsing + skill_dispatch + skill_execution

        stages_seen = [c[0][2].stage for c in calls]

        # Parsing always first
        assert stages_seen[0] == "parsing"

        # Must have skill_dispatch and skill_execution
        assert "skill_dispatch" in stages_seen
        assert "skill_execution" in stages_seen

        # All calls must use the same operation_id
        for call in calls:
            assert call[0][1] == op_id

        # skill_dispatch metadata should contain the skill name
        dispatch_call = [c for c in calls if c[0][2].stage == "skill_dispatch"][0]
        assert dispatch_call[0][2].metadata == {"skill": "ask"}


@pytest.mark.asyncio
async def test_context_loading_events_emitted(
    client: AsyncClient, auth_headers: dict, db_session
):
    """@Server #Channel without a question should emit context_loading events."""
    server = Server(user_id=1, name="Math")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="Calculus")
    db_session.add(channel)
    await db_session.flush()
    note = Note(channel_id=channel.id, user_id=1, content="Limits and continuity")
    db_session.add(note)
    await db_session.flush()

    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "@Math #Calculus", "ai_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        op_id = data["data"]["operation_id"]

        calls = mock_broadcast.call_args_list
        stages_seen = [c[0][2].stage for c in calls]

        # parsing + context_loading in_progress + context_loading completed
        assert "parsing" in stages_seen
        assert "context_loading" in stages_seen

        # Must have both in_progress and completed for context_loading
        ctx_calls = [c for c in calls if c[0][2].stage == "context_loading"]
        statuses = [c[0][2].status for c in ctx_calls]
        assert "in_progress" in statuses
        assert "completed" in statuses

        # All calls use the same operation_id
        for call in calls:
            assert call[0][1] == op_id


@pytest.mark.asyncio
async def test_context_loading_failed_emits_failed_event(
    client: AsyncClient, auth_headers: dict
):
    """@NonExistentServer should emit context_loading with failed status."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "@NoSuchServer", "ai_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        op_id = data["data"]["operation_id"]

        calls = mock_broadcast.call_args_list
        ctx_calls = [c for c in calls if c[0][2].stage == "context_loading"]
        assert len(ctx_calls) >= 1

        # Last context_loading call should have failed status
        failed_call = ctx_calls[-1]
        assert failed_call[0][2].status == "failed"

        for call in calls:
            assert call[0][1] == op_id


@pytest.mark.asyncio
async def test_server_console_execute_emits_progress(
    client: AsyncClient, auth_headers: dict, db_session
):
    """Server-scoped console execute should also emit progress events."""
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            f"/api/server/{server.id}/console/execute",
            json={"input": "Server scoped note content"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "operation_id" in data["data"]
        uuid.UUID(data["data"]["operation_id"])
        op_id = data["data"]["operation_id"]

        # Must have at least parsing event
        assert mock_broadcast.call_count >= 1

        stages = [c[0][2].stage for c in mock_broadcast.call_args_list]
        assert "parsing" in stages

        for call in mock_broadcast.call_args_list:
            assert call[0][1] == op_id


@pytest.mark.asyncio
async def test_operation_id_consistent_across_all_events(client: AsyncClient, auth_headers: dict):
    """All progress events in a single request must share the same operation_id."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        response = await client.post(
            "/api/console/execute",
            json={"input": "Regular note about machine learning"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        response_op_id = data["data"]["operation_id"]

        # All WS events must share the same operation_id
        for call in mock_broadcast.call_args_list:
            assert call[0][1] == response_op_id

        # Each call must receive a valid AiProgressStage
        for call in mock_broadcast.call_args_list:
            stage_arg = call[0][2]
            assert isinstance(stage_arg, AiProgressStage)
            assert stage_arg.message != ""


@pytest.mark.asyncio
async def test_parsing_event_has_duration_ms(client: AsyncClient, auth_headers: dict):
    """Parsing event must include a non-None duration_ms field."""
    with patch("app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock) as mock_broadcast:
        await client.post(
            "/api/console/execute",
            json={"input": "/stats"},
            headers=auth_headers,
        )
        # First call is parsing event
        first_call = mock_broadcast.call_args_list[0]
        stage_arg = first_call[0][2]
        assert isinstance(stage_arg.duration_ms, int)
        assert stage_arg.duration_ms >= 0


@pytest.mark.asyncio
async def test_clear_command_returns_operation_id(client: AsyncClient, auth_headers: dict):
    """/clear command response must include operation_id."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "/clear"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "operation_id" in data["data"]
    uuid.UUID(data["data"]["operation_id"])


@pytest.mark.asyncio
async def test_unknown_command_returns_operation_id(client: AsyncClient, auth_headers: dict):
    """Unknown /command response must include operation_id."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "/unknown_cmd"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert "operation_id" in data["data"]
    uuid.UUID(data["data"]["operation_id"])
