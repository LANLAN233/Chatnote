"""Tests for the two-stage ensemble classification pipeline."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.classification import (
    ClassificationResult,
    EnsembleResult,
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


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_high_confidence_returns_fast_only(monkeypatch):
    """When fast model confidence >= 0.85, skip strong model entirely."""
    fast_result = _make_classification(confidence=0.92)
    fast_agent = _make_mock_agent(fast_result)
    mock_model = MagicMock()

    async def _fake_get_model_by_tier(user_id, db, tier):
        if tier == "fast":
            return mock_model
        return MagicMock()  # should not be called

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

    result = await classify_note_ensemble(
        "矩阵特征值计算", AsyncMock(), 1
    )

    assert result["suggested_server"] == "数学"
    assert result["suggested_channel"] == "线性代数"
    assert result["confidence"] == 0.92
    assert result["ai_reviewed"] is False
    assert result["ensemble_consistency"] is None
    assert result["fast_confidence"] == 0.92
    assert result["strong_confidence"] is None


@pytest.mark.asyncio
async def test_low_confidence_triggers_dual_model(monkeypatch):
    """When fast confidence < 0.85, run strong model and mark reviewed."""
    fast_result = _make_classification(confidence=0.6)
    strong_result = _make_classification(confidence=0.75)

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)
    mock_fast = MagicMock()
    mock_strong = MagicMock()

    async def _fake_get_model_by_tier(user_id, db, tier):
        if tier == "fast":
            return mock_fast
        return mock_strong

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

    result = await classify_note_ensemble(
        "一些模糊的笔记内容", AsyncMock(), 1
    )

    # Both agents were called
    assert len(agent_calls) == 2
    assert result["ai_reviewed"] is True
    assert result["fast_confidence"] == 0.6
    assert result["strong_confidence"] == 0.75
    assert result["confidence"] == 0.75  # max of fast (0.6) and strong (0.75)


@pytest.mark.asyncio
async def test_ensemble_consistency_match(monkeypatch):
    """When fast and strong agree on server+channel, mark 一致."""
    fast_result = _make_classification(
        suggested_server="计算机", suggested_channel="算法", confidence=0.55
    )
    strong_result = _make_classification(
        suggested_server="计算机", suggested_channel="算法", confidence=0.88
    )

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)

    async def _fake_get_model_by_tier(user_id, db, tier):
        return MagicMock()

    async def _fake_structure(db, user_id):
        return "Server [计算机]: channels [算法, 数据结构]"

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

    result = await classify_note_ensemble(
        "快速排序实现", AsyncMock(), 1
    )

    assert result["suggested_server"] == "计算机"
    assert result["suggested_channel"] == "算法"
    assert result["ensemble_consistency"] == "一致"
    assert result["ai_reviewed"] is True
    assert result["confidence"] == 0.88  # max(0.55, 0.88)
    assert result["fast_confidence"] == 0.55
    assert result["strong_confidence"] == 0.88


@pytest.mark.asyncio
async def test_ensemble_consistency_mismatch(monkeypatch):
    """When fast and strong disagree, use strong result with warning."""
    fast_result = _make_classification(
        suggested_server="数学",
        suggested_channel="微积分",
        confidence=0.6,
        summary="微积分习题",
    )
    strong_result = _make_classification(
        suggested_server="物理",
        suggested_channel="力学",
        confidence=0.7,
        summary="力学公式推导",
    )

    fast_agent = _make_mock_agent(fast_result)
    strong_agent = _make_mock_agent(strong_result)

    async def _fake_get_model_by_tier(user_id, db, tier):
        return MagicMock()

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

    result = await classify_note_ensemble(
        "牛顿定律和运动方程", AsyncMock(), 1
    )

    assert result["suggested_server"] == "物理"
    assert result["suggested_channel"] == "力学"
    assert result["ensemble_consistency"] == "不一致"
    assert "建议人工确认" in result["summary"]
    assert result["ai_reviewed"] is True


@pytest.mark.asyncio
async def test_fallback_when_no_api_key(monkeypatch):
    """When get_model_by_tier returns None, fall back to single-model."""
    async def _fake_get_model_by_tier(user_id, db, tier):
        return None

    async def _fake_classify_note(content, db, user_id, model=None):
        return {
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.3,
            "tags": [],
            "summary": "fallback summary",
            "is_new_server": True,
            "is_new_channel": True,
        }

    monkeypatch.setattr(
        "app.ai.models.get_model_by_tier", _fake_get_model_by_tier
    )
    monkeypatch.setattr(
        "app.ai.classification.classify_note", _fake_classify_note
    )

    result = await classify_note_ensemble(
        "any content", AsyncMock(), 1
    )

    assert result["suggested_server"] == "General"
    assert result["confidence"] == 0.3
    assert result["summary"] == "fallback summary"


@pytest.mark.asyncio
async def test_ensemble_result_model_validation():
    """EnsembleResult Pydantic model validates correctly."""
    result = EnsembleResult(
        suggested_server="数学",
        suggested_channel="线性代数",
        confidence=0.9,
        tags=["特征值", "矩阵"],
        summary="线性代数笔记",
        is_new_server=False,
        is_new_channel=False,
        ai_reviewed=False,
        ensemble_consistency=None,
        fast_confidence=0.92,
        strong_confidence=None,
    )
    assert result.ai_reviewed is False
    assert result.ensemble_consistency is None
    assert result.strong_confidence is None

    # With ensemble fields set
    result2 = EnsembleResult(
        suggested_server="物理",
        suggested_channel="力学",
        confidence=0.7,
        tags=["牛顿"],
        summary="力学 [建议人工确认]",
        is_new_server=True,
        is_new_channel=False,
        ai_reviewed=True,
        ensemble_consistency="不一致",
        fast_confidence=0.55,
        strong_confidence=0.7,
    )
    assert result2.ensemble_consistency == "不一致"
    assert result2.ai_reviewed is True
    assert result2.strong_confidence == 0.7


@pytest.mark.asyncio
async def test_strong_model_fails_uses_fast_result(monkeypatch):
    """When strong model raises during classification, return fast result."""
    fast_result = _make_classification(confidence=0.5, summary="快速分类")
    fast_agent = _make_mock_agent(fast_result)

    async def _fake_get_model_by_tier(user_id, db, tier):
        return MagicMock()

    async def _fake_structure(db, user_id):
        return "No servers yet"

    # Fast works, strong fails
    class _StrongAgent:
        arun = AsyncMock(side_effect=RuntimeError("API error"))

    agents = iter([fast_agent, _StrongAgent()])
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

    result = await classify_note_ensemble(
        "test content", AsyncMock(), 1
    )

    assert result["suggested_server"] == "数学"
    assert result["summary"] == "快速分类"
    assert result["ai_reviewed"] is True
    assert result["fast_confidence"] == 0.5
    assert result["strong_confidence"] is None
