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


@pytest.mark.asyncio
async def test_create_duplicate_channel_name(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    await client.post(f"/api/servers/{server_id}/channels", json={"name": "Duplicate"}, headers=auth_headers)
    response = await client.post(f"/api/servers/{server_id}/channels", json={"name": "Duplicate"}, headers=auth_headers)
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_duplicate_channel_name(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    await client.post(f"/api/servers/{server_id}/channels", json={"name": "Alpha"}, headers=auth_headers)
    ch_resp = await client.post(f"/api/servers/{server_id}/channels", json={"name": "Beta"}, headers=auth_headers)
    channel_id = ch_resp.json()["data"]["id"]
    response = await client.put(
        f"/api/servers/{server_id}/channels/{channel_id}", json={"name": "Alpha"}, headers=auth_headers
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_create_duplicate_channel_name_case_insensitive(client, auth_headers):
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    # Primary channel is auto-created as "General"
    response = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "general"}, headers=auth_headers
    )
    assert response.status_code == 409
    assert "already exists" in response.json()["detail"]


@pytest.mark.asyncio
async def test_same_name_across_servers_allowed(client, auth_headers):
    s1 = await client.post("/api/servers", json={"name": "Srv1"}, headers=auth_headers)
    s2 = await client.post("/api/servers", json={"name": "Srv2"}, headers=auth_headers)
    server1_id = s1.json()["data"]["id"]
    server2_id = s2.json()["data"]["id"]
    r1 = await client.post(f"/api/servers/{server1_id}/channels", json={"name": "Shared"}, headers=auth_headers)
    r2 = await client.post(f"/api/servers/{server2_id}/channels", json={"name": "Shared"}, headers=auth_headers)
    assert r1.status_code == 201
    assert r2.status_code == 201