"""Console agent — command routing and execution.

For simple, deterministic commands (/help, /clear, /search, etc.),
we keep direct routing. The Agno Agent is used for smart classification
and natural language understanding when needed.
"""

from __future__ import annotations

import logging
import time
from typing import Any

from agno.agent import Agent

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.tools import (
    dispatch_plugin_command,
    get_plugins_status_tool,
    get_stats_tool,
    get_today_schedules_tool,
    make_get_stats_tool,
    make_search_notes_tool,
    search_notes_tool,
)
from app.models.models import Channel, Note, Server
from app.plugins import plugin_manager
from app.schemas.ai_progress import AiProgressStage
from app.services.websocket import manager

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


# ─────────────────────────────────────────────────────────────────────
# AI Agent (tool-equipped — Phase 15)
# ─────────────────────────────────────────────────────────────────────

CONSOLE_AGENT_INSTRUCTIONS = """You are ChatNote Console, an intelligent assistant embedded in a Discord-style study notes application.

## Your Role
- Help users manage and query their study notes, schedules, and tasks
- Use the available tools to search their personal knowledge base before guessing
- Answer questions about their notes, statistics, and study patterns

## Available Tools
- **search_notes(query: str)**: Search the user's personal notes by keyword. Returns JSON with found results and previews.
- **get_stats()**: Get the user's statistics — server count, channel count, and total notes count.

## Guidelines
- **Always** use the tools to get accurate data before answering questions about the user's notes or statistics
- If the user asks "how many notes", "what notes do I have about X", or "search my notes for Y", use search_notes() or get_stats()
- Respond in the same language as the user's query
- Be concise and helpful — don't over-explain when a simple answer suffices
- Reference the tool results explicitly when answering (e.g. "You have 5 notes about linear algebra")"""


def create_console_ai_agent(
    db: AsyncSession,
    user_id: int,
    model: Any,  # agno OpenAIChat
) -> Agent | None:
    """Create an Agno Agent equipped with notes-search and stats tools.

    Returns None when *model* is None (no API key configured) so that
    callers can fall back to deterministic command handling.
    """
    if model is None:
        return None

    # Factory tools: capture db/user_id in closure for agno compatibility
    search_notes = make_search_notes_tool(db, user_id)
    get_stats = make_get_stats_tool(db, user_id)

    return Agent(
        model=model,
        name="Console Agent",
        system_message_role="system",
        instructions=CONSOLE_AGENT_INSTRUCTIONS,
        tools=[search_notes, get_stats],
        read_tool_call_history=True,
    )


_TOOL_ERROR_PATTERNS = [
    "Error from provider",
    "Provider returned error",
    "does not support tools",
    "tool_choice",
    "tools not supported",
]


def _is_tool_error(content: str) -> bool:
    for pattern in _TOOL_ERROR_PATTERNS:
        if pattern.lower() in content.lower():
            return True
    return False


async def execute_agent_query(
    input_text: str,
    db: AsyncSession,
    user_id: int,
    model: Any,  # agno OpenAIChat | None
    operation_id: str | None = None,
) -> dict[str, Any]:
    """Execute a natural-language query via the console AI agent.

    When *model* is None the function returns an error message so that
    callers don't need an extra guard — it degrades gracefully.

    Tries with tools first; falls back to plain agent if tool-calling is
    not supported by the model.
    """
    if not input_text.strip():
        return {"type": "text", "content": "Please provide a query or command."}

    if model is None:
        return {
            "type": "error",
            "content": "No AI model configured. Add an API key in Settings to enable AI queries.",
        }

    model_id = model.id if hasattr(model, "id") else "unknown"

    # ── Try with tools first ────────────────────────────────────────
    t0 = time.time()
    if operation_id is not None:
        await manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,
            stage_data=AiProgressStage(
                stage="tool_call",
                status="in_progress",
                model=model_id,
                tier="primary",
                message="Executing tool: console agent with tools",
            ),
        )
    agent = create_console_ai_agent(db, user_id, model)
    if agent is not None:
        try:
            response = await agent.arun(input=input_text)
        except Exception as exc:
            logger.warning("Console agent with tools raised: %s, will fallback", exc)
            response = None
        else:
            content = response.content if hasattr(response, "content") else str(response)
            if not _is_tool_error(content):
                if operation_id is not None:
                    duration_ms = int((time.time() - t0) * 1000)
                    await manager.broadcast_ai_progress(
                        user_id=user_id,
                        operation_id=operation_id,
                        stage_data=AiProgressStage(
                            stage="tool_call",
                            status="completed",
                            model=model_id,
                            tier="primary",
                            message="Tool call completed",
                            duration_ms=duration_ms,
                        ),
                    )
                return _build_agent_response(response)

    # ── Tool call failed → emit failed event ─────────────────────────
    if operation_id is not None:
        duration_ms = int((time.time() - t0) * 1000)
        await manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,
            stage_data=AiProgressStage(
                stage="tool_call",
                status="failed",
                model=model_id,
                tier="primary",
                message="Tool failed: tool-calling not supported by model",
                metadata={"tool_name": "console_agent_with_tools", "error": "model_does_not_support_tools"},
                duration_ms=duration_ms,
            ),
        )

    # ── Fallback: plain agent without tools ─────────────────────────
    logger.info("Console agent: tool-calling failed, falling back to plain agent")
    t0_fb = time.time()
    if operation_id is not None:
        await manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,
            stage_data=AiProgressStage(
                stage="fallback",
                status="in_progress",
                model=model_id,
                tier="fallback",
                message="Falling back to plain LLM...",
            ),
        )
    try:
        plain_agent = Agent(
            model=model,
            name="Console Agent",
            system_message_role="system",
            instructions=CONSOLE_AGENT_INSTRUCTIONS,
        )
        response = await plain_agent.arun(input=input_text)
    except Exception as exc:
        logger.exception("Console plain agent query failed")
        if operation_id is not None:
            fb_duration_ms = int((time.time() - t0_fb) * 1000)
            await manager.broadcast_ai_progress(
                user_id=user_id,
                operation_id=operation_id,
                stage_data=AiProgressStage(
                    stage="fallback",
                    status="failed",
                    model=model_id,
                    tier="fallback",
                    message=f"Fallback failed: {exc}",
                    metadata={"error": str(exc)},
                    duration_ms=fb_duration_ms,
                ),
            )
        return {
            "type": "error",
            "content": f"AI query failed: {exc}",
        }

    content = response.content if hasattr(response, "content") else str(response)
    if operation_id is not None:
        fb_duration_ms = int((time.time() - t0_fb) * 1000)
        await manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,
            stage_data=AiProgressStage(
                stage="fallback",
                status="completed",
                model=model_id,
                tier="fallback",
                message="Fallback response ready",
                duration_ms=fb_duration_ms,
            ),
        )
    return {"type": "agent_response", "content": content, "data": {}}


def _build_agent_response(response) -> dict[str, Any]:
    """Build response dict from agno RunResponse with tool metadata."""
    content = response.content if hasattr(response, "content") else str(response)

    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []
    if hasattr(response, "tools") and response.tools:
        for tool_exec in response.tools:
            tool_calls.append({
                "tool_name": getattr(tool_exec, "tool_name", None),
                "tool_args": getattr(tool_exec, "tool_args", None),
                "tool_call_error": getattr(tool_exec, "tool_call_error", None),
            })
            tool_results.append({
                "tool_name": getattr(tool_exec, "tool_name", None),
                "result": getattr(tool_exec, "result", None),
            })

    return {
        "type": "agent_response",
        "content": content,
        "data": {
            "tool_calls": tool_calls,
            "tool_results": tool_results,
        },
    }
