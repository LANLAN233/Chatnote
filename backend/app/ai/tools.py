from __future__ import annotations

import json
import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Note, Server
from app.plugins import plugin_manager

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────
# Core implementations (original functions preserved for backward compat)
# ─────────────────────────────────────────────────────────────────────


async def search_notes_tool(query: str, user_id: int, db: AsyncSession) -> str:
    """Search all user notes by keyword. Returns JSON with results."""
    if not query.strip():
        return json.dumps({"found": 0, "results": []})

    result = await db.execute(
        select(Note)
        .where(Note.user_id == user_id, Note.content.ilike(f"%{query}%"))
        .order_by(Note.created_at.desc())
        .limit(20)
    )
    notes = result.scalars().all()

    if not notes:
        return json.dumps({"found": 0, "results": []})

    note_ids = [n.channel_id for n in notes]
    ch_result = await db.execute(select(Channel).where(Channel.id.in_(note_ids)))
    channels = {c.id: c for c in ch_result.scalars().all()}

    server_ids = [c.server_id for c in channels.values()]
    srv_result = await db.execute(select(Server).where(Server.id.in_(server_ids)))
    servers = {s.id: s for s in srv_result.scalars().all()}

    results = []
    for n in notes:
        ch = channels.get(n.channel_id)
        srv = servers.get(ch.server_id) if ch else None
        results.append({
            "id": n.id,
            "preview": n.content[:100],
            "server": srv.name if srv else "",
            "channel": ch.name if ch else "",
            "created_at": n.created_at.isoformat() if n.created_at else "",
        })

    return json.dumps({"found": len(results), "results": results}, ensure_ascii=False)


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


def make_search_notes_tool(db: AsyncSession, user_id: int) -> Callable[..., Any]:
    """Factory: returns an agno-compatible search_notes tool (closure over db, user_id).

    The returned callable expects a single ``query: str`` argument and returns JSON.
    """

    async def search_notes(query: str) -> str:
        return await search_notes_tool(query, user_id, db)

    # Attach metadata that agno may inspect (name, description)
    search_notes.__name__ = "search_notes"
    search_notes.__doc__ = "Search all user notes by keyword. Returns JSON with results."
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
