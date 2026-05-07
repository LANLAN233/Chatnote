"""Tests for the three-stage daily summary pipeline."""

from datetime import date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.daily_summary import (
    ExtractedKnowledge,
    KeywordItem,
    KeywordMapping,
    PipelineResult,
    StructuredSummary,
    generate_daily_summary_pipeline,
)


# ── Helpers ─────────────────────────────────────────────────────────────────


def _make_note(note_id: int, content: str) -> SimpleNamespace:
    return SimpleNamespace(
        id=note_id,
        content=content,
        created_at=datetime(2026, 5, 6, 10, 0, 0),
    )


def _fake_db_with_notes(*notes) -> MagicMock:
    """Return a fake AsyncSession whose execute() returns the given notes."""
    db = MagicMock()

    class FakeScalarResult:
        def scalars(self):
            return self

        def all(self):
            return list(notes)

    db.execute = AsyncMock(return_value=FakeScalarResult())
    return db


def _fake_db_empty() -> MagicMock:
    """Return a fake AsyncSession whose execute() returns no notes."""
    db = MagicMock()

    class FakeScalarResult:
        def scalars(self):
            return self

        def all(self):
            return []

    db.execute = AsyncMock(return_value=FakeScalarResult())
    return db


# ── Mock agent helpers ──────────────────────────────────────────────────────


def _mock_agent_arun(output_content):
    """Create an AsyncMock that simulates agent.arun() returning the given content."""
    mock_response = MagicMock()
    mock_response.content = output_content
    mock_agent = MagicMock()
    mock_agent.arun = AsyncMock(return_value=mock_response)
    return mock_agent


# ── Stage output fixtures ───────────────────────────────────────────────────

STAGE1_OUTPUT = ExtractedKnowledge(
    concepts=["牛顿第二定律 F=ma", "力的合成与分解", "微积分基本定理"],
    total_notes_scanned=2,
)
STAGE2_OUTPUT = StructuredSummary(
    summary="今天学习了牛顿力学和微积分基础，掌握了F=ma和积分基本定理",
    highlight_note_id=1,
)
STAGE3_OUTPUT = KeywordMapping(
    keywords=[
        KeywordItem(keyword="牛顿第二定律", note_ids=[1]),
        KeywordItem(keyword="F=ma", note_ids=[1]),
        KeywordItem(keyword="微积分", note_ids=[2]),
        KeywordItem(keyword="积分基本定理", note_ids=[2]),
    ]
)


# ── Tests ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_pipeline_success_all_stages(monkeypatch):
    """Full pipeline succeeds: all three stages complete and return aggregated result."""
    import app.ai.daily_summary as ds_module

    notes = [
        _make_note(1, "牛顿第二定律 F=ma，力的合成与分解"),
        _make_note(2, "微积分基本定理：积分与导数的关系"),
    ]
    db = _fake_db_with_notes(*notes)

    # Mock get_model_by_tier to return a fake model object
    fake_model = SimpleNamespace()
    monkeypatch.setattr("app.ai.models.get_model_by_tier", AsyncMock(return_value=fake_model))

    # Mock the three stage-agent factories
    monkeypatch.setattr(
        ds_module,
        "_create_extraction_agent",
        lambda model: _mock_agent_arun(STAGE1_OUTPUT),
    )
    monkeypatch.setattr(
        ds_module,
        "_create_pipeline_summary_agent",
        lambda model: _mock_agent_arun(STAGE2_OUTPUT),
    )
    monkeypatch.setattr(
        ds_module,
        "_create_keyword_mapping_agent",
        lambda model: _mock_agent_arun(STAGE3_OUTPUT),
    )

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert result["total_notes"] == 2
    assert result["summary"] == STAGE2_OUTPUT.summary
    assert result["highlight_note_id"] == 1
    assert len(result["keywords"]) == 4
    assert result["keywords"][0]["keyword"] == "牛顿第二定律"
    assert result["keywords"][0]["note_ids"] == [1]
    assert len(result["stages"]) == 3
    for stage in result["stages"]:
        assert stage["status"] == "completed"
        assert "duration_ms" in stage
        assert stage["name"] in ("extraction", "summary", "keywords")


@pytest.mark.asyncio
async def test_pipeline_stage1_failure_fallback(monkeypatch):
    """Stage 1 failure → fallback to single-model generate_daily_summary."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Test note content")]
    db = _fake_db_with_notes(*notes)

    # Make get_model_by_tier raise an exception in Stage 1
    monkeypatch.setattr("app.ai.models.get_model_by_tier", AsyncMock(side_effect=RuntimeError("No model")))

    # Mock fallback function
    fallback_result = {
        "summary": "Fallback summary text",
        "keywords": [],
        "total_notes": 1,
        "highlight_note_id": 1,
    }
    monkeypatch.setattr(
        ds_module,
        "generate_daily_summary",
        AsyncMock(return_value=fallback_result),
    )

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert result["summary"] == "Fallback summary text"
    assert result["total_notes"] == 1
    assert "stages" in result
    # At least one stage should be marked as failed
    failed_stages = [s for s in result["stages"] if s["status"] == "failed"]
    assert len(failed_stages) >= 1


@pytest.mark.asyncio
async def test_pipeline_stage2_failure_fallback(monkeypatch):
    """Stage 2 failure → fallback to single-model generate_daily_summary."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Linear algebra: eigenvectors and eigenvalues")]
    db = _fake_db_with_notes(*notes)

    fake_model = SimpleNamespace()

    # get_model_by_tier succeeds first time, fails second time (Stage 2)
    call_count = [0]

    async def get_model_side_effect(user_id, db, tier):
        call_count[0] += 1
        if call_count[0] <= 1:
            return fake_model  # Stage 1 succeeds
        raise RuntimeError("Strong model unavailable")

    monkeypatch.setattr("app.ai.models.get_model_by_tier", get_model_side_effect)

    # Stage 1 agent works
    monkeypatch.setattr(
        ds_module,
        "_create_extraction_agent",
        lambda model: _mock_agent_arun(STAGE1_OUTPUT),
    )

    # Fallback
    fallback_result = {
        "summary": "Fallback after stage 2 failure",
        "keywords": [],
        "total_notes": 1,
        "highlight_note_id": None,
    }
    monkeypatch.setattr(
        ds_module,
        "generate_daily_summary",
        AsyncMock(return_value=fallback_result),
    )

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert result["summary"] == "Fallback after stage 2 failure"
    # Stage 1 should be completed, Stage 2 should be failed
    stages = result["stages"]
    assert len(stages) >= 2
    extraction_stage = next((s for s in stages if s["name"] == "extraction"), None)
    assert extraction_stage is not None
    assert extraction_stage["status"] == "completed"
    summary_stage = next((s for s in stages if s["name"] == "summary"), None)
    assert summary_stage is not None
    assert summary_stage["status"] == "failed"


@pytest.mark.asyncio
async def test_pipeline_stage3_failure_fallback(monkeypatch):
    """Stage 3 failure → fallback to single-model generate_daily_summary."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Database normalization forms")]
    db = _fake_db_with_notes(*notes)

    fake_model = SimpleNamespace()

    call_count = [0]

    async def get_model_side_effect(user_id, db, tier):
        call_count[0] += 1
        if call_count[0] <= 2:
            return fake_model  # Stage 1 and 2 succeed
        raise RuntimeError("Fast model unavailable for Stage 3")

    monkeypatch.setattr("app.ai.models.get_model_by_tier", get_model_side_effect)

    monkeypatch.setattr(
        ds_module,
        "_create_extraction_agent",
        lambda model: _mock_agent_arun(STAGE1_OUTPUT),
    )
    monkeypatch.setattr(
        ds_module,
        "_create_pipeline_summary_agent",
        lambda model: _mock_agent_arun(STAGE2_OUTPUT),
    )

    fallback_result = {
        "summary": "Fallback after stage 3 failure",
        "keywords": [],
        "total_notes": 1,
        "highlight_note_id": None,
    }
    monkeypatch.setattr(
        ds_module,
        "generate_daily_summary",
        AsyncMock(return_value=fallback_result),
    )

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert result["summary"] == "Fallback after stage 3 failure"
    stages = result["stages"]
    kw_stage = next((s for s in stages if s["name"] == "keywords"), None)
    assert kw_stage is not None
    assert kw_stage["status"] == "failed"


@pytest.mark.asyncio
async def test_pipeline_no_notes_early_return():
    """No notes → early return without invoking any models."""
    db = _fake_db_empty()

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert result["total_notes"] == 0
    assert result["highlight_note_id"] is None
    assert result["keywords"] == []
    assert result["stages"] == []
    assert "no notes" in result["summary"].lower() or "No notes" in result["summary"]


@pytest.mark.asyncio
async def test_pipeline_stages_have_correct_structure(monkeypatch):
    """Verify PipelineResult stages have proper structure (name, status, duration_ms)."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Rust ownership and borrowing")]
    db = _fake_db_with_notes(*notes)

    fake_model = SimpleNamespace()
    monkeypatch.setattr("app.ai.models.get_model_by_tier", AsyncMock(return_value=fake_model))
    monkeypatch.setattr(
        ds_module,
        "_create_extraction_agent",
        lambda model: _mock_agent_arun(STAGE1_OUTPUT),
    )
    monkeypatch.setattr(
        ds_module,
        "_create_pipeline_summary_agent",
        lambda model: _mock_agent_arun(STAGE2_OUTPUT),
    )
    monkeypatch.setattr(
        ds_module,
        "_create_keyword_mapping_agent",
        lambda model: _mock_agent_arun(STAGE3_OUTPUT),
    )

    result = await generate_daily_summary_pipeline(user_id=1, db=db)

    assert len(result["stages"]) == 3
    expected_names = {"extraction", "summary", "keywords"}
    for stage in result["stages"]:
        assert stage["name"] in expected_names
        assert stage["status"] == "completed"
        assert isinstance(stage["duration_ms"], int)
        assert stage["duration_ms"] >= 0
