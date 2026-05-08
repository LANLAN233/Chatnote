"""Tests for WebSocket progress events during daily summary pipeline generation."""

from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.ai.daily_summary import (
    ExtractedKnowledge,
    KeywordItem,
    KeywordMapping,
    StructuredSummary,
    generate_daily_summary_pipeline,
)
from app.schemas.ai_progress import AiProgressStage


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


def _mock_agent_arun(output_content):
    """Create an AsyncMock that simulates agent.arun() returning the given content."""
    mock_response = MagicMock()
    mock_response.content = output_content
    mock_agent = MagicMock()
    mock_agent.arun = AsyncMock(return_value=mock_response)
    return mock_agent


def _fake_model(model_id: str) -> SimpleNamespace:
    """Return a fake model object with a .id attribute."""
    return SimpleNamespace(id=model_id)


def _capture_broadcast_calls() -> tuple[AsyncMock, list]:
    """Create a mock for manager.broadcast_ai_progress that captures calls.

    Returns:
        (mock_async_fn, captured_args_list) — shared list reference.
    """
    captured: list[dict] = []

    async def _broadcast(user_id, operation_id, stage_data):
        captured.append({
            "user_id": user_id,
            "operation_id": operation_id,
            "stage": stage_data.stage,
            "status": stage_data.status,
            "model": stage_data.model,
            "tier": stage_data.tier,
            "message": stage_data.message,
            "duration_ms": stage_data.duration_ms,
        })

    mock = AsyncMock(side_effect=_broadcast)
    return mock, captured


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
async def test_ws_events_all_six_emitted(monkeypatch):
    """All three stages succeed → exactly 6 WS progress events emitted."""
    import app.ai.daily_summary as ds_module

    notes = [
        _make_note(1, "牛顿第二定律 F=ma，力的合成与分解"),
        _make_note(2, "微积分基本定理：积分与导数的关系"),
    ]
    db = _fake_db_with_notes(*notes)

    # Mock model tier with .id attributes
    fast_model = _fake_model("deepseek-chat")
    strong_model = _fake_model("deepseek-reasoner")
    fast_model2 = _fake_model("deepseek-chat")

    async def get_model_side_effect(user_id, db, tier):
        if tier == "fast":
            return fast_model if "Stage 1" not in str(db) else fast_model2
        return strong_model

    # Simple side effect: first two calls return fast, then strong, then fast
    call_count = [0]

    async def get_model_by_tier(user_id, db, tier):
        call_count[0] += 1
        if call_count[0] in (1, 3):
            return fast_model
        return strong_model

    monkeypatch.setattr("app.ai.models.get_model_by_tier", get_model_by_tier)

    # Mock agents
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

    # Mock the WS manager broadcast
    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    result = await generate_daily_summary_pipeline(
        user_id=1,
        db=db,
        operation_id="daily_summary_test_001",
    )

    # Verify HTTP response still includes stages
    assert len(result["stages"]) == 3
    assert result["total_notes"] == 2

    # Verify exactly 6 WS events
    assert len(captured) == 6, f"Expected 6 WS events, got {len(captured)}"

    # Event 0: extraction in_progress
    ev = captured[0]
    assert ev["stage"] == "extraction"
    assert ev["status"] == "in_progress"
    assert ev["tier"] == "fast"
    assert ev["duration_ms"] is None

    # Event 1: extraction completed
    ev = captured[1]
    assert ev["stage"] == "extraction"
    assert ev["status"] == "completed"
    assert ev["tier"] == "fast"
    assert ev["model"] == fast_model.id
    assert isinstance(ev["duration_ms"], int)
    assert ev["duration_ms"] >= 0

    # Event 2: summary in_progress
    ev = captured[2]
    assert ev["stage"] == "summary"
    assert ev["status"] == "in_progress"
    assert ev["tier"] == "strong"
    assert ev["duration_ms"] is None

    # Event 3: summary completed
    ev = captured[3]
    assert ev["stage"] == "summary"
    assert ev["status"] == "completed"
    assert ev["tier"] == "strong"
    assert ev["model"] == strong_model.id
    assert isinstance(ev["duration_ms"], int)
    assert ev["duration_ms"] >= 0

    # Event 4: keywords in_progress
    ev = captured[4]
    assert ev["stage"] == "keywords"
    assert ev["status"] == "in_progress"
    assert ev["tier"] == "fast"
    assert ev["duration_ms"] is None

    # Event 5: keywords completed
    ev = captured[5]
    assert ev["stage"] == "keywords"
    assert ev["status"] == "completed"
    assert ev["tier"] == "fast"
    assert ev["model"] == fast_model.id
    assert isinstance(ev["duration_ms"], int)
    assert ev["duration_ms"] >= 0

    # All events have the same operation_id
    for ev in captured:
        assert ev["operation_id"] == "daily_summary_test_001"
        assert ev["user_id"] == 1


@pytest.mark.asyncio
async def test_ws_events_correct_tiers(monkeypatch):
    """Verify the correct tier is emitted for each stage: fast → strong → fast."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Test note")]
    db = _fake_db_with_notes(*notes)

    fake_model = _fake_model("gpt-4o-mini")
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

    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    await generate_daily_summary_pipeline(
        user_id=1,
        db=db,
        operation_id="tier_test",
    )

    assert len(captured) == 6

    # in_progress events should have tier labels as model names
    assert captured[0]["tier"] == "fast"    # extraction in_progress
    assert captured[2]["tier"] == "strong"  # summary in_progress
    assert captured[4]["tier"] == "fast"    # keywords in_progress

    # completed events should have correct tiers
    assert captured[1]["tier"] == "fast"    # extraction completed
    assert captured[3]["tier"] == "strong"  # summary completed
    assert captured[5]["tier"] == "fast"    # keywords completed


@pytest.mark.asyncio
async def test_ws_events_not_emitted_without_operation_id(monkeypatch):
    """When operation_id is None, no WS events should be emitted."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Test note")]
    db = _fake_db_with_notes(*notes)

    fake_model = _fake_model("gpt-4o")
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

    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    # Call WITHOUT operation_id
    result = await generate_daily_summary_pipeline(
        user_id=1,
        db=db,
    )

    # WS should NOT be called
    assert len(captured) == 0, f"Expected 0 WS events without operation_id, got {len(captured)}"

    # But HTTP response should still work
    assert len(result["stages"]) == 3
    assert result["total_notes"] == 1


@pytest.mark.asyncio
async def test_ws_events_stage_failure_stops_events(monkeypatch):
    """When Stage 1 fails, only the in_progress event is emitted, no completed."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Test note")]
    db = _fake_db_with_notes(*notes)

    # Make Stage 1 fail
    monkeypatch.setattr("app.ai.models.get_model_by_tier", AsyncMock(side_effect=RuntimeError("No model")))

    fallback_result = {
        "summary": "Fallback summary",
        "keywords": [],
        "total_notes": 1,
        "highlight_note_id": None,
    }
    monkeypatch.setattr(
        ds_module,
        "generate_daily_summary",
        AsyncMock(return_value=fallback_result),
    )

    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    await generate_daily_summary_pipeline(
        user_id=1,
        db=db,
        operation_id="fail_test",
    )

    # Should have emitted extraction in_progress, but not completed
    assert len(captured) == 1, f"Expected 1 WS event (in_progress only), got {len(captured)}"
    assert captured[0]["stage"] == "extraction"
    assert captured[0]["status"] == "in_progress"


@pytest.mark.asyncio
async def test_ws_events_metadata_complete(monkeypatch):
    """Each WS event carries the correct metadata fields."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Test content here")]
    db = _fake_db_with_notes(*notes)

    fake_model = _fake_model("deepseek-chat")
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

    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    await generate_daily_summary_pipeline(
        user_id=42,
        db=db,
        operation_id="meta_test",
    )

    assert len(captured) == 6

    # Verify every event has required fields
    required_keys = {"stage", "status", "model", "tier", "message"}
    for ev in captured:
        assert required_keys.issubset(ev.keys()), f"Missing required keys in event: {ev}"
        assert ev["user_id"] == 42
        assert ev["operation_id"] == "meta_test"

    # In-progress events should not have duration_ms
    for i in (0, 2, 4):
        assert captured[i]["duration_ms"] is None, f"in_progress event {i} should not have duration_ms"

    # Completed events must have duration_ms
    for i in (1, 3, 5):
        assert isinstance(captured[i]["duration_ms"], int), f"completed event {i} must have duration_ms"
        assert captured[i]["duration_ms"] >= 0


@pytest.mark.asyncio
async def test_ws_events_preserve_existing_stages_response(monkeypatch):
    """Adding WS events does not change the existing HTTP response stages field."""
    import app.ai.daily_summary as ds_module

    notes = [_make_note(1, "Some learning note")]
    db = _fake_db_with_notes(*notes)

    fake_model = _fake_model("deepseek-chat")
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

    broadcast_mock, captured = _capture_broadcast_calls()
    monkeypatch.setattr(ds_module.manager, "broadcast_ai_progress", broadcast_mock)

    result = await generate_daily_summary_pipeline(
        user_id=1,
        db=db,
        operation_id="preserve_test",
    )

    # HTTP response stages remain unchanged in structure
    assert len(result["stages"]) == 3
    for stage in result["stages"]:
        assert stage["status"] == "completed"
        assert "duration_ms" in stage
        assert isinstance(stage["duration_ms"], int)
        assert stage["name"] in ("extraction", "summary", "keywords")

    # Original return fields preserved
    assert "summary" in result
    assert "keywords" in result
    assert "total_notes" in result
    assert "highlight_note_id" in result
