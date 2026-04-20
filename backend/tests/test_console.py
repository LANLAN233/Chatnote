import pytest
from httpx import AsyncClient

from app.models.models import Channel, Note, Server


@pytest.mark.asyncio
async def test_console_help(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/help"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "text"
    assert "help" in data["data"]["content"].lower()


@pytest.mark.asyncio
async def test_console_clear(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/clear"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "clear"


@pytest.mark.asyncio
async def test_console_search(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="SearchServer")
    db_session.add(server)
    await db_session.flush()
    channel = Channel(server_id=server.id, name="SearchChannel")
    db_session.add(channel)
    await db_session.flush()
    note = Note(channel_id=channel.id, user_id=1, content="quantum mechanics wave function")
    db_session.add(note)
    await db_session.flush()

    response = await client.post(
        "/api/console/execute",
        json={"input": "/search quantum"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "text"
    assert "quantum" in data["data"]["content"].lower()


@pytest.mark.asyncio
async def test_console_todo(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/todo finish math homework"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "todo_created"


@pytest.mark.asyncio
async def test_console_today(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/today"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "text"


@pytest.mark.asyncio
async def test_console_stats(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/stats"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "text"
    assert "statistics" in data["data"]["content"].lower()


@pytest.mark.asyncio
async def test_console_unknown_command(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "/unknown_cmd"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "error"
    assert "unknown" in data["data"]["content"].lower()


@pytest.mark.asyncio
async def test_console_note_input(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/console/execute",
        json={"input": "This is a regular note about linear algebra"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"]
