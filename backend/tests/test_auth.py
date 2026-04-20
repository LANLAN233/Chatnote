import pytest


@pytest.mark.asyncio
async def test_health_check(client):
    response = await client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_register(client):
    response = await client.post(
        "/api/auth/register",
        json={"username": "newuser", "password": "newpass123", "display_name": "New User"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["success"] is True
    assert data["data"]["user"]["username"] == "newuser"
    assert "access_token" in data["data"]["token"]


@pytest.mark.asyncio
async def test_register_duplicate(client):
    await client.post(
        "/api/auth/register",
        json={"username": "dupuser", "password": "testpass123"},
    )
    response = await client.post(
        "/api/auth/register",
        json={"username": "dupuser", "password": "testpass123"},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_login(client):
    await client.post(
        "/api/auth/register",
        json={"username": "loginuser", "password": "testpass123"},
    )
    response = await client.post(
        "/api/auth/login",
        json={"username": "loginuser", "password": "testpass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "access_token" in data["data"]["token"]


@pytest.mark.asyncio
async def test_login_wrong_password(client):
    await client.post(
        "/api/auth/register",
        json={"username": "wrongpw", "password": "testpass123"},
    )
    response = await client.post(
        "/api/auth/login",
        json={"username": "wrongpw", "password": "wrongpassword"},
    )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(client, auth_headers):
    response = await client.get("/api/auth/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["username"] == "testuser"


@pytest.mark.asyncio
async def test_get_me_unauthorized(client):
    response = await client.get("/api/auth/me")
    assert response.status_code == 401