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


# ── Accumulation & cleanup tests (unit-level on ConnectionManager) ──


@pytest.mark.asyncio
async def test_accumulation_per_operation_id():
    """Two AiProgressStage with same operation_id accumulate in _operation_events."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressStage

    mgr = ConnectionManager()

    stage1 = AiProgressStage(
        stage="parsing",
        status="completed",
        model="gpt-4",
        tier="primary",
        message="Parsing done",
    )
    stage2 = AiProgressStage(
        stage="context_loading",
        status="in_progress",
        model="gpt-3.5",
        tier="secondary",
        message="Loading context...",
    )

    # First broadcast creates new event
    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        await mgr.broadcast_ai_progress(1, "op-123", stage1)

    assert "op-123" in mgr._operation_events
    evt1 = mgr._operation_events["op-123"]
    assert len(evt1.stages) == 1
    assert evt1.current_stage == 0
    assert evt1.stages[0].stage == "parsing"

    # Second broadcast accumulates
    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        await mgr.broadcast_ai_progress(1, "op-123", stage2)

    evt2 = mgr._operation_events["op-123"]
    assert len(evt2.stages) == 2
    assert evt2.current_stage == 1
    assert evt2.stages[0].stage == "parsing"
    assert evt2.stages[1].stage == "context_loading"
    assert evt2.overall_status == "in_progress"


@pytest.mark.asyncio
async def test_cleanup_operation_removes_entry():
    """cleanup_operation removes the entry from _operation_events."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressStage

    mgr = ConnectionManager()

    stage = AiProgressStage(
        stage="parsing",
        status="completed",
        model="gpt-4",
        tier="primary",
        message="Parsing done",
    )

    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        await mgr.broadcast_ai_progress(1, "op-456", stage)

    assert "op-456" in mgr._operation_events

    mgr.cleanup_operation("op-456")
    assert "op-456" not in mgr._operation_events

    # Cleanup on non-existent id should not raise
    mgr.cleanup_operation("nonexistent")


@pytest.mark.asyncio
async def test_direct_event_passthrough():
    """AiProgressEvent passed directly broadcasts as-is, no accumulation."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressEvent, AiProgressStage

    mgr = ConnectionManager()

    direct_event = AiProgressEvent(
        operation_id="op-789",
        stages=[
            AiProgressStage(
                stage="custom",
                status="completed",
                model="custom-model",
                tier="primary",
                message="Custom event",
            )
        ],
        current_stage=0,
        overall_status="completed",
    )

    with patch.object(mgr, "send_to_user", new_callable=AsyncMock) as mock_send:
        await mgr.broadcast_ai_progress(1, "op-789", direct_event)

    # Should NOT be stored in _operation_events
    assert "op-789" not in mgr._operation_events

    # Should have broadcast once
    mock_send.assert_called_once()
    call_args = mock_send.call_args[0]
    msg = call_args[1]
    assert msg["type"] == "ai_progress"
    assert msg["data"]["operation_id"] == "op-789"
    assert msg["data"]["stages"][0]["stage"] == "custom"


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


# ── Cleanup-after-execute tests ──


@pytest.mark.asyncio
async def test_cleanup_after_query_skill(client: AsyncClient, auth_headers: dict):
    """cleanup_operation must be called after $query skill dispatch completes."""
    with patch("app.routers.console.ws_manager.cleanup_operation") as mock_cleanup:
        response = await client.post(
            "/api/console/execute",
            json={"input": "$ask What is Python?", "ai_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        mock_cleanup.assert_called_once()
        args, _ = mock_cleanup.call_args
        assert len(args) == 1
        uuid.UUID(args[0])  # must be a valid UUID operation_id


@pytest.mark.asyncio
async def test_cleanup_after_server_query_skill(
    client: AsyncClient, auth_headers: dict, db_session,
):
    """cleanup_operation must be called in server_console_execute after $query."""
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    with patch("app.routers.console.ws_manager.cleanup_operation") as mock_cleanup:
        response = await client.post(
            f"/api/server/{server.id}/console/execute",
            json={"input": "$ask server query test", "ai_enabled": True},
            headers=auth_headers,
        )
        assert response.status_code == 200
        mock_cleanup.assert_called_once()
        args, _ = mock_cleanup.call_args
        assert len(args) == 1
        uuid.UUID(args[0])


@pytest.mark.asyncio
async def test_no_memory_leak_after_execute():
    """After cleanup_operation, _operation_events must be empty for that ID."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressStage

    mgr = ConnectionManager()

    stage1 = AiProgressStage(
        stage="parsing",
        status="completed",
        model="",
        tier="",
        message="Parsing done",
    )
    stage2 = AiProgressStage(
        stage="fallback",
        status="fallback",
        model="",
        tier="",
        message="Fallback",
    )

    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        await mgr.broadcast_ai_progress(1, "op-mem", stage1)
        await mgr.broadcast_ai_progress(1, "op-mem", stage2)

    assert "op-mem" in mgr._operation_events
    assert len(mgr._operation_events["op-mem"].stages) == 2

    mgr.cleanup_operation("op-mem")
    assert "op-mem" not in mgr._operation_events
    assert len(mgr._operation_events) == 0


# ── $query pipeline integration tests ──


@pytest.mark.asyncio
async def test_stage_accumulation_in_full_pipeline():
    """Simulate 4 $query stages (retrieval + answer_generation) accumulating."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressStage

    mgr = ConnectionManager()
    op_id = "query-pipeline-001"

    stages_data: list[tuple[str, str, str, str]] = [
        ("retrieval", "in_progress", "Searching notes...", "fast"),
        ("retrieval", "completed", "Found 5 relevant notes", "fast"),
        ("answer_generation", "in_progress", "Generating answer...", "strong"),
        ("answer_generation", "completed", "Answer ready", "strong"),
    ]

    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        for stage_name, status, msg, tier in stages_data:
            stage = AiProgressStage(
                stage=stage_name,
                status=status,
                model="gpt-4",
                tier=tier,
                message=msg,
            )
            await mgr.broadcast_ai_progress(1, op_id, stage)

    assert op_id in mgr._operation_events
    event = mgr._operation_events[op_id]
    assert len(event.stages) == 4

    # Verify stage names match the query skill's two-agent pipeline
    stage_names = [s.stage for s in event.stages]
    assert stage_names == [
        "retrieval",
        "retrieval",
        "answer_generation",
        "answer_generation",
    ]

    # Verify statuses cycle: in_progress → completed per agent
    statuses = [s.status for s in event.stages]
    assert statuses == ["in_progress", "completed", "in_progress", "completed"]

    # Overall status should be "completed" (last stage completed)
    assert event.overall_status == "completed"
    assert event.current_stage == 3


@pytest.mark.asyncio
async def test_query_skill_emits_two_agent_stages(
    client: AsyncClient, auth_headers: dict, db_session,
):
    """$query routing path must emit retrieval + answer_generation progress stages."""
    from app.schemas.ai_progress import AiProgressStage

    server = Server(user_id=1, name="QueryServer")
    db_session.add(server)
    await db_session.flush()

    with patch(
        "app.routers.console.ws_manager.broadcast_ai_progress", new_callable=AsyncMock
    ) as mock_broadcast:
        with patch(
            "app.routers.console._dispatch_skill", new_callable=AsyncMock
        ) as mock_dispatch:

            async def fake_dispatch(
                skill_name, skill_args, user_id, db,
                server_context=None, loaded_notes=None, operation_id=None,
            ):
                op_id = operation_id or "fake-op-id"
                # Emit the 4 stages the real $query skill broadcasts
                await mock_broadcast(
                    user_id, op_id,
                    AiProgressStage(
                        stage="retrieval", status="in_progress", model="",
                        tier="fast", message="Searching notes...",
                    ),
                )
                await mock_broadcast(
                    user_id, op_id,
                    AiProgressStage(
                        stage="retrieval", status="completed", model="mock-fast",
                        tier="fast", message="Found 3 notes", duration_ms=50,
                    ),
                )
                await mock_broadcast(
                    user_id, op_id,
                    AiProgressStage(
                        stage="answer_generation", status="in_progress",
                        model="mock-strong", tier="strong",
                        message="Generating answer...",
                    ),
                )
                await mock_broadcast(
                    user_id, op_id,
                    AiProgressStage(
                        stage="answer_generation", status="completed",
                        model="mock-strong", tier="strong", message="Answer ready",
                        duration_ms=100,
                    ),
                )
                return {"type": "output", "content": "Query complete.", "data": {}}

            mock_dispatch.side_effect = fake_dispatch

            response = await client.post(
                "/api/console/execute",
                json={
                    "input": "@QueryServer What is the meaning of testing?",
                    "ai_enabled": True,
                },
                headers=auth_headers,
            )

            assert response.status_code == 200

        # Collect all stage names from all broadcast calls
        stages = [call[0][2].stage for call in mock_broadcast.call_args_list]

        # Must include both agent stages from the $query skill
        assert "retrieval" in stages, f"Expected 'retrieval' in {stages}"
        assert "answer_generation" in stages, f"Expected 'answer_generation' in {stages}"

        # At least 2 calls per agent (in_progress + completed)
        retrieval_calls = [
            c for c in mock_broadcast.call_args_list
            if c[0][2].stage == "retrieval"
        ]
        assert len(retrieval_calls) >= 2, f"Need 2+ retrieval events, got {len(retrieval_calls)}"

        answer_calls = [
            c for c in mock_broadcast.call_args_list
            if c[0][2].stage == "answer_generation"
        ]
        assert len(answer_calls) >= 2, f"Need 2+ answer_generation events, got {len(answer_calls)}"


@pytest.mark.asyncio
async def test_cleanup_prevents_memory_leak():
    """cleanup_operation must prevent _operation_events from growing across many operations."""
    from app.services.websocket import ConnectionManager
    from app.schemas.ai_progress import AiProgressStage

    mgr = ConnectionManager()
    op_ids = ["op-alpha", "op-beta", "op-gamma"]

    # Broadcast 3 different operations
    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        for op_id in op_ids:
            stage = AiProgressStage(
                stage="parsing", status="completed", model="", tier="",
                message=f"Stage for {op_id}",
            )
            await mgr.broadcast_ai_progress(1, op_id, stage)

    # Verify 3 entries exist
    assert len(mgr._operation_events) == 3
    for op_id in op_ids:
        assert op_id in mgr._operation_events

    # Clean up each operation
    for op_id in op_ids:
        mgr.cleanup_operation(op_id)

    # _operation_events must be empty
    assert len(mgr._operation_events) == 0, (
        f"Expected empty _operation_events after cleanup, got {len(mgr._operation_events)} entries"
    )

    # Re-broadcast with same IDs — must NOT accumulate old data
    with patch.object(mgr, "send_to_user", new_callable=AsyncMock):
        for op_id in op_ids:
            stage = AiProgressStage(
                stage="parsing", status="completed", model="", tier="",
                message=f"Fresh stage for {op_id}",
            )
            await mgr.broadcast_ai_progress(1, op_id, stage)

    # Must still have exactly 3 fresh entries (not 6 accumulated)
    assert len(mgr._operation_events) == 3
    for op_id in op_ids:
        assert op_id in mgr._operation_events
        assert len(mgr._operation_events[op_id].stages) == 1, (
            f"Expected 1 fresh stage for {op_id}, got {len(mgr._operation_events[op_id].stages)}"
        )
