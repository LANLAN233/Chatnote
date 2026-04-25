"""Plugin scanner, loader, and DB synchronizer.

Mimics Obsidian's plugin system:
- Each plugin is a folder containing manifest.json + main.py
- Scan PLUGIN_DIRS at startup / on demand
- Load modules dynamically via importlib.util
- Sync discovered plugins to DB (insert / update / delete stale)
"""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Plugin as PluginModel
from app.plugins.base import BasePlugin
from app.plugins.runtime import PluginSandbox

logger = logging.getLogger(__name__)

# Directories to scan for plugins
BUILTIN_PLUGINS_DIR = Path(__file__).parent / "builtin"
DATA_PLUGINS_DIR = Path(__file__).parent.parent.parent / "data" / "plugins"

PLUGIN_DIRS: list[Path] = [BUILTIN_PLUGINS_DIR, DATA_PLUGINS_DIR]


@dataclass
class PluginManifest:
    """Parsed manifest.json for a plugin."""

    id: str
    name: str
    version: str
    description: str = ""
    author: str = ""
    min_app_version: str = ""

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "PluginManifest":
        return cls(
            id=data["id"],
            name=data["name"],
            version=data.get("version", "1.0.0"),
            description=data.get("description", ""),
            author=data.get("author", ""),
            min_app_version=data.get("min_app_version", ""),
        )

    def validate(self) -> tuple[bool, str]:
        """Validate manifest fields."""
        if not self.id or not re.match(r"^[a-z0-9_-]+$", self.id):
            return False, "Invalid plugin id: must be lowercase alphanumeric with - or _"
        if not self.name or len(self.name) > 100:
            return False, "Invalid plugin name: required, max 100 chars"
        if not self.version:
            return False, "Plugin version is required"
        return True, ""


@dataclass
class DiscoveredPlugin:
    """A plugin discovered on the filesystem."""

    manifest: PluginManifest
    source_path: Path
    plugin_class: type[BasePlugin]
    is_builtin: bool = False
    config_schema: list[dict[str, Any]] = field(default_factory=list)


def _ensure_data_plugins_dir() -> None:
    """Ensure the data/plugins directory exists."""
    DATA_PLUGINS_DIR.mkdir(parents=True, exist_ok=True)


def _scan_single_dir(directory: Path, is_builtin: bool) -> list[DiscoveredPlugin]:
    """Scan a single plugin directory for valid plugins."""
    discovered: list[DiscoveredPlugin] = []
    if not directory.exists():
        logger.debug("Plugin directory does not exist: %s", directory)
        return discovered

    for entry in directory.iterdir():
        if not entry.is_dir():
            continue
        plugin_dir = entry
        manifest_path = plugin_dir / "manifest.json"
        main_path = plugin_dir / "main.py"

        if not manifest_path.exists():
            logger.warning("Skipping %s: no manifest.json", plugin_dir)
            continue
        if not main_path.exists():
            logger.warning("Skipping %s: no main.py", plugin_dir)
            continue

        # Parse manifest
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                manifest_data = json.load(f)
            manifest = PluginManifest.from_dict(manifest_data)
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            logger.warning("Invalid manifest.json in %s: %s", plugin_dir, e)
            continue

        valid, err = manifest.validate()
        if not valid:
            logger.warning("Manifest validation failed for %s: %s", plugin_dir, err)
            continue

        # Validate main.py code (skip sandbox for builtin plugins — they are trusted)
        try:
            with open(main_path, "r", encoding="utf-8") as f:
                code = f.read()
        except OSError as e:
            logger.warning("Cannot read main.py in %s: %s", plugin_dir, e)
            continue

        if not is_builtin:
            ok, msg = PluginSandbox.validate_code(code)
            if not ok:
                logger.warning("Sandbox rejected %s: %s", plugin_dir, msg)
                continue

        # Dynamic load
        try:
            spec = importlib.util.spec_from_file_location(
                f"chatnote_plugin_{manifest.id}", str(main_path)
            )
            if spec is None or spec.loader is None:
                logger.warning("Cannot create module spec for %s", main_path)
                continue
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
        except Exception as e:
            logger.warning("Failed to load module %s: %s", main_path, e)
            continue

        # Find BasePlugin subclass
        plugin_class: type[BasePlugin] | None = None
        for obj_name in dir(module):
            obj = getattr(module, obj_name)
            if (
                isinstance(obj, type)
                and issubclass(obj, BasePlugin)
                and obj is not BasePlugin
            ):
                plugin_class = obj
                break

        if plugin_class is None:
            logger.warning("No BasePlugin subclass found in %s", main_path)
            continue

        # Instantiate temporarily to get config schema
        try:
            temp_instance = plugin_class(config={})
            config_schema = temp_instance.get_config_schema()
        except Exception as e:
            logger.warning("Failed to instantiate plugin %s for config schema: %s", manifest.id, e)
            config_schema = []

        discovered.append(
            DiscoveredPlugin(
                manifest=manifest,
                source_path=plugin_dir.resolve(),
                plugin_class=plugin_class,
                is_builtin=is_builtin,
                config_schema=config_schema or [],
            )
        )
        logger.info("Discovered plugin: %s (%s) at %s", manifest.id, manifest.name, plugin_dir)

    return discovered


def scan_plugin_dirs() -> list[DiscoveredPlugin]:
    """Scan all plugin directories and return discovered plugins."""
    _ensure_data_plugins_dir()
    discovered: list[DiscoveredPlugin] = []
    for plugin_dir in PLUGIN_DIRS:
        is_builtin = plugin_dir == BUILTIN_PLUGINS_DIR
        discovered.extend(_scan_single_dir(plugin_dir, is_builtin=is_builtin))
    return discovered


async def sync_plugins_to_db(
    db: AsyncSession, discovered: list[DiscoveredPlugin]
) -> None:
    """Synchronize discovered plugins with the database.

    - New plugins -> INSERT (builtin default enabled=True, community=False)
    - Existing plugins -> UPDATE source_path if changed
    - Missing plugins (file deleted) -> DELETE from DB
    """
    discovered_ids = {dp.manifest.id for dp in discovered}

    # Fetch existing DB records
    result = await db.execute(select(PluginModel))
    existing_records: dict[str, PluginModel] = {
        r.plugin_id: r for r in result.scalars().all()
    }

    # Insert or update
    for dp in discovered:
        record = existing_records.get(dp.manifest.id)
        if record is None:
            # New plugin
            db_plugin = PluginModel(
                plugin_id=dp.manifest.id,
                source_path=str(dp.source_path),
                is_enabled=dp.is_builtin,  # builtin=True, community=False
                is_builtin=dp.is_builtin,
                config=None,
            )
            db.add(db_plugin)
            logger.info("Inserted new plugin record: %s", dp.manifest.id)
        else:
            # Update source_path if changed
            current_path = str(dp.source_path)
            if record.source_path != current_path:
                record.source_path = current_path
                logger.info("Updated source_path for plugin: %s", dp.manifest.id)
            # Ensure is_builtin is correct
            record.is_builtin = dp.is_builtin

    # Delete stale records (file deleted)
    stale_ids = set(existing_records.keys()) - discovered_ids
    for stale_id in stale_ids:
        await db.execute(delete(PluginModel).where(PluginModel.plugin_id == stale_id))
        logger.info("Deleted stale plugin record: %s", stale_id)

    await db.commit()
