"""Plugin management API routes (Obsidian-style folder-based)."""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Plugin, User
from app.plugins import plugin_manager
from app.plugins.loader import (
    BUILTIN_PLUGINS_DIR,
    DATA_PLUGINS_DIR,
    PLUGIN_DIRS,
    PluginManifest,
    scan_plugin_dirs,
    sync_plugins_to_db,
)
from app.plugins.runtime import PluginSandbox
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    ApiResponse,
    PluginDeployRequest,
    PluginResponse,
    PluginToggleRequest,
    PluginUpdate,
)

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


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


async def _build_plugin_responses(db: AsyncSession) -> list[dict[str, Any]]:
    """Build plugin response list by combining DB state + manifest data."""
    # Ensure runtime is in sync with DB (manifest data comes from runtime)
    result = await db.execute(select(Plugin))
    db_records = result.scalars().all()

    responses = []
    for record in db_records:
        instance = plugin_manager.get_plugin(record.plugin_id)

        # Get metadata from runtime instance (which came from manifest)
        name = record.plugin_id
        version = "1.0.0"
        description = None
        author = None
        config_schema = None

        if instance:
            name = instance.name or record.plugin_id
            version = instance.version or "1.0.0"
            description = instance.instance.description or None
            author = instance.instance.author or None
            config_schema = instance.instance.get_config_schema()

        responses.append(
            {
                "id": record.id,
                "plugin_id": record.plugin_id,
                "name": name,
                "version": version,
                "description": description,
                "author": author,
                "config_schema": config_schema,
                "config": _config_to_dict(record.config),
                "is_enabled": record.is_enabled,
                "is_builtin": record.is_builtin,
                "source_path": record.source_path,
                "installed_at": record.installed_at,
                "updated_at": record.updated_at,
            }
        )

    return responses


@router.get("", response_model=ApiResponse)
async def list_plugins(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Scan plugin directories and return all discovered plugins.

    This triggers a fresh scan of PLUGIN_DIRS, syncs to DB, and returns
    the combined manifest + DB state for each plugin.
    """
    await plugin_manager.scan_plugins(db)
    plugin_responses = await _build_plugin_responses(db)
    return {"success": True, "data": plugin_responses}


@router.put("/{plugin_id}", response_model=ApiResponse)
async def update_plugin(
    plugin_id: int,
    plugin_data: PluginUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update plugin configuration."""
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Plugin not found")

    if plugin_data.config is not None:
        record.config = _dict_to_config(plugin_data.config)

    if plugin_data.is_enabled is not None:
        record.is_enabled = plugin_data.is_enabled
        # Update runtime instance
        instance = plugin_manager.get_plugin(record.plugin_id)
        if instance:
            if plugin_data.is_enabled:
                instance.enable()
            else:
                instance.disable()

    await db.commit()
    await db.refresh(record)

    # Rebuild single response
    instance = plugin_manager.get_plugin(record.plugin_id)
    name = record.plugin_id
    version = "1.0.0"
    description = None
    author = None
    config_schema = None
    if instance:
        name = instance.name or record.plugin_id
        version = instance.version or "1.0.0"
        description = instance.instance.description or None
        author = instance.instance.author or None
        config_schema = instance.instance.get_config_schema()

    return {
        "success": True,
        "data": {
            "id": record.id,
            "plugin_id": record.plugin_id,
            "name": name,
            "version": version,
            "description": description,
            "author": author,
            "config_schema": config_schema,
            "config": _config_to_dict(record.config),
            "is_enabled": record.is_enabled,
            "is_builtin": record.is_builtin,
            "source_path": record.source_path,
            "installed_at": record.installed_at,
            "updated_at": record.updated_at,
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
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Plugin not found")

    record.is_enabled = toggle_data.is_enabled
    await db.commit()

    # Update runtime
    instance = plugin_manager.get_plugin(record.plugin_id)
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
    """Delete a plugin: unload from runtime, remove from DB, and delete files.

    Built-in plugins are only unloaded (files are protected).
    Community plugins have their folder removed from disk.
    """
    result = await db.execute(select(Plugin).where(Plugin.id == plugin_id))
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=404, detail="Plugin not found")

    # Unload from runtime
    plugin_manager.unload_plugin(record.plugin_id)

    # Delete plugin folder from disk (only for community plugins)
    if not record.is_builtin:
        plugin_dir = Path(record.source_path)
        if plugin_dir.exists() and plugin_dir.is_dir():
            try:
                shutil.rmtree(plugin_dir)
            except OSError as e:
                raise HTTPException(
                    status_code=500, detail=f"Failed to delete plugin folder: {e}"
                )

    # Delete from database
    await db.delete(record)
    await db.commit()

    action = "unloaded" if record.is_builtin else "deleted"
    return {"success": True, "message": f"Plugin {action} successfully"}


@router.get("/directories", response_model=ApiResponse)
async def list_plugin_directories(
    current_user: User = Depends(get_current_user),
):
    """Return the plugin directories scanned by the system."""
    return {
        "success": True,
        "data": {
            "builtin": str(BUILTIN_PLUGINS_DIR.resolve()),
            "community": str(DATA_PLUGINS_DIR.resolve()),
            "all": [str(d.resolve()) for d in PLUGIN_DIRS],
        },
    }


@router.post("/{plugin_id}/test", response_model=ApiResponse)
async def test_plugin(
    plugin_id: int,
    message: dict[str, str],
    current_user: User = Depends(get_current_user),
):
    """Test a plugin with a message."""
    instance = plugin_manager.get_plugin_by_db_id(plugin_id)

    if not instance:
        raise HTTPException(status_code=404, detail="Plugin not found or not loaded")

    content = message.get("content", "")
    response = await instance.on_message(content, {"user_id": current_user.id})

    return {
        "success": True,
        "data": {"response": response},
    }


@router.post("/deploy", response_model=ApiResponse)
async def deploy_plugin(
    deploy_data: PluginDeployRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Deploy a plugin from developer console.

    Creates/overwrites a plugin folder in data/plugins/{id}/
    with manifest.json and main.py, then scans and loads it.
    """
    # Validate manifest
    manifest = PluginManifest(
        id=deploy_data.id,
        name=deploy_data.manifest.name,
        version=deploy_data.manifest.version,
        description=deploy_data.manifest.description or "",
        author=deploy_data.manifest.author or "",
        min_app_version=deploy_data.manifest.min_app_version or "",
    )
    valid, err = manifest.validate()
    if not valid:
        raise HTTPException(status_code=400, detail=f"Invalid manifest: {err}")

    # Validate code
    ok, msg = PluginSandbox.validate_code(deploy_data.code)
    if not ok:
        raise HTTPException(status_code=400, detail=f"Code validation failed: {msg}")

    # Ensure data/plugins directory exists
    DATA_PLUGINS_DIR.mkdir(parents=True, exist_ok=True)

    plugin_dir = DATA_PLUGINS_DIR / deploy_data.id
    plugin_dir.mkdir(parents=True, exist_ok=True)

    # Write manifest.json
    manifest_path = plugin_dir / "manifest.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "id": manifest.id,
                "name": manifest.name,
                "version": manifest.version,
                "description": manifest.description,
                "author": manifest.author,
                "min_app_version": manifest.min_app_version,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    # Write main.py
    main_path = plugin_dir / "main.py"
    with open(main_path, "w", encoding="utf-8") as f:
        f.write(deploy_data.code)

    # Scan and sync to DB
    await plugin_manager.scan_plugins(db)

    # Find the newly created plugin record
    result = await db.execute(select(Plugin).where(Plugin.plugin_id == deploy_data.id))
    record = result.scalar_one_or_none()

    if not record:
        raise HTTPException(status_code=500, detail="Plugin deployed but failed to load")

    return {
        "success": True,
        "data": {
            "id": record.id,
            "plugin_id": record.plugin_id,
            "is_enabled": record.is_enabled,
            "source_path": str(plugin_dir),
        },
        "message": "Plugin deployed successfully. Enable it in the plugin list.",
    }
