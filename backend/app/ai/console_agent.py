"""Console agent — command routing and execution.

For simple, deterministic commands (/help, /clear, /search, etc.),
we keep direct routing. The Agno Agent is used for smart classification
and natural language understanding when needed.
"""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import (
    dispatch_plugin_command,
    get_plugins_status_tool,
    get_stats_tool,
    get_today_schedules_tool,
    search_notes_tool,
)
from app.models.models import Channel, Note, Server
from app.plugins import plugin_manager

logger = logging.getLogger(__name__)

HELP_TEXT = """Available commands:
  /help           - Show this help message
  /clear          - Clear console output
  /search <query> - Search all notes
  /todo <content> - Create a todo note
  /today          - Show today's activity
  /stats          - Show note statistics
  /plugins        - Show plugin status
  /calc <expr>    - Calculate math expression"""


async def handle_help(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    return {"type": "text", "content": HELP_TEXT}


async def handle_clear(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    return {"type": "clear"}


async def handle_search(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    if not args.strip():
        return {"type": "text", "content": "Usage: /search <keyword>"}

    result_raw = await search_notes_tool(args, user_id, db)
    import json
    data = json.loads(result_raw)
    found = data.get("found", 0)
    results = data.get("results", [])

    if not results:
        return {"type": "text", "content": f"No results found for '{args}'"}

    lines = [f"Found {found} results for '{args}':\n"]
    for r in results:
        location = f"@{r['server']} #{r['channel']}" if r.get("server") else ""
        lines.append(f"  [{location}] {r['preview']}...")

    return {"type": "text", "content": "\n".join(lines)}


async def handle_todo(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    if not args.strip():
        return {"type": "text", "content": "Usage: /todo <content>"}

    result = await db.execute(
        select(Server).where(Server.name == "Todos", Server.user_id == user_id)
    )
    server = result.scalar_one_or_none()
    if not server:
        server = Server(user_id=user_id, name="Todos")
        db.add(server)
        await db.flush()
        await db.refresh(server)

    ch_result = await db.execute(
        select(Channel).where(Channel.server_id == server.id, Channel.name == "General")
    )
    channel = ch_result.scalar_one_or_none()
    if not channel:
        channel = Channel(server_id=server.id, name="General")
        db.add(channel)
        await db.flush()
        await db.refresh(channel)

    note = Note(
        channel_id=channel.id,
        user_id=user_id,
        content=f"TODO: {args}",
        content_type="markdown",
        raw_input=f"/todo {args}",
        ai_tags='["todo"]',
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    return {
        "type": "todo_created",
        "content": f"Todo created: {args}",
        "data": {
            "note_id": note.id,
            "server_id": server.id,
            "channel_id": channel.id,
        },
    }


async def handle_today(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    import json as _json
    result_raw = await get_today_schedules_tool(user_id, db)
    data = _json.loads(result_raw)

    if not data:
        return {"type": "text", "content": "No activity recorded yet."}

    item = data[0]
    lines = [
        f"Today's Activity ({item['date']}):",
        f"  Notes today: {item['notes_today']}",
        f"  Total notes: {item['total_notes']}",
    ]
    recent = item.get("recent", [])
    if recent:
        lines.append("\nRecent notes:")
        for n in recent[:5]:
            lines.append(f"  - {n['preview']}")

    return {"type": "text", "content": "\n".join(lines)}


async def handle_stats(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    import json as _json
    result_raw = await get_stats_tool(user_id, db)
    stats = _json.loads(result_raw)

    lines = [
        "Statistics:",
        f"  Servers: {stats['servers']}",
        f"  Channels: {stats['channels']}",
        f"  Notes: {stats['notes']}",
    ]
    return {"type": "text", "content": "\n".join(lines)}


async def handle_plugins(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    import json as _json
    result_raw = await get_plugins_status_tool()
    items = _json.loads(result_raw)

    if not items:
        return {"type": "text", "content": "No plugins installed."}

    lines = ["Plugins:"]
    for p in items:
        status = "enabled" if p["enabled"] else "disabled"
        builtin = " (builtin)" if p.get("is_builtin") else ""
        star = "*" if p["enabled"] else " "
        lines.append(f"  {star} {p['name']} v{p['version']} [{status}]{builtin}")
        desc = p.get("description", "")
        if desc:
            lines.append(f"    {desc}")

    lines.append("\nType /calc <expression> to use Math Solver")
    return {"type": "text", "content": "\n".join(lines)}


async def handle_calc(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    if not args.strip():
        return {"type": "text", "content": "Usage: /calc <expression>"}

    responses = await plugin_manager.dispatch_command(
        "calc", args.split(), {"user_id": user_id}
    )

    if responses:
        return {
            "type": "plugin_response",
            "content": responses[0].get("message", ""),
            "data": {"plugin_responses": responses},
        }

    return {"type": "text", "content": f"Calculating: {args}..."}


COMMAND_REGISTRY: dict[str, Any] = {
    "help": handle_help,
    "clear": handle_clear,
    "search": handle_search,
    "todo": handle_todo,
    "today": handle_today,
    "stats": handle_stats,
    "plugins": handle_plugins,
    "calc": handle_calc,
}


async def execute_command(
    command: str,
    args: str,
    db: AsyncSession,
    user_id: int,
    server_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    handler = COMMAND_REGISTRY.get(command)
    if not handler:
        ctx: dict[str, Any] = {"user_id": user_id}
        if server_context:
            ctx.update(server_context)
        responses = await plugin_manager.dispatch_command(
            command, args.split(), ctx
        )
        if responses:
            return {
                "type": "plugin_response",
                "content": "\n".join(
                    [r.get("message", r.get("response", str(r))) for r in responses]
                ),
                "data": {"plugin_responses": responses},
            }
        return {
            "type": "error",
            "content": f"Unknown command: /{command}\nType /help to see available commands.",
        }
    return await handler(args, db, user_id)
