import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_inbox_crud(client: AsyncClient, auth_headers: dict):
    # Create inbox item
    response = await client.post(
        "/api/inbox",
        json={"content": "Test inbox note about calculus"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    item_id = data["data"]["id"]
    assert data["data"]["content"] == "Test inbox note about calculus"
    assert data["data"]["status"] == "pending"

    # List inbox
    response = await client.get("/api/inbox?status=pending", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]) >= 1

    # Get single item
    response = await client.get(f"/api/inbox/{item_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["id"] == item_id

    # Update item
    response = await client.put(
        f"/api/inbox/{item_id}",
        json={"ai_suggested_server": "Math", "ai_confidence": 0.95},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["ai_suggested_server"] == "Math"
    assert data["data"]["ai_confidence"] == 0.95

    # Delete item
    response = await client.delete(f"/api/inbox/{item_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Verify deleted
    response = await client.get(f"/api/inbox/{item_id}", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_inbox_archive_to_existing(client: AsyncClient, auth_headers: dict, db_session):
    from app.models.models import Server, Channel

    server = Server(user_id=1, name="ArchiveServer")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="ArchiveChannel")
    db_session.add(channel)
    await db_session.flush()

    # Create inbox item
    response = await client.post(
        "/api/inbox",
        json={"content": "Archive me"},
        headers=auth_headers,
    )
    item_id = response.json()["data"]["id"]

    # Archive to existing server/channel
    response = await client.post(
        f"/api/inbox/{item_id}/archive",
        json={"server_id": server.id, "channel_id": channel.id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"]
    assert data["data"]["server_id"] == server.id
    assert data["data"]["channel_id"] == channel.id


@pytest.mark.asyncio
async def test_inbox_archive_create_server(client: AsyncClient, auth_headers: dict):
    # Create inbox item
    response = await client.post(
        "/api/inbox",
        json={"content": "Create new server from inbox"},
        headers=auth_headers,
    )
    item_id = response.json()["data"]["id"]

    # Archive with create_server_name
    response = await client.post(
        f"/api/inbox/{item_id}/archive",
        json={"create_server_name": "NewInboxServer", "create_channel_name": "Main"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"]


@pytest.mark.asyncio
async def test_inbox_ai_suggest(client: AsyncClient, auth_headers: dict):
    # Create inbox item
    response = await client.post(
        "/api/inbox",
        json={"content": "Today I learned about limits and continuity in calculus class"},
        headers=auth_headers,
    )
    item_id = response.json()["data"]["id"]

    # AI suggest
    response = await client.post(
        f"/api/inbox/{item_id}/ai-suggest",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    result = data["data"]
    assert "ai_suggested_server" in result
    assert "ai_confidence" in result


@pytest.mark.asyncio
async def test_stats_includes_inbox_count(client: AsyncClient, auth_headers: dict):
    # Create a pending inbox item
    await client.post(
        "/api/inbox",
        json={"content": "Pending item for stats"},
        headers=auth_headers,
    )

    response = await client.get("/api/stats", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "inbox_pending_count" in data["data"]
    assert data["data"]["inbox_pending_count"] >= 1
    assert "study_streak" in data["data"]
    assert "weekly_trend" in data["data"]
    assert "server_distribution" in data["data"]
    assert "top_tags" in data["data"]
    assert "yesterday_notes" in data["data"]
