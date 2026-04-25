"""Plugin runtime environment with security sandbox.

Refactored to Obsidian-style folder-based plugins.
- Scan PLUGIN_DIRS for manifest.json + main.py
- Sync with DB, then load into runtime
"""

from __future__ import annotations

import ast
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Plugin as PluginModel
from app.plugins.base import BasePlugin


class PluginSandbox:
    """Security sandbox for plugin execution."""

    # Allowed modules for plugins
    ALLOWED_MODULES = {
        "__future__",
        "math",
        "random",
        "datetime",
        "json",
        "re",
        "string",
        "collections",
        "itertools",
        "functools",
        "typing",
        "hashlib",
        "uuid",
        "decimal",
        "fractions",
        "statistics",
    }

    # Dangerous patterns to check in code
    DANGEROUS_PATTERNS = [
        r"import\s+os",
        r"import\s+sys",
        r"import\s+subprocess",
        r"import\s+socket",
        r"__import__",
        r"(?<![a-zA-Z0-9_])eval\s*\(",
        r"(?<![a-zA-Z0-9_])exec\s*\(",
        r"(?<![a-zA-Z0-9_])compile\s*\(",
        r"(?<![a-zA-Z0-9_])open\s*\(",
        r"\.system\s*\(",
        r"\.popen\s*\(",
        r"\.call\s*\(",
    ]

    @classmethod
    def _is_allowed_import(cls, module_name: str) -> bool:
        """Check if a module import is allowed.

        Allows app.plugins.base (required for BasePlugin) but blocks other app modules.
        """
        if module_name in cls.ALLOWED_MODULES:
            return True
        if module_name == "app":
            # Only allow app.plugins.base, not other app modules
            return True  # AST check below will verify the full path
        return False

    @classmethod
    def validate_code(cls, code: str) -> tuple[bool, str]:
        """Validate plugin code for security."""
        # Check for dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, code, re.IGNORECASE):
                return False, "Dangerous pattern detected"

        # Parse AST to check imports
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, f"Syntax error: {e}"

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    full_module = alias.name
                    module_name = full_module.split(".")[0]
                    if module_name == "app":
                        if full_module != "app.plugins.base":
                            return False, f"Import not allowed: {full_module}"
                    elif module_name not in cls.ALLOWED_MODULES:
                        return False, f"Import not allowed: {module_name}"
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    full_module = node.module
                    module_name = full_module.split(".")[0]
                    if module_name == "app":
                        if full_module != "app.plugins.base":
                            return False, f"Import not allowed: {full_module}"
                    elif module_name not in cls.ALLOWED_MODULES:
                        return False, f"Import not allowed: {module_name}"

        return True, ""


class PluginInstance:
    """Wrapper for a loaded plugin instance."""

    def __init__(
        self,
        plugin_id: int,
        plugin_class: type[BasePlugin],
        config: dict[str, Any] | None = None,
    ):
        self.plugin_id = plugin_id
        self.plugin_class = plugin_class
        self.instance = plugin_class(config)
        self.name = plugin_class.name
        self.version = plugin_class.version
        self.enabled = True

    async def on_message(
        self, content: str, context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle message if plugin is enabled."""
        if not self.enabled or not self.instance.enabled:
            return None
        try:
            return self.instance.on_message(content, context)
        except Exception as e:
            return f"[{self.name}] Error: {str(e)}"

    async def on_command(
        self, command: str, args: list[str], context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle command if plugin is enabled."""
        if not self.enabled or not self.instance.enabled:
            return None
        try:
            return self.instance.on_command(command, args, context)
        except Exception as e:
            return f"[{self.name}] Error: {str(e)}"

    async def on_schedule(
        self, event: dict[str, Any], context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle schedule event if plugin is enabled."""
        if not self.enabled or not self.instance.enabled:
            return None
        try:
            return self.instance.on_schedule(event, context)
        except Exception as e:
            return f"[{self.name}] Error: {str(e)}"

    def enable(self) -> None:
        """Enable the plugin."""
        self.enabled = True
        self.instance.enabled = True
        self.instance.on_enable()

    def disable(self) -> None:
        """Disable the plugin."""
        self.enabled = False
        self.instance.enabled = False
        self.instance.on_disable()


class PluginManager:
    """Manager for plugin lifecycle and message distribution."""

    _instance: PluginManager | None = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self._plugins: dict[str, PluginInstance] = {}
        self._plugins_by_id: dict[int, PluginInstance] = {}

    async def scan_plugins(self, db: AsyncSession) -> None:
        """Scan plugin directories, sync to DB, and load into runtime.

        This is the main entry point for plugin discovery.
        """
        from app.plugins.loader import scan_plugin_dirs, sync_plugins_to_db

        # 1. Scan filesystem
        discovered = scan_plugin_dirs()

        # 2. Sync to DB
        await sync_plugins_to_db(db, discovered)

        # 3. Load into runtime
        await self._load_from_db(db, discovered)

    async def _load_from_db(
        self, db: AsyncSession, discovered: list
    ) -> None:
        """Load plugins from DB records into runtime.

        Uses the DB as the source of truth for is_enabled state.
        """
        from app.plugins.loader import DiscoveredPlugin

        result = await db.execute(select(PluginModel))
        db_records = {r.plugin_id: r for r in result.scalars().all()}

        # Clear current runtime state
        self._plugins.clear()
        self._plugins_by_id.clear()

        # Build lookup from manifest id -> discovered plugin
        discovered_map: dict[str, DiscoveredPlugin] = {
            dp.manifest.id: dp for dp in discovered
        }

        for record in db_records.values():
            dp = discovered_map.get(record.plugin_id)
            if dp is None:
                continue  # Stale record, file missing

            config: dict[str, Any] = {}
            if record.config:
                import json

                try:
                    config = json.loads(record.config)
                except json.JSONDecodeError:
                    config = {}

            instance = PluginInstance(record.id, dp.plugin_class, config)
            instance.enabled = record.is_enabled
            instance.instance.enabled = record.is_enabled

            self._plugins[record.plugin_id] = instance
            self._plugins_by_id[record.id] = instance

    def unload_plugin(self, plugin_id_str: str) -> bool:
        """Unload a plugin by its plugin_id (manifest id)."""
        if plugin_id_str in self._plugins:
            instance = self._plugins[plugin_id_str]
            del self._plugins[plugin_id_str]
            if instance.plugin_id in self._plugins_by_id:
                del self._plugins_by_id[instance.plugin_id]
            return True
        return False

    def get_plugin(self, plugin_id_str: str) -> PluginInstance | None:
        """Get a loaded plugin by its plugin_id (manifest id)."""
        return self._plugins.get(plugin_id_str)

    def get_plugin_by_db_id(self, db_id: int) -> PluginInstance | None:
        """Get a loaded plugin by database ID."""
        return self._plugins_by_id.get(db_id)

    def get_all_plugins(self) -> list[PluginInstance]:
        """Get all loaded plugins."""
        return list(self._plugins.values())

    async def dispatch_message(
        self, content: str, context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Dispatch a message to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_message(content, context)
            if response:
                responses.append(
                    {
                        "plugin_name": instance.name,
                        "plugin_id": instance.plugin_id,
                        "message": response,
                        "type": "response",
                    }
                )
        return responses

    async def dispatch_command(
        self, command: str, args: list[str], context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Dispatch a command to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_command(command, args, context)
            if response:
                responses.append(
                    {
                        "plugin_name": instance.name,
                        "plugin_id": instance.plugin_id,
                        "message": response,
                        "type": "response",
                    }
                )
        return responses

    async def dispatch_schedule(
        self, event: dict[str, Any], context: dict[str, Any] | None = None
    ) -> list[dict[str, Any]]:
        """Dispatch a schedule event to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_schedule(event, context)
            if response:
                responses.append(
                    {
                        "plugin_name": instance.name,
                        "plugin_id": instance.plugin_id,
                        "message": response,
                        "type": "response",
                    }
                )
        return responses

    def enable_plugin(self, plugin_id_str: str) -> bool:
        """Enable a plugin by its plugin_id (manifest id)."""
        instance = self._plugins.get(plugin_id_str)
        if instance:
            instance.enable()
            return True
        return False

    def disable_plugin(self, plugin_id_str: str) -> bool:
        """Disable a plugin by its plugin_id (manifest id)."""
        instance = self._plugins.get(plugin_id_str)
        if instance:
            instance.disable()
            return True
        return False


# Global plugin manager instance
plugin_manager = PluginManager()
