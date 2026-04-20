import pytest


@pytest.mark.asyncio
async def test_create_note(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    response = await client.post(
        "/api/notes",
        json={"channel_id": channel_id, "content": "Hello world note"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["content"] == "Hello world note"


@pytest.mark.asyncio
async def test_list_notes(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "Note 1"}, headers=auth_headers
    )
    await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "Note 2"}, headers=auth_headers
    )
    response = await client.get(
        f"/api/channels/{channel_id}/notes", headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["total"] == 2


@pytest.mark.asyncio
async def test_update_note(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "Original"}, headers=auth_headers
    )
    note_id = note_resp.json()["data"]["id"]
    response = await client.put(
        f"/api/notes/{note_id}", json={"content": "Updated"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["data"]["content"] == "Updated"
    assert response.json()["data"]["is_edited"] is True


@pytest.mark.asyncio
async def test_delete_note(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    note_resp = await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "To delete"}, headers=auth_headers
    )
    note_id = note_resp.json()["data"]["id"]
    response = await client.delete(f"/api/notes/{note_id}", headers=auth_headers)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_search_notes(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "Python programming"}, headers=auth_headers
    )
    await client.post(
        "/api/notes", json={"channel_id": channel_id, "content": "Math calculus"}, headers=auth_headers
    )
    response = await client.get("/api/notes/search?q=Python", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) == 1
    assert data["data"][0]["content"] == "Python programming"


@pytest.mark.asyncio
async def test_note_pagination(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    for i in range(5):
        await client.post(
            "/api/notes",
            json={"channel_id": channel_id, "content": f"Note {i}"},
            headers=auth_headers,
        )
    response = await client.get(
        f"/api/channels/{channel_id}/notes?page=1&page_size=2",
        headers=auth_headers,
    )
    data = response.json()
    assert data["data"]["total"] == 5
    assert data["data"]["page"] == 1
    assert data["data"]["page_size"] == 2
    assert len(data["data"]["items"]) == 2