"""Tests for query skill progress events via WebSocket."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.query import QuerySkill
from app.models.models import Channel, Note, Server
from app.schemas.ai_progress import AiProgressStage
from app.services.websocket import ConnectionManager


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

class MockWebSocket:
    """Tracks all messages sent via send_json."""

    def __init__(self):
        self.sent_messages: list[dict] = []

    async def accept(self):
        pass

    async def send_json(self, message):
        self.sent_messages.append(message)


def _make_mock_model(model_id: str = "mock-model") -> MagicMock:
    """Create a mock OpenAIChat-compatible object with an id attribute."""
    model = MagicMock()
    model.id = model_id
    return model


def _make_mock_agent_response(content: str) -> MagicMock:
    """Create a mock Agno agent response with .content attribute."""
    resp = MagicMock()
    resp.content = content
    return resp


def _make_skill_context_with_ws(
    db: AsyncSession,
    user_id: int = 1,
    server_context: dict | None = None,
    ws_manager: ConnectionManager | None = None,
    operation_id: str | None = None,
) -> SkillContext:
    """Create a SkillContext with WebSocket support for testing."""
    return SkillContext(
        user_id=user_id,
        db=db,
        model=_make_mock_model("default-model"),
        server_context=server_context,
        ws_manager=ws_manager,
        operation_id=operation_id,
    )


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
            agent = MagicMock()
            agent.arun = AsyncMock(return_value=_make_mock_agent_response("[]"))
            return agent
        return _make_mock_agent(responses[idx])

    return _create_agent


def _make_mock_agent(response: MagicMock) -> MagicMock:
    """Create a mock Agent that returns the given response on arun()."""
    agent = MagicMock()
    agent.arun = AsyncMock(return_value=response)
    return agent


# ---------------------------------------------------------------------------
# Test: progress events emitted in correct order
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_progress_events(db_session: AsyncSession):
    """Verify 4 progress events emitted during query execution in correct order."""
    # Setup: server + channel + notes
    server = Server(user_id=1, name="ProgressTest")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="TestChannel")
    db_session.add(channel)
    await db_session.flush()

    for i in range(8):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"Note {i}: This is about machine learning {i}.",
        )
        db_session.add(note)
    await db_session.flush()

    # Setup: WebSocket manager with mock websocket
    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    skill = QuerySkill()
    ctx = _make_skill_context_with_ws(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
            "channel_id": channel.id,
            "channel_name": channel.name,
        },
        ws_manager=manager,
        operation_id="test_op_123",
    )

    # Mock model responses
    retrieval_response = _make_mock_agent_response("[0, 2, 4]")
    answer_response = _make_mock_agent_response(
        "Machine learning is a subset of artificial intelligence."
    )

    fast_model = _make_mock_model("fast-model-v1")
    strong_model = _make_mock_model("strong-model-v2")

    # Patch both Agent class and get_model_by_tier
    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ), patch(
        "app.ai.skills.builtin.query.get_model_by_tier",
        side_effect=[fast_model, strong_model],
    ):
        result = await skill.execute("What is machine learning?", ctx)

    # Verify the query still produces correct output
    assert result.type == "output"
    assert "machine learning" in result.content.lower() or "Machine learning" in result.content

    # Verify WebSocket messages
    sent = mock_ws.sent_messages
    assert len(sent) == 4, f"Expected 4 progress events, got {len(sent)}"

    # All messages should have the correct type
    for msg in sent:
        assert msg["type"] == "ai_progress"
        assert msg["data"]["operation_id"] == "test_op_123"

    # Extract AiProgressStage from each event
    stages = [msg["data"]["stages"][0] for msg in sent]

    # — Event 1: retrieval in_progress —
    s0 = stages[0]
    assert s0["stage"] == "retrieval"
    assert s0["status"] == "in_progress"
    assert s0["model"] == ""
    assert s0["tier"] == "fast"
    assert s0["message"] == "Searching notes..."
    assert s0.get("duration_ms") is None

    # — Event 2: retrieval completed —
    s1 = stages[1]
    assert s1["stage"] == "retrieval"
    assert s1["status"] == "completed"
    assert s1["model"] == "fast-model-v1"
    assert s1["tier"] == "fast"
    assert s1["message"] == "Found 3 notes"
    assert s1["metadata"] is not None
    assert s1["metadata"]["notes_found"] == 3
    assert s1["duration_ms"] is not None
    assert isinstance(s1["duration_ms"], int)
    assert s1["duration_ms"] >= 0

    # — Event 3: answer_generation in_progress —
    s2 = stages[2]
    assert s2["stage"] == "answer_generation"
    assert s2["status"] == "in_progress"
    assert s2["model"] == "strong-model-v2"
    assert s2["tier"] == "strong"
    assert s2["message"] == "Generating answer..."
    assert s2.get("duration_ms") is None

    # — Event 4: answer_generation completed —
    s3 = stages[3]
    assert s3["stage"] == "answer_generation"
    assert s3["status"] == "completed"
    assert s3["message"] == "Answer ready"
    assert s3["duration_ms"] is not None
    assert isinstance(s3["duration_ms"], int)
    assert s3["duration_ms"] >= 0


# ---------------------------------------------------------------------------
# Test: no progress events without ws_manager
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_no_progress_without_ws_manager(db_session: AsyncSession):
    """No progress events are emitted when ws_manager is not set."""
    server = Server(user_id=1, name="NoWs")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Chan")
    db_session.add(channel)
    await db_session.flush()

    for i in range(3):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"Note {i}: test content.",
        )
        db_session.add(note)
    await db_session.flush()

    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    # Context WITHOUT ws_manager — should not emit progress
    ctx = _make_skill_context_with_ws(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
        },
        ws_manager=None,  # explicitly no ws_manager
        operation_id=None,
    )

    skill = QuerySkill()
    retrieval_response = _make_mock_agent_response("[0, 1]")
    answer_response = _make_mock_agent_response("Test answer.")

    fast_model = _make_mock_model("fast")
    strong_model = _make_mock_model("strong")

    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ), patch(
        "app.ai.skills.builtin.query.get_model_by_tier",
        side_effect=[fast_model, strong_model],
    ):
        result = await skill.execute("test?", ctx)

    # Query should still work
    assert result.type == "output"

    # But no progress events should be sent
    assert len(mock_ws.sent_messages) == 0, (
        f"Expected 0 progress events without ws_manager, got {len(mock_ws.sent_messages)}"
    )


# ---------------------------------------------------------------------------
# Test: no progress events without operation_id
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_no_progress_without_operation_id(db_session: AsyncSession):
    """No progress events are emitted when operation_id is not set."""
    server = Server(user_id=1, name="NoOp")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Chan")
    db_session.add(channel)
    await db_session.flush()

    for i in range(3):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"Note {i}: test content.",
        )
        db_session.add(note)
    await db_session.flush()

    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    # Context with ws_manager but WITHOUT operation_id
    ctx = _make_skill_context_with_ws(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
        },
        ws_manager=manager,
        operation_id=None,  # no operation_id
    )

    skill = QuerySkill()
    retrieval_response = _make_mock_agent_response("[0, 1]")
    answer_response = _make_mock_agent_response("Test answer.")

    fast_model = _make_mock_model("fast")
    strong_model = _make_mock_model("strong")

    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ), patch(
        "app.ai.skills.builtin.query.get_model_by_tier",
        side_effect=[fast_model, strong_model],
    ):
        result = await skill.execute("test?", ctx)

    # Query should still work
    assert result.type == "output"

    # But no progress events when operation_id is missing
    assert len(mock_ws.sent_messages) == 0, (
        f"Expected 0 progress events without operation_id, got {len(mock_ws.sent_messages)}"
    )


# ---------------------------------------------------------------------------
# Test: progress events with loaded_notes (notes deduplicated)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_query_skill_progress_with_loaded_notes(db_session: AsyncSession):
    """Verify notes_found reflects total after merging loaded_notes."""
    server = Server(user_id=1, name="LoadedNoteTest")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="Test")
    db_session.add(channel)
    await db_session.flush()

    for i in range(5):
        note = Note(
            channel_id=channel.id,
            user_id=1,
            content=f"DB Note {i}: content.",
        )
        db_session.add(note)
    await db_session.flush()

    manager = ConnectionManager()
    mock_ws = MockWebSocket()
    await manager.connect(mock_ws, user_id=1)

    ctx = _make_skill_context_with_ws(
        db_session,
        server_context={
            "server_id": server.id,
            "server_name": server.name,
        },
        ws_manager=manager,
        operation_id="op_loaded",
    )
    # Inject loaded_notes (simulating session context)
    ctx.loaded_notes = ["[Extra] Loaded note 1", "[Extra] Loaded note 2"]

    skill = QuerySkill()
    retrieval_response = _make_mock_agent_response("[0, 3]")
    answer_response = _make_mock_agent_response("Answer.")

    fast_model = _make_mock_model("fast")
    strong_model = _make_mock_model("strong")

    with patch(
        "app.ai.skills.builtin.query.Agent",
        side_effect=_make_sequential_agent(retrieval_response, answer_response),
    ), patch(
        "app.ai.skills.builtin.query.get_model_by_tier",
        side_effect=[fast_model, strong_model],
    ):
        result = await skill.execute("test?", ctx)

    assert result.type == "output"

    sent = mock_ws.sent_messages
    assert len(sent) == 4

    # Event 2 (retrieval completed) should show 2 notes found (top_notes count)
    s1 = sent[1]["data"]["stages"][0]
    assert s1["metadata"]["notes_found"] == 2
