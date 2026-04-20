import logging
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Note, Server

logger = logging.getLogger(__name__)

HELP_TEXT = """Available commands:
  /help           - Show this help message
  /clear          - Clear console output
  /search <query> - Search all notes
  /todo <content> - Create a todo note
  /today          - Show today's activity
  /stats          - Show note statistics"""


async def handle_help(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    return {"type": "text", "content": HELP_TEXT}


async def handle_clear(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    return {"type": "clear"}


async def handle_search(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    if not args.strip():
        return {"type": "text", "content": "Usage: /search <keyword>"}

    result = await db.execute(
        select(Note)
        .where(Note.user_id == user_id, Note.content.ilike(f"%{args}%"))
        .order_by(Note.created_at.desc())
        .limit(20)
    )
    notes = result.scalars().all()

    if not notes:
        return {"type": "text", "content": f"No results found for '{args}'"}

    note_ids = [n.channel_id for n in notes]
    ch_result = await db.execute(select(Channel).where(Channel.id.in_(note_ids)))
    channels = {c.id: c for c in ch_result.scalars().all()}

    server_ids = [c.server_id for c in channels.values()]
    srv_result = await db.execute(select(Server).where(Server.id.in_(server_ids)))
    servers = {s.id: s for s in srv_result.scalars().all()}

    lines = [f"Found {len(notes)} results for '{args}':\n"]
    for n in notes:
        ch = channels.get(n.channel_id)
        srv = servers.get(ch.server_id) if ch else None
        location = f"@{srv.name} #{ch.name}" if srv and ch else ""
        preview = n.content[:80].replace("\n", " ")
        lines.append(f"  [{location}] {preview}...")

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

    lines = [
        f"Today's Activity ({today.isoformat()}):",
        f"  Notes today: {len(today_notes)}",
        f"  Total notes: {total}",
    ]

    if today_notes:
        lines.append("\nToday's notes:")
        for n in today_notes[:5]:
            preview = n.content[:60].replace("\n", " ")
            lines.append(f"  - {preview}")

    return {"type": "text", "content": "\n".join(lines)}


async def handle_stats(args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    note_count = await db.execute(select(func.count()).select_from(Note).where(Note.user_id == user_id))
    server_count = await db.execute(select(func.count()).select_from(Server).where(Server.user_id == user_id))
    channel_count = await db.execute(
        select(func.count())
        .select_from(Channel)
        .join(Server, Channel.server_id == Server.id)
        .where(Server.user_id == user_id)
    )

    lines = [
        "Statistics:",
        f"  Servers: {server_count.scalar() or 0}",
        f"  Channels: {channel_count.scalar() or 0}",
        f"  Notes: {note_count.scalar() or 0}",
    ]
    return {"type": "text", "content": "\n".join(lines)}


COMMAND_REGISTRY: dict[str, Any] = {
    "help": handle_help,
    "clear": handle_clear,
    "search": handle_search,
    "todo": handle_todo,
    "today": handle_today,
    "stats": handle_stats,
}


async def execute_command(command: str, args: str, db: AsyncSession, user_id: int) -> dict[str, Any]:
    handler = COMMAND_REGISTRY.get(command)
    if not handler:
        return {
            "type": "error",
            "content": f"Unknown command: /{command}\nType /help to see available commands.",
        }
    return await handler(args, db, user_id)
