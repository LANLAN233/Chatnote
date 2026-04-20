"""Builtin plugins package."""

from app.plugins.builtin.class_watcher import ClassWatcherPlugin
from app.plugins.builtin.math_solver import MathSolverPlugin
from app.plugins.builtin.summary_bot import SummaryBotPlugin

__all__ = ["MathSolverPlugin", "SummaryBotPlugin", "ClassWatcherPlugin"]
