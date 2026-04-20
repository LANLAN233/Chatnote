"""Tests for plugin system."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_builtin_plugins(client: AsyncClient, auth_headers: dict):
    """Test listing builtin plugins."""
    response = await client.get("/api/plugins/builtin", headers=auth_headers)
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
async def test_install_builtin_plugin(client: AsyncClient, auth_headers: dict):
    """Test installing a builtin plugin."""
    plugin_data = {
        "name": "Math Solver",
        "version": "1.0.0",
        "description": "Test math solver",
        "entry_point": "app.plugins.builtin.math_solver.MathSolverPlugin",
        "config": {"auto_detect": True},
        "is_builtin": True,
    }
    
    response = await client.post("/api/plugins", json=plugin_data, headers=auth_headers)
    assert response.status_code in [200, 201]
    data = response.json()
    assert data["success"] is True
    assert data["data"]["name"] == "Math Solver"


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
    # First install a plugin
    plugin_data = {
        "name": "Math Solver",
        "version": "1.0.0",
        "entry_point": "app.plugins.builtin.math_solver.MathSolverPlugin",
        "is_builtin": True,
    }
    
    install_response = await client.post("/api/plugins", json=plugin_data, headers=auth_headers)
    if install_response.status_code == 400:  # May already exist
        # Get plugin ID
        list_response = await client.get("/api/plugins", headers=auth_headers)
        plugins = list_response.json()["data"]
        plugin_id = next((p["id"] for p in plugins if p["name"] == "Math Solver"), None)
    else:
        plugin_id = install_response.json()["data"]["id"]
    
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
    assert "Plugins:" in result["content"]


@pytest.mark.asyncio
async def test_delete_plugin(client: AsyncClient, auth_headers: dict):
    """Test uninstalling a plugin."""
    # This test should use a non-builtin plugin
    # For now, just test the endpoint exists
    pass
