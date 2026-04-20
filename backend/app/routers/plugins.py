"""Plugin management API routes."""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Plugin, User
from app.plugins import PluginManager, plugin_manager
from app.schemas.schemas import (
    ApiResponse,
    PluginCreate,
    PluginResponse,
    PluginToggleRequest,
    PluginUpdate,
)
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


def _config_to_schema(config_list: list[dict[str, Any]] | None) -> str | None:
    """Convert config schema list to JSON string."""
    if config_list is None:
        return None
    return json.dumps(config_list)


def _schema_to_config(config_str: str | None) -> list[dict[str, Any]] | None:
    """Convert JSON string to config schema list."""
    if config_str is None:
        return None
    try:
        return json.loads(config_str)
    except json.JSONDecodeError:
        return None


def _config_to_dict(config_str: str | None) -> dict[str, Any] | None:
    """Convert JSON string to config dict."""
    if config_str is None:
        return None
    try:
        return json.loads(config_str)
    except json.JSONDecodeError:
        return None


def _dict_to_config(config_dict: dict[str, Any] | None) -> str | None:
    """Convert config dict to JSON string."""
    if config_dict is None:
        return None
    return json.dumps(config_dict)


@router.get("", response_model=ApiResponse)
async def list_plugins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get all installed plugins."""
    result = await db.execute(select(Plugin))
    plugins = result.scalars().all()

    plugin_responses = []
    for plugin in plugins:
        loaded = plugin_manager.get_plugin_by_id(plugin.id)
        plugin_responses.append({
            "id": plugin.id,
            "name": plugin.name,
            "version": plugin.version,
            "description": plugin.description,
            "author": plugin.author,
            "entry_point": plugin.entry_point,
            "config_schema": _schema_to_config(plugin.config_schema),
            "config": _config_to_dict(plugin.config),
            "is_enabled": plugin.is_enabled if loaded is None else loaded.enabled,
            "is_builtin": plugin.is_builtin,
            "installed_at": plugin.installed_at,
            "updated_at": plugin.updated_at,
        })

    return {"success": True, "data": plugin_responses}


@router.post("", response_model=ApiResponse)
async def create_plugin(
    plugin_data: PluginCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Install a new plugin."""
    # Validate entry point exists
    from app.plugins.runtime import PluginSandbox

    # Try to load the plugin
    success, error = plugin_manager.load_plugin_from_db(
        0, plugin_data.entry_point, plugin_data.config or {}
    )
    if not success:
        raise HTTPException(status_code=400, detail=f"Failed to load plugin: {error}")

    # Get plugin info from loaded instance
    loaded = plugin_manager.get_plugin(
        plugin_data.entry_point.split(".")[-1]
    ) or plugin_manager.get_plugin(plugin_data.name)

    # Create database record
    db_plugin = Plugin(
        name=plugin_data.name,
        version=plugin_data.version,
        description=plugin_data.description,
        author=plugin_data.author,
        entry_point=plugin_data.entry_point,
        config_schema=_config_to_schema(plugin_data.config_schema),
        config=_dict_to_config(plugin_data.config),
        is_builtin=plugin_data.is_builtin,
        is_enabled=True,
    )
    db.add(db_plugin)
    await db.commit()
    await db.refresh(db_plugin)

    # Reload with correct ID
    plugin_manager.unload_plugin(plugin_data.name)
    plugin_manager.load_plugin_from_db(db_plugin.id, plugin_data.entry_point, plugin_data.config or {})

    return {
        "success": True,
        "data": {
            "id": db_plugin.id,
            "name": db_plugin.name,
            "version": db_plugin.version,
            "description": db_plugin.description,
            "author": db_plugin.author,
            "entry_point": db_plugin.entry_point,
            "config_schema": _schema_to_config(db_plugin.config_schema),
            "config": _config_to_dict(db_plugin.config),
            "is_enabled": db_plugin.is_enabled,
            "is_builtin": db_plugin.is_builtin,
            "installed_at": db_plugin.installed_at,
            "updated_at": db_plugin.updated_at,
        },
        "message": "Plugin installed successfully",
    }


@router.get("/builtin", response_model=ApiResponse)
async def list_builtin_plugins(
    current_user: User = Depends(get_current_user),
):
    """Get all available builtin plugins."""
    from app.plugins.builtin import (
        ClassWatcherPlugin,
        MathSolverPlugin,
        SummaryBotPlugin,
    )

    builtin_plugins = [
        {
            "name": MathSolverPlugin.name,
            "version": MathSolverPlugin.version,
            "description": MathSolverPlugin.description,
            "author": MathSolverPlugin.author,
            "entry_point": f"{MathSolverPlugin.__module__}.{MathSolverPlugin.__name__}",
            "config_schema": MathSolverPlugin().get_config_schema(),
        },
        {
            "name": SummaryBotPlugin.name,
            "version": SummaryBotPlugin.version,
            "description": SummaryBotPlugin.description,
            "author": SummaryBotPlugin.author,
            "entry_point": f"{SummaryBotPlugin.__module__}.{SummaryBotPlugin.__name__}",
            "config_schema": SummaryBotPlugin().get_config_schema(),
        },
        {
            "name": ClassWatcherPlugin.name,
            "version": ClassWatcherPlugin.version,
            "description": ClassWatcherPlugin.description,
            "author": ClassWatcherPlugin.author,
            "entry_point": f"{ClassWatcherPlugin.__module__}.{ClassWatcherPlugin.__name__}",
            "config_schema": ClassWatcherPlugin().get_config_schema(),
        },
    ]

    return {"success": True, "data": builtin_plugins}


@router.put("/{plugin_id}", response_model=ApiResponse)
async def update_plugin(
    plugin_id: int,
    plugin_data: PluginUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update plugin configuration."""
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    plugin = result.scalar_one_or_none()

    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    # Update fields
    if plugin_data.name is not None:
        plugin.name = plugin_data.name
    if plugin_data.version is not None:
        plugin.version = plugin_data.version
    if plugin_data.description is not None:
        plugin.description = plugin_data.description
    if plugin_data.author is not None:
        plugin.author = plugin_data.author
    if plugin_data.config is not None:
        plugin.config = _dict_to_config(plugin_data.config)
    if plugin_data.is_enabled is not None:
        plugin.is_enabled = plugin_data.is_enabled

    await db.commit()
    await db.refresh(plugin)

    # Update runtime instance
    instance = plugin_manager.get_plugin_by_id(plugin_id)
    if instance:
        if plugin_data.config is not None:
            instance.instance.config = plugin_data.config
        if plugin_data.is_enabled is not None:
            if plugin_data.is_enabled:
                instance.enable()
            else:
                instance.disable()

    return {
        "success": True,
        "data": {
            "id": plugin.id,
            "name": plugin.name,
            "version": plugin.version,
            "description": plugin.description,
            "author": plugin.author,
            "entry_point": plugin.entry_point,
            "config_schema": _schema_to_config(plugin.config_schema),
            "config": _config_to_dict(plugin.config),
            "is_enabled": plugin.is_enabled,
            "is_builtin": plugin.is_builtin,
            "installed_at": plugin.installed_at,
            "updated_at": plugin.updated_at,
        },
        "message": "Plugin updated successfully",
    }


@router.post("/{plugin_id}/toggle", response_model=ApiResponse)
async def toggle_plugin(
    plugin_id: int,
    toggle_data: PluginToggleRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Enable or disable a plugin."""
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    plugin = result.scalar_one_or_none()

    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    plugin.is_enabled = toggle_data.is_enabled
    await db.commit()

    # Update runtime
    instance = plugin_manager.get_plugin_by_id(plugin_id)
    if instance:
        if toggle_data.is_enabled:
            instance.enable()
        else:
            instance.disable()

    return {
        "success": True,
        "data": {"is_enabled": toggle_data.is_enabled},
        "message": f"Plugin {'enabled' if toggle_data.is_enabled else 'disabled'}",
    }


@router.delete("/{plugin_id}", response_model=ApiResponse)
async def delete_plugin(
    plugin_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Uninstall a plugin."""
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    plugin = result.scalar_one_or_none()

    if not plugin:
        raise HTTPException(status_code=404, detail="Plugin not found")

    if plugin.is_builtin:
        raise HTTPException(status_code=400, detail="Cannot uninstall builtin plugins")

    # Unload from runtime
    instance = plugin_manager.get_plugin_by_id(plugin_id)
    if instance:
        plugin_manager.unload_plugin(instance.name)

    # Delete from database
    await db.delete(plugin)
    await db.commit()

    return {"success": True, "message": "Plugin uninstalled successfully"}


@router.post("/{plugin_id}/test", response_model=ApiResponse)
async def test_plugin(
    plugin_id: int,
    message: dict[str, str],
    current_user: User = Depends(get_current_user),
):
    """Test a plugin with a message."""
    instance = plugin_manager.get_plugin_by_id(plugin_id)

    if not instance:
        raise HTTPException(status_code=404, detail="Plugin not found or not loaded")

    content = message.get("content", "")
    response = await instance.on_message(content, {"user_id": current_user.id})

    return {
        "success": True,
        "data": {"response": response},
    }
