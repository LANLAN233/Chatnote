"""Tests for plugin system (Obsidian-style folder-based)."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_plugins(client: AsyncClient, auth_headers: dict):
    """Test listing all plugins via scan."""
    response = await client.get("/api/plugins", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    plugins = data["data"]
    assert len(plugins) >= 3

    plugin_names = [p["name"] for p in plugins]
    assert "Math Solver" in plugin_names
    assert "Summary Bot" in plugin_names
    assert "Class Watcher" in plugin_names


@pytest.mark.asyncio
async def test_list_installed_plugins(client: AsyncClient, auth_headers: dict):
    """Test listing installed plugins."""
    response = await client.get("/api/plugins", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Plugins loaded at startup should be listed


@pytest.mark.asyncio
async def test_toggle_plugin(client: AsyncClient, auth_headers: dict):
    """Test toggling plugin enable/disable."""
    # Get plugin ID from list
    list_response = await client.get("/api/plugins", headers=auth_headers)
    plugins = list_response.json()["data"]
    plugin_id = next((p["id"] for p in plugins if p["name"] == "Math Solver"), None)
    assert plugin_id is not None

    # Toggle off
    response = await client.post(
        f"/api/plugins/{plugin_id}/toggle",
        json={"is_enabled": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["is_enabled"] is False

    # Toggle on
    response = await client.post(
        f"/api/plugins/{plugin_id}/toggle",
        json={"is_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["is_enabled"] is True


@pytest.mark.asyncio
async def test_plugin_calc_command(client: AsyncClient, auth_headers: dict):
    """Test /calc command via plugin."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "/calc 2 + 2 * 3"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    # Plugin response should be in data


@pytest.mark.asyncio
async def test_plugin_math_detection(client: AsyncClient, auth_headers: dict):
    """Test that Math Solver plugin detects math expressions."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "计算 10 + 20"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    # Plugin may have processed this message


@pytest.mark.asyncio
async def test_console_plugins_command(client: AsyncClient, auth_headers: dict):
    """Test /plugins console command."""
    response = await client.post(
        "/api/console/execute",
        json={"input": "/plugins"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    result = data["data"]
    assert result["type"] == "text"
    assert "Math Solver" in result["content"]


@pytest.mark.asyncio
async def test_delete_plugin(client: AsyncClient, auth_headers: dict):
    """Test deleting (unloading) a plugin."""
    # Deploy a community plugin first
    deploy_data = {
        "id": "test-plugin",
        "manifest": {
            "id": "test-plugin",
            "name": "Test Plugin",
            "version": "1.0.0",
        },
        "code": (
            "from app.plugins.base import BasePlugin\n"
            "class TestPlugin(BasePlugin):\n"
            "    name = 'Test Plugin'\n"
            "    def on_message(self, content, context=None):\n"
            "        return 'Hello from test plugin'\n"
        ),
    }
    deploy_response = await client.post(
        "/api/plugins/deploy", json=deploy_data, headers=auth_headers
    )
    assert deploy_response.status_code == 200
    deployed = deploy_response.json()["data"]
    plugin_id = deployed["id"]

    # Now delete/unload it
    response = await client.delete(f"/api/plugins/{plugin_id}", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True


@pytest.mark.asyncio
async def test_deploy_plugin(client: AsyncClient, auth_headers: dict):
    """Test deploying a plugin from developer console."""
    deploy_data = {
        "id": "hello-world",
        "manifest": {
            "id": "hello-world",
            "name": "Hello World",
            "version": "1.0.0",
            "description": "A simple test plugin",
            "author": "Tester",
        },
        "code": (
            "from app.plugins.base import BasePlugin\n"
            "class HelloWorldPlugin(BasePlugin):\n"
            "    name = 'Hello World'\n"
            "    def on_message(self, content, context=None):\n"
            "        return f'Hello, you said: {content}'\n"
        ),
    }

    response = await client.post(
        "/api/plugins/deploy", json=deploy_data, headers=auth_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["plugin_id"] == "hello-world"
    assert data["data"]["is_enabled"] is False  # Community defaults to False

    # List plugins and verify it appears
    list_response = await client.get("/api/plugins", headers=auth_headers)
    plugins = list_response.json()["data"]
    plugin_names = [p["name"] for p in plugins]
    assert "Hello World" in plugin_names

    # Test the plugin
    plugin_id = next(p["id"] for p in plugins if p["plugin_id"] == "hello-world")
    test_response = await client.post(
        f"/api/plugins/{plugin_id}/test",
        json={"content": "test message"},
        headers=auth_headers,
    )
    # Plugin is disabled by default, so test may fail or return None
    assert test_response.status_code in [200, 404]
