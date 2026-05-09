from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.models.models import DailySummary, User


@pytest.mark.asyncio
async def test_daily_summary_creation(db_session):
    """Test creating a DailySummary with all fields populated."""
    user = User(username="test_ds_user", hashed_password="hash123", display_name="DS User")
    db_session.add(user)
    await db_session.flush()

    summary = DailySummary(
        user_id=user.id,
        date=date.today(),
        summary="Today was a productive day. Learned about SQLAlchemy models.",
        keywords='["python", "sqlalchemy", "database"]',
        total_notes=5,
        highlight_note_id=42,
        stages='[{"stage": "planning", "duration": 30}, {"stage": "coding", "duration": 120}]',
        is_edited=False,
    )
    db_session.add(summary)
    await db_session.flush()

    assert summary.id is not None
    assert summary.user_id == user.id
    assert summary.date == date.today()
    assert "productive day" in summary.summary
    assert summary.keywords == '["python", "sqlalchemy", "database"]'
    assert summary.total_notes == 5
    assert summary.highlight_note_id == 42
    assert summary.stages is not None
    assert summary.is_edited is False
    assert summary.created_at is not None
    assert summary.updated_at is not None


@pytest.mark.asyncio
async def test_daily_summary_unique_constraint(db_session):
    """Test that UniqueConstraint on (user_id, date) is enforced."""
    user = User(username="ds_unique_user", hashed_password="hash456", display_name="Unique User")
    db_session.add(user)
    await db_session.flush()

    today = date.today()
    summary1 = DailySummary(
        user_id=user.id,
        date=today,
        summary="First summary for today.",
        total_notes=3,
    )
    db_session.add(summary1)
    await db_session.flush()

    # Attempt to create a second summary for the same user + date
    summary2 = DailySummary(
        user_id=user.id,
        date=today,
        summary="Second summary for today - should fail.",
        total_notes=5,
    )
    db_session.add(summary2)
    with pytest.raises(IntegrityError):
        await db_session.flush()

    # Clean up: rollback the second insert to avoid messing up the session
    await db_session.rollback()


@pytest.mark.asyncio
async def test_daily_summary_user_relationship(db_session):
    """Test the relationship between User and DailySummary."""
    user = User(username="ds_rel_user", hashed_password="hash789", display_name="Rel User")
    db_session.add(user)
    await db_session.flush()

    summary = DailySummary(
        user_id=user.id,
        date=date.today(),
        summary="Summary with relationship test.",
        total_notes=2,
    )
    db_session.add(summary)
    await db_session.flush()

    # Refresh to load relationship
    await db_session.refresh(user, ["daily_summaries"])

    assert len(user.daily_summaries) == 1
    assert user.daily_summaries[0].id == summary.id
    assert user.daily_summaries[0].user_id == user.id

    # Test back-reference from summary to user
    assert summary.user is not None
    assert summary.user.username == "ds_rel_user"
