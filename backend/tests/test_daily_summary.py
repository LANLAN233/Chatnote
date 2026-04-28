import pytest
from datetime import date, timedelta, datetime
from httpx import AsyncClient

from app.models.models import Channel, Note, Server


@pytest.mark.asyncio
async def test_daily_summary_no_notes(client: AsyncClient, auth_headers: dict):
    response = await client.get("/api/daily-summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "summary" in data["data"]
    assert "keywords" in data["data"]
    assert "total_notes" in data["data"]


@pytest.mark.asyncio
async def test_daily_summary_with_notes(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="Math")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="Calculus")
    db_session.add(channel)
    await db_session.flush()

    yesterday = date.today() - timedelta(days=1)

    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Learned about limits and continuity in calculus today",
        created_at=datetime(yesterday.year, yesterday.month, yesterday.day, 10, 0, 0),
    )
    db_session.add(note)
    await db_session.flush()

    response = await client.get("/api/daily-summary", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["total_notes"] >= 1


@pytest.mark.asyncio
async def test_daily_summary_specific_date(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="Physics")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="Mechanics")
    db_session.add(channel)
    await db_session.flush()

    target_date = date(2026, 4, 20)
    note = Note(
        channel_id=channel.id,
        user_id=1,
        content="Newton's laws are fundamental to classical mechanics",
        created_at=datetime(target_date.year, target_date.month, target_date.day, 14, 0, 0),
    )
    db_session.add(note)
    await db_session.flush()

    response = await client.get(
        f"/api/daily-summary?date={target_date.isoformat()}",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["total_notes"] >= 1


@pytest.mark.asyncio
async def test_daily_summary_invalid_date(client: AsyncClient, auth_headers: dict):
    response = await client.get("/api/daily-summary?date=not-a-date", headers=auth_headers)
    assert response.status_code == 400
