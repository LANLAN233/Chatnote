"""Tests for WebSocket progress events during ensemble classification."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.classification import (
    ClassificationResult,
    classify_note_ensemble,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_mock_agent(output: ClassificationResult) -> MagicMock:
    """Create a mock Agno Agent whose .arun() returns the given output."""

    class _FakeResponse:
        content = output

    agent = MagicMock()
    agent.arun = AsyncMock(return_value=_FakeResponse())
    return agent


def _make_classification(**overrides) -> ClassificationResult:
    defaults = {
        "suggested_server": "数学",
        "suggested_channel": "线性代数",
        "confidence": 0.9,
        "tags": ["特征值", "矩阵"],
        "summary": "线性代数笔记",
        "is_new_server": False,
        "is_new_channel": False,
    }
    defaults.update(overrides)
    return ClassificationResult(**defaults)


def _make_mock_model(model_id: str = "deepseek-chat") -> MagicMock:
    """Create a mock OpenAIChat with an .id attribute."""
    model = MagicMock()
    model.id = model_id
    return model


# ---------------------------------------------------------------------------
# Tests: progress events emitted
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_high_confidence_emits_fast_only_events(monkeypatch):
    """When fast model confidence >= 0.85, emit fast start/complete + classification_complete."""
    fast_result = _make_classification(confidence=0.92)
    fast_agent = _make_mock_agent(fast_result)
    fast_model = _make_mock_model("deepseek-chat")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        return fast_model

    async def _fake_structure(db, user_id):
        return "Server [数学]: channels [线性代数]"

    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure", _fake_structure
    )
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent",
        lambda model: fast_agent,
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "矩阵特征值计算", AsyncMock(), user_id=1, operation_id="op_001"
    )

    assert result["confidence"] == 0.92
    assert result["ai_reviewed"] is False

    assert len(broadcast_calls) == 3

    # Stage 1: fast_classification in_progress
    s1 = broadcast_calls[0]
    assert s1["stage"] == "fast_classification"
    assert s1["status"] == "in_progress"
    assert s1["model"] == "deepseek-chat"
    assert s1["tier"] == "fast"

    # Stage 2: fast_classification completed
    s2 = broadcast_calls[1]
    assert s2["stage"] == "fast_classification"
    assert s2["status"] == "completed"
    assert s2["model"] == "deepseek-chat"
    assert s2["tier"] == "fast"
    assert s2["metadata"]["confidence"] == 0.92
    assert s2["metadata"]["server"] == "数学"
    assert s2["metadata"]["channel"] == "线性代数"
    assert s2["duration_ms"] is not None

    # Stage 3: classification_complete
    s3 = broadcast_calls[2]
    assert s3["stage"] == "classification_complete"
    assert s3["status"] == "completed"


@pytest.mark.asyncio
async def test_low_confidence_emits_fast_and_strong_events(monkeypatch):
    """When fast confidence < 0.85, emit fast + strong + classification_complete events."""
    fast_result = _make_classification(confidence=0.6, suggested_server="数学")
    strong_result = _make_classification(
        confidence=0.75, suggested_server="数学", suggested_channel="线性代数"
    )

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)
    fast_model = _make_mock_model("qwen-turbo")
    strong_model = _make_mock_model("qwen-max")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        if tier == "fast":
            return fast_model
        return strong_model

    async def _fake_structure(db, user_id):
        return "Server [数学]: channels [线性代数]"

    agent_calls = []

    def _fake_create_agent(model):
        agent_calls.append(model)
        if len(agent_calls) == 1:
            return fast_agent
        return strong_agent

    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure", _fake_structure
    )
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent", _fake_create_agent
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "模糊笔记", AsyncMock(), user_id=1, operation_id="op_002"
    )

    assert result["ai_reviewed"] is True
    assert len(agent_calls) == 2
    assert len(broadcast_calls) == 5

    # Stage 1: fast_classification in_progress (fast model)
    s1 = broadcast_calls[0]
    assert s1["stage"] == "fast_classification"
    assert s1["status"] == "in_progress"
    assert s1["model"] == "qwen-turbo"
    assert s1["tier"] == "fast"

    # Stage 2: fast_classification completed
    s2 = broadcast_calls[1]
    assert s2["stage"] == "fast_classification"
    assert s2["status"] == "completed"
    assert s2["model"] == "qwen-turbo"
    assert s2["metadata"]["confidence"] == 0.6

    # Stage 3: strong_review in_progress
    s3 = broadcast_calls[2]
    assert s3["stage"] == "strong_review"
    assert s3["status"] == "in_progress"
    assert s3["model"] == "qwen-max"
    assert s3["tier"] == "strong"

    # Stage 4: strong_review completed
    s4 = broadcast_calls[3]
    assert s4["stage"] == "strong_review"
    assert s4["status"] == "completed"
    assert s4["model"] == "qwen-max"
    assert s4["metadata"]["confidence"] == 0.75
    assert s4["duration_ms"] is not None

    # Stage 5: classification_complete
    s5 = broadcast_calls[4]
    assert s5["stage"] == "classification_complete"
    assert s5["status"] == "completed"


@pytest.mark.asyncio
async def test_no_events_when_operation_id_is_none(monkeypatch):
    """When operation_id is None, no progress events are emitted."""
    fast_result = _make_classification(confidence=0.92)
    fast_agent = _make_mock_agent(fast_result)
    fast_model = _make_mock_model("deepseek-chat")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        return fast_model

    async def _fake_structure(db, user_id):
        return "Server [数学]: channels [线性代数]"

    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure", _fake_structure
    )
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent",
        lambda model: fast_agent,
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "矩阵特征值计算", AsyncMock(), user_id=1
        # operation_id intentionally omitted → None
    )

    assert result["confidence"] == 0.92
    assert len(broadcast_calls) == 0


@pytest.mark.asyncio
async def test_strong_review_consistency_metadata(monkeypatch):
    """When strong review completes, metadata includes confidence and consistency."""
    fast_result = _make_classification(
        confidence=0.5, suggested_server="计算机", suggested_channel="算法"
    )
    strong_result = _make_classification(
        confidence=0.88, suggested_server="计算机", suggested_channel="算法"
    )

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)
    fast_model = _make_mock_model("glm-4-flash")
    strong_model = _make_mock_model("glm-4-plus")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        return fast_model if tier == "fast" else strong_model

    async def _fake_structure(db, user_id):
        return "Server [计算机]: channels [算法]"

    agents = iter([fast_agent, strong_agent])
    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure", _fake_structure
    )
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent",
        lambda model: next(agents),
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "快速排序实现", AsyncMock(), user_id=1, operation_id="op_003"
    )

    assert result["ensemble_consistency"] == "一致"

    # strong_review completed (index 3: fast in_progress=0, fast completed=1, strong in_progress=2, strong completed=3)
    s4 = broadcast_calls[3]
    assert s4["stage"] == "strong_review"
    assert s4["status"] == "completed"
    assert s4["metadata"]["confidence"] == 0.88
    assert s4["metadata"]["consistency"] == "一致"


@pytest.mark.asyncio
async def test_strong_review_disagreement_metadata(monkeypatch):
    """When strong review disagrees with fast model, metadata shows 不一致."""
    fast_result = _make_classification(
        confidence=0.6,
        suggested_server="数学",
        suggested_channel="微积分",
        summary="微积分习题",
    )
    strong_result = _make_classification(
        confidence=0.7,
        suggested_server="物理",
        suggested_channel="力学",
        summary="力学公式推导",
    )

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)
    fast_model = _make_mock_model("qwen-turbo")
    strong_model = _make_mock_model("qwen-max")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        return fast_model if tier == "fast" else strong_model

    async def _fake_structure(db, user_id):
        return "Server [数学]: channels [微积分]\nServer [物理]: channels [力学]"

    agents = iter([fast_agent, strong_agent])
    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure", _fake_structure
    )
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent",
        lambda model: next(agents),
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "牛顿定律和运动方程", AsyncMock(), user_id=1, operation_id="op_004"
    )

    assert result["ensemble_consistency"] == "不一致"

    s4 = broadcast_calls[3]
    assert s4["stage"] == "strong_review"
    assert s4["status"] == "completed"
    assert s4["metadata"]["confidence"] == 0.7
    assert s4["metadata"]["consistency"] == "不一致"


@pytest.mark.asyncio
async def test_fast_classification_failed_emitted(monkeypatch):
    """When fast classification raises, emit a failed event before falling back."""
    fast_model = _make_mock_model("qwen-turbo")

    broadcast_calls: list = []

    async def _fake_broadcast_ai_progress(user_id, operation_id, stage_data):
        broadcast_calls.append(stage_data.model_dump())

    async def _fake_get_model_by_tier(user_id, db, tier):
        return fast_model

    async def _fake_classify_note(content, db, user_id, model=None):
        return {
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.3,
            "tags": [],
            "summary": "fallback",
            "is_new_server": True,
            "is_new_channel": True,
        }

    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    # create_classifier_agent returns a dummy that won't be exercised
    # because _get_existing_structure raises first
    monkeypatch.setattr(
        "app.ai.classification.create_classifier_agent",
        lambda _m: MagicMock(),
    )
    monkeypatch.setattr(
        "app.ai.classification._get_existing_structure",
        AsyncMock(side_effect=RuntimeError("API timeout")),
    )
    monkeypatch.setattr(
        "app.ai.classification.classify_note",
        _fake_classify_note,
    )
    monkeypatch.setattr(
        "app.services.websocket.manager.broadcast_ai_progress",
        _fake_broadcast_ai_progress,
    )

    result = await classify_note_ensemble(
        "test", AsyncMock(), user_id=1, operation_id="op_fail"
    )

    assert result["suggested_server"] == "General"
    assert len(broadcast_calls) == 2

    # fast_classification in_progress
    assert broadcast_calls[0]["stage"] == "fast_classification"
    assert broadcast_calls[0]["status"] == "in_progress"

    # fast_classification failed
    assert broadcast_calls[1]["stage"] == "fast_classification"
    assert broadcast_calls[1]["status"] == "failed"
    assert broadcast_calls[1]["model"] == "qwen-turbo"
    assert "API timeout" in broadcast_calls[1]["message"]
    assert broadcast_calls[1]["duration_ms"] is not None
