import pytest

from app.schemas.ai_progress import AiProgressEvent, AiProgressStage
from app.services.websocket import ConnectionManager


class MockWebSocket:
    def __init__(self):
        self.sent_messages: list[dict] = []

    async def accept(self):
        pass

    async def send_json(self, message):
        self.sent_messages.append(message)


@pytest.mark.asyncio
async def test_broadcast_ai_progress_with_stage():
    """Test broadcasting AI progress with a single AiProgressStage wraps it in an event."""
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    stage = AiProgressStage(
        stage="extract_knowledge",
        status="in_progress",
        model="gpt-4o",
        tier="primary",
        message="Extracting knowledge from notes...",
    )

    await manager.broadcast_ai_progress(
        user_id=1,
        operation_id="op_123",
        stage_data=stage,
    )

    assert len(mock_ws.sent_messages) == 1
    msg = mock_ws.sent_messages[0]
    assert msg["type"] == "ai_progress"
    assert msg["data"]["operation_id"] == "op_123"
    assert len(msg["data"]["stages"]) == 1
    assert msg["data"]["stages"][0]["stage"] == "extract_knowledge"
    assert msg["data"]["stages"][0]["status"] == "in_progress"
    assert msg["data"]["stages"][0]["model"] == "gpt-4o"
    assert msg["data"]["stages"][0]["tier"] == "primary"
    assert msg["data"]["current_stage"] == 0
    assert msg["data"]["overall_status"] == "in_progress"
    assert "timestamp" in msg
    assert msg["timestamp"] is not None


@pytest.mark.asyncio
async def test_broadcast_ai_progress_with_event():
    """Test broadcasting AI progress with a complete AiProgressEvent sends as-is."""
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    stages = [
        AiProgressStage(
            stage="extract_knowledge",
            status="completed",
            model="gpt-4o",
            tier="primary",
            message="Knowledge extracted successfully",
            duration_ms=1500,
        ),
        AiProgressStage(
            stage="generate_summary",
            status="in_progress",
            model="gpt-4o",
            tier="primary",
            message="Generating daily summary...",
        ),
    ]

    event = AiProgressEvent(
        operation_id="op_456",
        stages=stages,
        current_stage=1,
        overall_status="in_progress",
    )

    await manager.broadcast_ai_progress(
        user_id=1,
        operation_id="op_456",
        stage_data=event,
    )

    assert len(mock_ws.sent_messages) == 1
    msg = mock_ws.sent_messages[0]
    assert msg["type"] == "ai_progress"
    assert msg["data"]["operation_id"] == "op_456"
    assert len(msg["data"]["stages"]) == 2
    assert msg["data"]["current_stage"] == 1
    assert msg["data"]["stages"][0]["duration_ms"] == 1500
    assert msg["data"]["stages"][1]["stage"] == "generate_summary"
    assert msg["data"]["overall_status"] == "in_progress"


@pytest.mark.asyncio
async def test_broadcast_ai_progress_with_metadata():
    """Test that optional metadata field is transmitted correctly."""
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    stage = AiProgressStage(
        stage="fallback_action",
        status="fallback",
        model="gpt-4o-mini",
        tier="secondary",
        message="Using fallback model due to timeout",
        metadata={"reason": "Primary model timeout", "retry_count": 3},
    )

    await manager.broadcast_ai_progress(
        user_id=1,
        operation_id="op_789",
        stage_data=stage,
    )

    msg = mock_ws.sent_messages[0]
    stage_data = msg["data"]["stages"][0]
    assert stage_data["metadata"]["reason"] == "Primary model timeout"
    assert stage_data["metadata"]["retry_count"] == 3


@pytest.mark.asyncio
async def test_broadcast_ai_progress_failed_stage():
    """Test broadcasting a failed stage."""
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    stage = AiProgressStage(
        stage="classify_notes",
        status="failed",
        model="gpt-4o",
        tier="primary",
        message="Classification failed: rate limit exceeded",
        duration_ms=3200,
    )

    await manager.broadcast_ai_progress(
        user_id=1,
        operation_id="op_fail",
        stage_data=stage,
    )

    msg = mock_ws.sent_messages[0]
    assert msg["data"]["stages"][0]["status"] == "failed"
    assert msg["data"]["stages"][0]["duration_ms"] == 3200


@pytest.mark.asyncio
async def test_broadcast_ai_progress_no_connection():
    """Test that broadcast does not raise error when user has no active connections."""
    manager = ConnectionManager()

    stage = AiProgressStage(
        stage="test_stage",
        status="pending",
        model="gpt-4o",
        tier="primary",
        message="No one will receive this",
    )

    # Should not raise any exception
    await manager.broadcast_ai_progress(
        user_id=999,
        operation_id="op_no_conn",
        stage_data=stage,
    )


@pytest.mark.asyncio
async def test_broadcast_ai_progress_completed_operation():
    """Test broadcasting a fully completed operation."""
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    stages = [
        AiProgressStage(
            stage="extract_knowledge",
            status="completed",
            model="gpt-4o",
            tier="primary",
            message="Done",
            duration_ms=1200,
        ),
        AiProgressStage(
            stage="generate_summary",
            status="completed",
            model="gpt-4o",
            tier="primary",
            message="Done",
            duration_ms=800,
        ),
        AiProgressStage(
            stage="extract_keywords",
            status="completed",
            model="gpt-4o",
            tier="primary",
            message="Done",
            duration_ms=600,
        ),
    ]

    event = AiProgressEvent(
        operation_id="op_done",
        stages=stages,
        current_stage=2,
        overall_status="completed",
    )

    await manager.broadcast_ai_progress(
        user_id=1,
        operation_id="op_done",
        stage_data=event,
    )

    msg = mock_ws.sent_messages[0]
    assert msg["data"]["overall_status"] == "completed"
    assert len(msg["data"]["stages"]) == 3
    assert msg["data"]["current_stage"] == 2
