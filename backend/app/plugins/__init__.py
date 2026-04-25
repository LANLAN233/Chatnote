"""Plugin system for ChatNote."""

from app.plugins.base import BasePlugin, PluginRegistry, plugin
from app.plugins.loader import (
    DATA_PLUGINS_DIR,
    PLUGIN_DIRS,
    BUILTIN_PLUGINS_DIR,
    DiscoveredPlugin,
    PluginManifest,
    scan_plugin_dirs,
    sync_plugins_to_db,
)
from app.plugins.runtime import PluginInstance, PluginManager, PluginSandbox, plugin_manager

__all__ = [
    "BasePlugin",
    "PluginRegistry",
    "plugin",
    "PluginInstance",
    "PluginManager",
    "PluginSandbox",
    "plugin_manager",
    "PluginManifest",
    "DiscoveredPlugin",
    "scan_plugin_dirs",
    "sync_plugins_to_db",
    "BUILTIN_PLUGINS_DIR",
    "DATA_PLUGINS_DIR",
    "PLUGIN_DIRS",
]
