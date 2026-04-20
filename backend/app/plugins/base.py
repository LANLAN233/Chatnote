"""Plugin system base classes and registry."""

from __future__ import annotations

import abc
from typing import Any, Callable, ClassVar


class BasePlugin(abc.ABC):
    """Base class for all plugins."""

    name: ClassVar[str] = ""
    version: ClassVar[str] = "1.0.0"
    description: ClassVar[str] = ""
    author: ClassVar[str] = ""

    def __init__(self, config: dict[str, Any] | None = None):
        self.config = config or {}
        self.enabled = True

    @abc.abstractmethod
    def on_message(
        self, content: str, context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle incoming message.

        Args:
            content: The message content
            context: Additional context (user_id, channel_id, etc.)

        Returns:
            Response message or None if no response
        """
        pass

    def on_command(
        self, command: str, args: list[str], context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle console commands.

        Args:
            command: The command name (without /)
            args: Command arguments
            context: Additional context

        Returns:
            Response message or None if no response
        """
        return None

    def on_schedule(
        self, event: dict[str, Any], context: dict[str, Any] | None = None
    ) -> str | None:
        """Handle schedule events.

        Args:
            event: Schedule event data
            context: Additional context

        Returns:
            Response message or None if no response
        """
        return None

    def on_enable(self) -> None:
        """Called when plugin is enabled."""
        pass

    def on_disable(self) -> None:
        """Called when plugin is disabled."""
        pass

    def get_config_schema(self) -> list[dict[str, Any]]:
        """Return configuration schema for this plugin.

        Returns:
            List of config field definitions
        """
        return []


class PluginRegistry:
    """Registry for plugin classes."""

    _plugins: ClassVar[dict[str, type[BasePlugin]]] = {}

    @classmethod
    def register(cls, plugin_class: type[BasePlugin]) -> type[BasePlugin]:
        """Register a plugin class.

        Args:
            plugin_class: The plugin class to register

        Returns:
            The registered plugin class (for use as decorator)
        """
        if not issubclass(plugin_class, BasePlugin):
            raise ValueError(f"Plugin class must inherit from BasePlugin: {plugin_class}")

        name = plugin_class.name or plugin_class.__name__
        cls._plugins[name] = plugin_class
        return plugin_class

    @classmethod
    def get(cls, name: str) -> type[BasePlugin] | None:
        """Get a registered plugin class by name.

        Args:
            name: Plugin name

        Returns:
            The plugin class or None if not found
        """
        return cls._plugins.get(name)

    @classmethod
    def get_all(cls) -> dict[str, type[BasePlugin]]:
        """Get all registered plugin classes.

        Returns:
            Dictionary of plugin name to plugin class
        """
        return cls._plugins.copy()

    @classmethod
    def unregister(cls, name: str) -> bool:
        """Unregister a plugin class.

        Args:
            name: Plugin name

        Returns:
            True if plugin was removed, False if not found
        """
        if name in cls._plugins:
            del cls._plugins[name]
            return True
        return False

    @classmethod
    def clear(cls) -> None:
        """Clear all registered plugins (mainly for testing)."""
        cls._plugins.clear()


# Convenience decorator for registering plugins
def plugin(cls: type[BasePlugin]) -> type[BasePlugin]:
    """Decorator to register a plugin class.

    Usage:
        @plugin
        class MyPlugin(BasePlugin):
            name = "My Plugin"
            ...
    """
    return PluginRegistry.register(cls)
