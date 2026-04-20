"""Plugin runtime environment with security sandbox."""

from __future__ import annotations

import ast
import importlib
import re
from typing import Any

from app.plugins.base import BasePlugin, PluginRegistry


class PluginSandbox:
    """Security sandbox for plugin execution."""

    # Allowed modules for plugins
    ALLOWED_MODULES = {
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
        r"eval\s*\(",
        r"exec\s*\(",
        r"compile\s*\(",
        r"open\s*\(",
        r"\.system\s*\(",
        r"\.popen\s*\(",
        r"\.call\s*\(",
    ]

    @classmethod
    def validate_code(cls, code: str) -> tuple[bool, str]:
        """Validate plugin code for security."""
        # Check for dangerous patterns
        for pattern in cls.DANGEROUS_PATTERNS:
            if re.search(pattern, code, re.IGNORECASE):
                return False, f"Dangerous pattern detected"

        # Parse AST to check imports
        try:
            tree = ast.parse(code)
        except SyntaxError as e:
            return False, f"Syntax error: {e}"

        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    module_name = alias.name.split(".")[0]
                    if module_name not in cls.ALLOWED_MODULES:
                        return False, f"Import not allowed: {module_name}"
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    module_name = node.module.split(".")[0]
                    if module_name not in cls.ALLOWED_MODULES:
                        return False, f"Import not allowed: {module_name}"

        return True, ""


class PluginInstance:
    """Wrapper for a loaded plugin instance."""

    def __init__(self, plugin_id: int, plugin_class: type[BasePlugin], config: dict[str, Any] | None = None):
        self.plugin_id = plugin_id
        self.plugin_class = plugin_class
        self.instance = plugin_class(config)
        self.name = plugin_class.name
        self.version = plugin_class.version
        self.enabled = True

    async def on_message(self, content: str, context: dict[str, Any] | None = None) -> str | None:
        """Handle message if plugin is enabled."""
        if not self.enabled or not self.instance.enabled:
            return None
        try:
            return self.instance.on_message(content, context)
        except Exception as e:
            return f"[{self.name}] Error: {str(e)}"

    async def on_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> str | None:
        """Handle command if plugin is enabled."""
        if not self.enabled or not self.instance.enabled:
            return None
        try:
            return self.instance.on_command(command, args, context)
        except Exception as e:
            return f"[{self.name}] Error: {str(e)}"

    async def on_schedule(self, event: dict[str, Any], context: dict[str, Any] | None = None) -> str | None:
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

    def load_builtin_plugins(self) -> None:
        """Load all builtin plugins from the plugins directory."""
        # Import builtin plugins to register them
        from app.plugins.builtin import (  # noqa: F401
            class_watcher,
            math_solver,
            summary_bot,
        )

        # Register plugins from registry
        for name, plugin_class in PluginRegistry.get_all().items():
            if name not in self._plugins:
                instance = PluginInstance(0, plugin_class, {})
                instance.instance.is_builtin = True
                self._plugins[name] = instance

    def load_plugin_from_db(self, plugin_id: int, entry_point: str, config: dict[str, Any] | None = None) -> tuple[bool, str]:
        """Load a plugin from database entry."""
        try:
            # Try to get from registry first (builtin plugins)
            plugin_class = PluginRegistry.get(entry_point)

            if plugin_class is None:
                # Try to import as module
                if "." in entry_point:
                    module_path, class_name = entry_point.rsplit(".", 1)
                    module = importlib.import_module(module_path)
                    plugin_class = getattr(module, class_name)
                else:
                    plugin_class = PluginRegistry.get(entry_point)

            if plugin_class is None:
                return False, f"Plugin class not found: {entry_point}"

            if not issubclass(plugin_class, BasePlugin):
                return False, f"Class does not inherit from BasePlugin"

            instance = PluginInstance(plugin_id, plugin_class, config)
            name = plugin_class.name or plugin_class.__name__
            self._plugins[name] = instance
            self._plugins_by_id[plugin_id] = instance

            return True, ""
        except Exception as e:
            return False, f"Failed to load plugin: {str(e)}"

    def unload_plugin(self, name: str) -> bool:
        """Unload a plugin by name."""
        if name in self._plugins:
            instance = self._plugins[name]
            del self._plugins[name]
            if instance.plugin_id in self._plugins_by_id:
                del self._plugins_by_id[instance.plugin_id]
            return True
        return False

    def get_plugin(self, name: str) -> PluginInstance | None:
        """Get a loaded plugin by name."""
        return self._plugins.get(name)

    def get_plugin_by_id(self, plugin_id: int) -> PluginInstance | None:
        """Get a loaded plugin by ID."""
        return self._plugins_by_id.get(plugin_id)

    def get_all_plugins(self) -> list[PluginInstance]:
        """Get all loaded plugins."""
        return list(self._plugins.values())

    async def dispatch_message(self, content: str, context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Dispatch a message to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_message(content, context)
            if response:
                responses.append({
                    "plugin_name": instance.name,
                    "plugin_id": instance.plugin_id,
                    "message": response,
                    "type": "response",
                })
        return responses

    async def dispatch_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Dispatch a command to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_command(command, args, context)
            if response:
                responses.append({
                    "plugin_name": instance.name,
                    "plugin_id": instance.plugin_id,
                    "message": response,
                    "type": "response",
                })
        return responses

    async def dispatch_schedule(self, event: dict[str, Any], context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        """Dispatch a schedule event to all enabled plugins."""
        responses = []
        for instance in self._plugins.values():
            response = await instance.on_schedule(event, context)
            if response:
                responses.append({
                    "plugin_name": instance.name,
                    "plugin_id": instance.plugin_id,
                    "message": response,
                    "type": "response",
                })
        return responses

    def enable_plugin(self, name: str) -> bool:
        """Enable a plugin by name."""
        instance = self._plugins.get(name)
        if instance:
            instance.enable()
            return True
        return False

    def disable_plugin(self, name: str) -> bool:
        """Disable a plugin by name."""
        instance = self._plugins.get(name)
        if instance:
            instance.disable()
            return True
        return False


# Global plugin manager instance
plugin_manager = PluginManager()
