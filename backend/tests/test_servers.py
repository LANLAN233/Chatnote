import pytest


@pytest.mark.asyncio
async def test_create_server(client, auth_headers):
    response = await client.post(
        "/api/servers",
        json={"name": "Test Server", "description": "A test server"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["name"] == "Test Server"


@pytest.mark.asyncio
async def test_list_servers(client, auth_headers):
    await client.post("/api/servers", json={"name": "Server 1"}, headers=auth_headers)
    await client.post("/api/servers", json={"name": "Server 2"}, headers=auth_headers)
    response = await client.get("/api/servers", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert len(data["data"]) == 2


@pytest.mark.asyncio
async def test_get_server(client, auth_headers):
    create_resp = await client.post("/api/servers", json={"name": "Get Server"}, headers=auth_headers)
    server_id = create_resp.json()["data"]["id"]
    response = await client.get(f"/api/servers/{server_id}", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "Get Server"


@pytest.mark.asyncio
async def test_update_server(client, auth_headers):
    create_resp = await client.post("/api/servers", json={"name": "Old Name"}, headers=auth_headers)
    server_id = create_resp.json()["data"]["id"]
    response = await client.put(
        f"/api/servers/{server_id}",
        json={"name": "New Name"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json()["data"]["name"] == "New Name"


@pytest.mark.asyncio
async def test_delete_server(client, auth_headers):
    create_resp = await client.post("/api/servers", json={"name": "To Delete"}, headers=auth_headers)
    server_id = create_resp.json()["data"]["id"]
    response = await client.delete(f"/api/servers/{server_id}", headers=auth_headers)
    assert response.status_code == 200
    list_resp = await client.get("/api/servers", headers=auth_headers)
    assert len(list_resp.json()["data"]) == 0


@pytest.mark.asyncio
async def test_server_not_found(client, auth_headers):
    response = await client.get("/api/servers/9999", headers=auth_headers)
    assert response.status_code == 404