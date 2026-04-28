import pytest


@pytest.mark.asyncio
async def test_create_channel(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Test Server"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    response = await client.post(
        f"/api/servers/{server_id}/channels",
        json={"name": "Test Channel", "description": "A test channel"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["name"] == "Test Channel"
    assert data["data"]["server_id"] == server_id


@pytest.mark.asyncio
async def test_list_channels(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    await client.post(f"/api/servers/{server_id}/channels", json={"name": "Ch1"}, headers=auth_headers)
    await client.post(f"/api/servers/{server_id}/channels", json={"name": "Ch2"}, headers=auth_headers)
    response = await client.get(f"/api/servers/{server_id}/channels", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    # Server creation auto-creates a primary "General" channel
    assert len(data["data"]) == 3


@pytest.mark.asyncio
async def test_update_channel(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Old Channel"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    response = await client.put(
        f"/api/servers/{server_id}/channels/{channel_id}",
        json={"name": "New Channel"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "New Channel"


@pytest.mark.asyncio
async def test_delete_channel(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "To Delete"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]
    response = await client.delete(
        f"/api/servers/{server_id}/channels/{channel_id}", headers=auth_headers
    )
    assert response.status_code == 200