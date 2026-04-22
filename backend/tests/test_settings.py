import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_get_settings(client: AsyncClient, auth_headers: dict):
    response = await client.get("/api/settings/me", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "username" in data["data"]
    assert "theme" in data["data"]
    assert "notifications_enabled" in data["data"]


@pytest.mark.asyncio
async def test_update_settings(client: AsyncClient, auth_headers: dict):
    response = await client.put(
        "/api/settings/me",
        headers=auth_headers,
        json={
            "theme": "light",
            "notifications_enabled": False,
            "preferred_llm": "openai",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["theme"] == "light"
    assert data["data"]["notifications_enabled"] is False
    assert data["data"]["preferred_llm"] == "openai"

    # Verify persistence
    response = await client.get("/api/settings/me", headers=auth_headers)
    data = response.json()
    assert data["data"]["theme"] == "light"
    assert data["data"]["notifications_enabled"] is False


@pytest.mark.asyncio
async def test_update_settings_partial(client: AsyncClient, auth_headers: dict):
    response = await client.put(
        "/api/settings/me",
        headers=auth_headers,
        json={"theme": "dark"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["theme"] == "dark"


@pytest.mark.asyncio
async def test_update_settings_unauthorized(client: AsyncClient):
    response = await client.put("/api/settings/me", json={"theme": "light"})
    assert response.status_code == 401
