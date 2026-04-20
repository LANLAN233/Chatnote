import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models.models import Channel, Note, Server


@pytest.mark.asyncio
async def test_ai_classify(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/ai/classify",
        json={"content": "Today I learned about limits and continuity in calculus class"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    result = data["data"]
    assert "suggested_server" in result
    assert "suggested_channel" in result
    assert "confidence" in result
    assert "tags" in result
    assert "summary" in result


@pytest.mark.asyncio
async def test_smart_create_note(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/notes/smart-create",
        json={
            "content": "Today I learned about Python decorators",
            "auto_classify": True,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"]
    assert "server_id" in data["data"]
    assert "channel_id" in data["data"]


@pytest.mark.asyncio
async def test_smart_create_with_syntax(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/notes/smart-create",
        json={
            "content": "@Physics #Mechanics Newton's laws are fundamental",
            "auto_classify": False,
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["note"]["content"] == "Newton's laws are fundamental"


@pytest.mark.asyncio
async def test_stats_endpoint(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="TestChannel")
    db_session.add(channel)
    await db_session.flush()
    note = Note(channel_id=channel.id, user_id=1, content="test note")
    db_session.add(note)
    await db_session.flush()

    response = await client.get("/api/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["total_servers"] >= 1
    assert data["data"]["total_channels"] >= 1
    assert data["data"]["total_notes"] >= 1
    assert len(data["data"]["recent_notes"]) >= 1
