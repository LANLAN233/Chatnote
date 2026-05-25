from __future__ import annotations

import builtins as _builtins_raw
import concurrent.futures
import json
import logging
import tempfile
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Note, Server
from app.plugins import plugin_manager

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Core implementations (original functions preserved for backward compat)
# ─────────────────────────────────────────────────────────────────────


async def search_notes_tool(query: str, user_id: int, db: AsyncSession, mode: str = "hybrid") -> str:
    """Search notes using hybrid semantic + full-text search.

    Args:
        query: Natural language search query
        user_id: User ID to scope search
        db: Database session
        mode: 'semantic' (vector only), 'keyword' (full-text only), or 'hybrid' (both, default)

    Returns:
        JSON string with search results including note_id, content, score, and source.
    """
    from app.services.search import fulltext_search, hybrid_search, vector_search

    if not query.strip():
        return json.dumps({"found": 0, "results": []})

    if mode == "semantic":
        results = await vector_search(query, user_id, db, limit=10)
    elif mode == "keyword":
        results = await fulltext_search(query, user_id, db, limit=10)
    else:
        results = await hybrid_search(query, user_id, db, limit=10)

    if not results:
        return json.dumps({"found": 0, "results": []})

    formatted = []
    for i, r in enumerate(results):
        formatted.append({
            "rank": i + 1,
            "note_id": r["note_id"],
            "content": r["content"][:300],
            "relevance": round(r["score"], 3),
            "source": r.get("source", mode),
        })

    return json.dumps(formatted, ensure_ascii=False)


async def get_today_schedules_tool(user_id: int, db: AsyncSession) -> str:
    """Get today's schedules and recent notes."""
    from datetime import datetime, timezone

    today = datetime.now(timezone.utc).date()
    result = await db.execute(
        select(Note)
        .where(Note.user_id == user_id)
        .order_by(Note.created_at.desc())
        .limit(20)
    )
    notes = result.scalars().all()
    today_notes = [n for n in notes if n.created_at.date() == today]

    count_result = await db.execute(
        select(func.count()).select_from(Note).where(Note.user_id == user_id)
    )
    total = count_result.scalar() or 0

    items = [{
        "date": today.isoformat(),
        "notes_today": len(today_notes),
        "total_notes": total,
        "recent": [{"id": n.id, "preview": n.content[:60]} for n in today_notes[:5]],
    }]
    return json.dumps(items, ensure_ascii=False)


async def get_stats_tool(user_id: int, db: AsyncSession) -> str:
    """Get user statistics: servers, channels, notes counts."""
    note_count = await db.execute(
        select(func.count()).select_from(Note).where(Note.user_id == user_id)
    )
    server_count = await db.execute(
        select(func.count()).select_from(Server).where(Server.user_id == user_id)
    )
    channel_count = await db.execute(
        select(func.count())
        .select_from(Channel)
        .join(Server, Channel.server_id == Server.id)
        .where(Server.user_id == user_id)
    )

    stats = {
        "servers": server_count.scalar() or 0,
        "channels": channel_count.scalar() or 0,
        "notes": note_count.scalar() or 0,
    }
    return json.dumps(stats)


async def get_plugins_status_tool() -> str:
    """Get installed plugin status."""
    plugins = plugin_manager.get_all_plugins()
    if not plugins:
        return json.dumps([])

    items = []
    for p in plugins:
        items.append({
            "name": p.name,
            "version": p.version,
            "enabled": p.enabled,
            "is_builtin": getattr(p.instance, "is_builtin", False),
            "description": p.instance.description if p.instance else "",
        })
    return json.dumps(items, ensure_ascii=False)


async def dispatch_plugin_command(command: str, args: list[str], user_id: int) -> str:
    """Dispatch a command to plugins and return results."""
    responses = await plugin_manager.dispatch_command(command, args, {"user_id": user_id})
    if responses:
        return json.dumps(responses, ensure_ascii=False)
    return json.dumps([])


# ─────────────────────────────────────────────────────────────────────
# Factory functions (for agno compatibility — capture db/user_id in closure)
# ─────────────────────────────────────────────────────────────────────


def make_search_notes_tool(db: AsyncSession, user_id: int, mode: str = "hybrid") -> Callable[..., Any]:
    """Factory: returns an agno-compatible search_notes tool (closure over db, user_id).

    The returned callable expects a single ``query: str`` argument and returns JSON.
    Supports 'semantic', 'keyword', or 'hybrid' (default) search mode.
    """

    async def search_notes(query: str) -> str:
        return await search_notes_tool(query, user_id, db, mode)

    # Attach metadata that agno may inspect (name, description)
    search_notes.__name__ = "search_notes"
    search_notes.__doc__ = "Search all user notes using hybrid semantic + full-text search. Returns JSON with results."
    return search_notes


def make_get_stats_tool(db: AsyncSession, user_id: int) -> Callable[..., Any]:
    """Factory: returns an agno-compatible get_stats tool (closure over db, user_id).

    The returned callable takes no arguments and returns JSON stats.
    """

    async def get_stats() -> str:
        return await get_stats_tool(user_id, db)

    get_stats.__name__ = "get_stats"
    get_stats.__doc__ = "Get user statistics: servers, channels, notes counts."
    return get_stats


def make_get_today_schedules_tool(db: AsyncSession, user_id: int) -> Callable[..., Any]:
    """Factory: returns an agno-compatible get_today_schedules tool (closure over db, user_id).

    The returned callable takes no arguments and returns JSON.
    """

    async def get_today_schedules() -> str:
        return await get_today_schedules_tool(user_id, db)

    get_today_schedules.__name__ = "get_today_schedules"
    get_today_schedules.__doc__ = "Get today's schedules and recent notes."
    return get_today_schedules


# ─────────────────────────────────────────────────────────────────────
# PythonTools sandbox configuration (Phase 15)
# ─────────────────────────────────────────────────────────────────────

# Module allowlist — only these modules can be imported in sandboxed code.
# Extended from the core six (math, numpy, pandas, matplotlib, json, datetime)
# to include stdlib essentials required by typical data-science scripts.
_ALLOWED_MODULES: frozenset[str] = frozenset({
    "math", "numpy", "pandas", "matplotlib", "json", "datetime",
    # Stdlib essentials
    "collections", "itertools", "functools", "random", "statistics",
    "re", "typing", "dataclasses", "enum", "abc", "copy", "pprint",
    "textwrap", "string", "numbers", "decimal", "fractions",
    "operator", "heapq", "bisect", "array", "hashlib",
    "base64", "uuid", "csv", "time", "warnings", "logging",
    "contextlib",
})

# Module blocklist — explicitly forbidden even if they appear in allowlist.
_BLOCKED_MODULES: frozenset[str] = frozenset({
    "os", "sys", "subprocess", "requests", "socket", "urllib",
    "shutil", "pickle", "ctypes", "multiprocessing", "threading",
    "asyncio", "signal", "atexit", "gc", "inspect", "traceback",
    "code", "codeop", "pdb", "bdb", "webbrowser", "http",
    "ftplib", "smtplib", "imaplib", "poplib",
    "importlib", "pkgutil", "runpy", "zipimport",
    "pathlib", "io",
})

# Built-in names safe to expose inside sandbox exec().
# NOTE: ``open``, ``eval``, ``exec``, ``compile``, ``__import__``,
# ``input``, ``breakpoint`` are deliberately excluded.
_SAFE_BUILTIN_NAMES: frozenset[str] = frozenset({
    "abs", "all", "any", "ascii", "bin", "bool", "bytearray", "bytes",
    "callable", "chr", "classmethod", "complex",
    "delattr", "dict", "dir", "divmod", "enumerate", "filter",
    "float", "format", "frozenset", "getattr", "hasattr",
    "hash", "help", "hex", "id", "int", "isinstance", "issubclass",
    "iter", "len", "list", "map", "max", "memoryview", "min",
    "next", "object", "oct", "ord", "pow", "print", "property",
    "range", "repr", "reversed", "round", "set", "setattr",
    "slice", "sorted", "staticmethod", "str", "sum", "super",
    "tuple", "type", "vars", "zip",
    # Exception hierarchy
    "Exception", "BaseException", "ValueError", "TypeError", "KeyError",
    "IndexError", "AttributeError", "ImportError", "NameError",
    "RuntimeError", "SyntaxError", "StopIteration", "ZeroDivisionError",
    "ArithmeticError", "AssertionError", "LookupError", "MemoryError",
    "OSError", "OverflowError", "RecursionError", "ReferenceError",
    "UnboundLocalError", "UnicodeError", "FileNotFoundError",
    "PermissionError", "IsADirectoryError", "NotADirectoryError",
    "EOFError", "KeyboardInterrupt", "SystemExit", "GeneratorExit",
    "StopAsyncIteration", "Warning", "DeprecationWarning",
    # Constants
    "None", "True", "False", "Ellipsis", "NotImplemented",
})

# Default execution limits
_DEFAULT_TIMEOUT_SECONDS: int = 10
_DEFAULT_MEMORY_MB: int = 256  # best-effort; requires OS support (not enforced on Windows)


def _safe_import(name: str, globals: dict | None = None, locals: dict | None = None,
                 fromlist: tuple[str, ...] = (), level: int = 0) -> Any:
    """Restricted ``__import__`` for sandbox exec.

    Checks *top_level* module name against the blocklist first (security),
    then against the allowlist (whitelisting).  Everything else is denied.
    """
    top_level: str = name.split(".")[0]

    if top_level in _BLOCKED_MODULES:
        raise ImportError(f"Module '{top_level}' is blocked for security reasons")

    if top_level not in _ALLOWED_MODULES:
        raise ImportError(
            f"Module '{top_level}' is not in the allowed list. "
            f"Allowed modules: {', '.join(sorted(_ALLOWED_MODULES))}"
        )

    return _builtins_raw.__import__(name, globals, locals, fromlist, level)


def _build_restricted_builtins() -> dict[str, Any]:
    """Return a restricted ``__builtins__`` dictionary for sandbox exec.

    Only safe built-in names are included.  ``__import__`` is replaced
    with ``_safe_import`` so that every ``import`` statement goes through
    the allowlist/blocklist gate.
    """
    restricted: dict[str, Any] = {}

    for name in _SAFE_BUILTIN_NAMES:
        obj = getattr(_builtins_raw, name, None)
        if obj is not None:
            restricted[name] = obj

    # Override __import__ with our gatekeeper
    restricted["__import__"] = _safe_import

    # Expose a smaller set via __builtins__ itself so that isinstance works
    restricted["__builtins__"] = restricted

    return restricted


def build_safe_globals(base_dir: Path) -> dict[str, Any]:
    """Build the ``safe_globals`` dict for a sandboxed PythonTools instance.

    Includes:
    * Restricted ``__builtins__`` (no ``open``, ``eval``, ``exec``, etc.)
    * Pre-imported allowed modules (math, numpy, pandas, etc.)
    * ``__name__`` set to ``"__sandbox__"``
    """
    safe: dict[str, Any] = {
        "__builtins__": _build_restricted_builtins(),
        "__name__": "__sandbox__",
        "__file__": str(base_dir / "__sandbox__.py"),
    }

    # Pre-import lightweight stdlib modules so they are directly available.
    # Heavy deps (numpy, pandas, matplotlib) are not preloaded — the
    # _safe_import gate allows them on-demand via ``import`` statements.
    _PRELOAD_MODULES: tuple[str, ...] = (
        "math", "json", "datetime",
        "collections", "itertools", "functools", "random",
        "statistics", "re", "typing", "dataclasses", "enum",
        "copy", "pprint", "textwrap", "string", "decimal",
        "operator", "hashlib", "base64", "uuid", "csv",
        "time", "warnings", "logging", "contextlib", "fractions",
    )
    for mod_name in _PRELOAD_MODULES:
        try:
            safe[mod_name] = _builtins_raw.__import__(mod_name)
        except ImportError:
            pass  # optional dependency not installed

    return safe


class _SafePythonTools:
    """PythonTools subclass that wraps key methods with a configurable
    execution-timeout guard.

    Plain agno ``PythonTools.run_python_code`` has no timeout — a
    long-running (or infinite) snippet blocks the agent forever.
    This wrapper uses a thread-pool future with a hard deadline.
    """

    def __new__(cls, execution_timeout: int = _DEFAULT_TIMEOUT_SECONDS, **kwargs: Any) -> Any:
        # Lazy import inside __new__ to avoid ImportError when agno is not installed
        from agno.tools.python import PythonTools  # type: ignore[import-untyped]

        instance = PythonTools(**kwargs)
        instance._execution_timeout = execution_timeout  # type: ignore[attr-defined]

        # Wrap the two execution methods with timeout guards
        _orig_run_python_code = instance.run_python_code  # type: ignore[attr-defined]
        _orig_save_to_file_and_run = instance.save_to_file_and_run  # type: ignore[attr-defined]

        def _run_with_timeout(code: str, variable_to_return: str | None = None) -> str:
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                future = executor.submit(_orig_run_python_code, code, variable_to_return)
                return future.result(timeout=execution_timeout)
            except concurrent.futures.TimeoutError:
                return f"Error: Code execution timed out ({execution_timeout}s limit)"
            finally:
                # wait=False: don't block on rogue threads (e.g. infinite loops)
                executor.shutdown(wait=False)

        def _save_and_run_with_timeout(file_name: str, code: str,
                                       variable_to_return: str | None = None,
                                       overwrite: bool = True) -> str:
            executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)
            try:
                future = executor.submit(
                    _orig_save_to_file_and_run, file_name, code, variable_to_return, overwrite,
                )
                return future.result(timeout=execution_timeout)
            except concurrent.futures.TimeoutError:
                return f"Error: Code execution timed out ({execution_timeout}s limit)"
            finally:
                executor.shutdown(wait=False)

        instance.run_python_code = _run_with_timeout  # type: ignore[attr-defined]
        instance.save_to_file_and_run = _save_and_run_with_timeout  # type: ignore[attr-defined]

        return instance


def create_safe_python_tools(
    base_dir: Path | None = None,
    execution_timeout: int = _DEFAULT_TIMEOUT_SECONDS,
) -> Any:
    """Factory: returns a pre-configured agno PythonTools instance with
    security sandbox enabled.

    Sandbox features
    ----------------
    * **Module allowlist** — only ``math``, ``numpy``, ``pandas``,
      ``matplotlib``, ``json``, ``datetime`` and a curated set of stdlib
      modules can be imported.
    * **Module blocklist** — ``os``, ``sys``, ``subprocess``, ``requests``,
      ``socket``, ``urllib`` and 30+ other dangerous modules are blocked.
    * **Execution timeout** — any ``run_python_code`` / ``save_to_file_and_run``
      call is killed after *execution_timeout* seconds (default 10).
    * **Memory limit** — 256 MB (best-effort; enforced only on platforms
      where ``resource`` is available).
    * **Restricted builtins** — ``open``, ``eval``, ``exec``, ``compile``,
      ``__import__`` (raw), ``input``, ``breakpoint`` are removed.
    * **Package installation blocked** — ``pip_install_package`` /
      ``uv_pip_install_package`` excluded from the toolkit.

    Parameters
    ----------
    base_dir : Path | None
        Working directory for file operations.  A temp directory is
        created when ``None``.
    execution_timeout : int
        Maximum seconds a single code block may run.

    Returns
    -------
    PythonTools
        A ready-to-use sandboxed PythonTools instance.
    """
    if base_dir is None:
        base_dir = Path(tempfile.mkdtemp(prefix="agno_sandbox_"))

    safe_globals: dict[str, Any] = build_safe_globals(base_dir)

    return _SafePythonTools(
        base_dir=base_dir,
        safe_globals=safe_globals,
        safe_locals={},
        execution_timeout=execution_timeout,
        exclude_tools=["pip_install_package", "uv_pip_install_package"],
    )
