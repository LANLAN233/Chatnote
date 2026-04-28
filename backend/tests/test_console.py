import pytest
from httpx import AsyncClient

from app.models.models import Channel, ConsoleMessage, ConsoleSession, Note, Server


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


@pytest.mark.asyncio
async def test_server_console_help(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    response = await client.post(
        f"/api/server/{server.id}/console/execute",
        json={"input": "/help"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "text"
    assert "help" in data["data"]["content"].lower()


@pytest.mark.asyncio
async def test_server_console_note_input(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    response = await client.post(
        f"/api/server/{server.id}/console/execute",
        json={"input": "Server scoped note about calculus"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"]
    assert data["data"]["server_id"] == server.id


@pytest.mark.asyncio
async def test_server_console_skill_without_api_key(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="TestServer")
    db_session.add(server)
    await db_session.flush()

    response = await client.post(
        f"/api/server/{server.id}/console/execute",
        json={"input": "$ask hello", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["type"] == "error"
    assert "api key" in data["data"]["content"].lower() or "model" in data["data"]["content"].lower()


# ---------------------------------------------------------------------------
# Console Session tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_console_session_crud(client: AsyncClient, auth_headers: dict):
    # Create session
    response = await client.post(
        "/api/console/sessions",
        json={"title": "Test Session"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    session_id = data["data"]["id"]
    assert data["data"]["title"] == "Test Session"

    # List sessions
    response = await client.get("/api/console/sessions", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]) >= 1

    # Get session
    response = await client.get(f"/api/console/sessions/{session_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["id"] == session_id

    # Update session
    response = await client.put(
        f"/api/console/sessions/{session_id}",
        json={"title": "Updated Title"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["title"] == "Updated Title"

    # Delete session
    response = await client.delete(f"/api/console/sessions/{session_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Verify deleted
    response = await client.get(f"/api/console/sessions/{session_id}", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_console_execute_with_session(client: AsyncClient, auth_headers: dict, db_session):
    # Create a session first
    response = await client.post(
        "/api/console/sessions",
        json={"title": "Execute Session"},
        headers=auth_headers,
    )
    session_id = response.json()["data"]["id"]

    # Execute with session_id
    response = await client.post(
        "/api/console/execute",
        json={"input": "/help", "session_id": session_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["session_id"] == session_id

    # Verify messages were saved
    response = await client.get(f"/api/console/sessions/{session_id}", headers=auth_headers)
    data = response.json()
    messages = data["data"]["messages"]
    assert len(messages) == 2  # user input + assistant response
    assert messages[0]["role"] == "user"
    assert messages[0]["content"] == "/help"
    assert messages[1]["role"] == "assistant"
    assert "help" in messages[1]["content"].lower()


@pytest.mark.asyncio
async def test_console_execute_creates_default_session(client: AsyncClient, auth_headers: dict):
    # Execute without session_id should auto-create a session
    response = await client.post(
        "/api/console/execute",
        json={"input": "/stats"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "session_id" in data["data"]
    session_id = data["data"]["session_id"]
    assert isinstance(session_id, int)


@pytest.mark.asyncio
async def test_console_clear_clears_session_messages(client: AsyncClient, auth_headers: dict, db_session):
    # Create session and add messages
    response = await client.post(
        "/api/console/sessions",
        json={"title": "Clear Session"},
        headers=auth_headers,
    )
    session_id = response.json()["data"]["id"]

    await client.post(
        "/api/console/execute",
        json={"input": "/stats", "session_id": session_id},
        headers=auth_headers,
    )

    # Clear
    response = await client.post(
        "/api/console/execute",
        json={"input": "/clear", "session_id": session_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["type"] == "clear"

    # Verify messages cleared (only system message remains)
    response = await client.get(f"/api/console/sessions/{session_id}", headers=auth_headers)
    messages = response.json()["data"]["messages"]
    assert len(messages) == 1
    assert messages[0]["role"] == "system"


@pytest.mark.asyncio
async def test_server_console_with_session(client: AsyncClient, auth_headers: dict, db_session):
    server = Server(user_id=1, name="SessionServer")
    db_session.add(server)
    await db_session.flush()

    response = await client.post(
        "/api/console/sessions",
        json={"title": "Server Session", "server_id": server.id},
        headers=auth_headers,
    )
    session_id = response.json()["data"]["id"]

    response = await client.post(
        f"/api/server/{server.id}/console/execute",
        json={"input": "Server note", "session_id": session_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["session_id"] == session_id
    assert data["data"]["server_id"] == server.id
