import pytest


@pytest.mark.asyncio
async def test_create_thread_default_title(client, auth_headers):
    """Create a thread from a note with default title (first 20 chars + 的讨论串)."""
    # Setup: create server, channel, note
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "This is a long note content for thread testing"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]

    # Create thread without providing a title
    response = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["parent_note_id"] == note_id
    assert data["data"]["channel_id"] == channel_id
    # Default title: first 20 chars + "的讨论串"
    assert data["data"]["title"] == "This is a long note 的讨论串"
    assert data["message"] == "Thread created"


@pytest.mark.asyncio
async def test_create_thread_custom_title(client, auth_headers):
    """Create a thread from a note with a custom title."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Some content"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]

    response = await client.post(
        f"/api/notes/{note_id}/thread",
        json={"title": "My Custom Thread"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["title"] == "My Custom Thread"


@pytest.mark.asyncio
async def test_create_thread_sets_parent_thread_id(client, auth_headers):
    """Creating a thread should set thread_id on the parent note."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Thread parent note"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]

    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    # Fetch the parent note and verify thread_id is set
    note_get = await client.get(f"/api/notes/{note_id}", headers=auth_headers)
    assert note_get.status_code == 200
    assert note_get.json()["data"]["thread_id"] == thread_id


@pytest.mark.asyncio
async def test_create_thread_note_not_found(client, auth_headers):
    """Creating a thread for a non-existent note returns 404."""
    response = await client.post(
        "/api/notes/99999/thread",
        json={},
        headers=auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"] == "Note not found"


@pytest.mark.asyncio
async def test_create_thread_note_not_owned(client, auth_headers):
    """Creating a thread for another user's note returns 404."""
    # Create note as user A
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "My note"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]

    # Register user B
    reg_resp = await client.post(
        "/api/auth/register",
        json={"username": "otheruser", "password": "testpass456", "display_name": "Other"},
    )
    token_b = reg_resp.json()["data"]["token"]["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # User B tries to create a thread on user A's note
    response = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=headers_b,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_thread_with_messages(client, auth_headers):
    """Get a thread returns thread data with its messages."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Parent note for thread"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]

    # Create thread
    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={"title": "Discussion"},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    # Post a message to the thread
    await client.post(
        f"/api/threads/{thread_id}/messages",
        json={"content": "First reply"},
        headers=auth_headers,
    )
    await client.post(
        f"/api/threads/{thread_id}/messages",
        json={"content": "Second reply"},
        headers=auth_headers,
    )

    # Get the thread
    response = await client.get(f"/api/threads/{thread_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["id"] == thread_id
    assert data["data"]["title"] == "Discussion"
    assert data["data"]["parent_note_id"] == note_id
    assert data["data"]["channel_id"] == channel_id
    messages = data["data"]["messages"]
    # Parent note (with thread_id set) is included + 2 replies = 3 total
    assert len(messages) == 3
    # Verify both replies are present
    contents = [m["content"] for m in messages]
    assert "First reply" in contents
    assert "Second reply" in contents
    assert "Parent note for thread" in contents


@pytest.mark.asyncio
async def test_get_thread_not_found(client, auth_headers):
    """Getting a non-existent thread returns 404."""
    response = await client.get("/api/threads/99999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_thread_not_owned(client, auth_headers):
    """User B cannot access user A's thread."""
    # Setup: user A creates a thread
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "User A note"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]
    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    # Register user B
    reg_resp = await client.post(
        "/api/auth/register",
        json={"username": "otheruser2", "password": "testpass789", "display_name": "Other2"},
    )
    token_b = reg_resp.json()["data"]["token"]["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    response = await client.get(f"/api/threads/{thread_id}", headers=headers_b)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_thread_title(client, auth_headers):
    """Update a thread's title."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Thread parent"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]
    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    response = await client.put(
        f"/api/threads/{thread_id}",
        json={"title": "Renamed Thread"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["title"] == "Renamed Thread"
    assert data["message"] == "Thread updated"


@pytest.mark.asyncio
async def test_update_thread_not_found(client, auth_headers):
    """Updating a non-existent thread returns 404."""
    response = await client.put(
        "/api/threads/99999",
        json={"title": "Nope"},
        headers=auth_headers,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_post_thread_message(client, auth_headers):
    """Post a message to a thread."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Parent note"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]
    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    response = await client.post(
        f"/api/threads/{thread_id}/messages",
        json={"content": "Hello from the thread!"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["content"] == "Hello from the thread!"
    assert data["data"]["channel_id"] == channel_id
    assert data["data"]["thread_id"] == thread_id
    assert data["data"]["content_type"] == "markdown"
    assert data["message"] == "Message posted to thread"


@pytest.mark.asyncio
async def test_post_thread_message_empty_content(client, auth_headers):
    """Posting an empty message to a thread returns 422."""
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Parent note"},
        headers=auth_headers,
    )
    note_id = note_resp.json()["data"]["id"]
    thread_resp = await client.post(
        f"/api/notes/{note_id}/thread",
        json={},
        headers=auth_headers,
    )
    thread_id = thread_resp.json()["data"]["id"]

    response = await client.post(
        f"/api/threads/{thread_id}/messages",
        json={"content": ""},
        headers=auth_headers,
    )
    assert response.status_code == 422
