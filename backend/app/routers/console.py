"""Console router — handles console input, command routing, skill dispatch, and session management."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.console_agent import execute_command
from app.ai.intent_router import analyze_intent
from app.ai.models import get_model_for_user
from app.ai.skills import skill_registry
from app.ai.skills.base import SkillContext
from app.database import get_db
from app.models.models import Channel, ConsoleMessage, ConsoleSession, Note, Server, User
from app.plugins import plugin_manager
from app.routers.ai import smart_create_note
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    ApiResponse,
    ConsoleArchiveRequest,
    ConsoleExecuteRequest,
    ConsoleSessionCreate,
    ConsoleSessionResponse,
    ConsoleSessionUpdate,
    NoteCreateWithClassify,
)
from app.services.parser import parse_input

logger = logging.getLogger(__name__)
router = APIRouter(tags=["console"])


def _session_to_dict(session: ConsoleSession, include_messages: bool = False) -> dict:
    """Manually serialize a ConsoleSession to avoid async greenlet issues."""
    data: dict = {
        "id": session.id,
        "user_id": session.user_id,
        "server_id": session.server_id,
        "title": session.title,
        "created_at": session.created_at,
        "updated_at": session.updated_at,
    }
    if include_messages:
        data["messages"] = [
            {
                "id": m.id,
                "session_id": m.session_id,
                "role": m.role,
                "content": m.content,
                "type": m.type,
                "created_at": m.created_at,
            }
            for m in session.messages
        ]
    return data


# ---------------------------------------------------------------------------
# Session CRUD
# ---------------------------------------------------------------------------

@router.get("/api/console/sessions", response_model=ApiResponse)
async def list_sessions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all console sessions for the current user."""
    result = await db.execute(
        select(ConsoleSession)
        .where(ConsoleSession.user_id == current_user.id)
        .order_by(ConsoleSession.updated_at.desc())
    )
    sessions = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[_session_to_dict(s) for s in sessions],
    )


@router.post("/api/console/sessions", response_model=ApiResponse)
async def create_session(
    req: ConsoleSessionCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new console session."""
    session = ConsoleSession(
        user_id=current_user.id,
        server_id=req.server_id,
        title=req.title or "New Session",
    )
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return ApiResponse(
        success=True,
        data=_session_to_dict(session),
        message="Session created",
    )


@router.get("/api/console/sessions/{session_id}", response_model=ApiResponse)
async def get_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a session with its messages."""
    session = await db.get(ConsoleSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Eager load messages
    await db.refresh(session, attribute_names=["messages"])
    return ApiResponse(
        success=True,
        data=_session_to_dict(session, include_messages=True),
    )


@router.put("/api/console/sessions/{session_id}", response_model=ApiResponse)
async def update_session(
    session_id: int,
    req: ConsoleSessionUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update session title."""
    session = await db.get(ConsoleSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    if req.title is not None:
        session.title = req.title
    await db.flush()
    await db.refresh(session)
    return ApiResponse(
        success=True,
        data=_session_to_dict(session),
        message="Session updated",
    )


@router.delete("/api/console/sessions/{session_id}", response_model=ApiResponse)
async def delete_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a session and all its messages."""
    session = await db.get(ConsoleSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    await db.delete(session)
    await db.flush()
    return ApiResponse(success=True, data=None, message="Session deleted")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _get_or_create_session(
    session_id: int | None,
    user_id: int,
    server_id: int | None,
    db: AsyncSession,
) -> ConsoleSession:
    """Retrieve an existing session or create a default one."""
    if session_id:
        session = await db.get(ConsoleSession, session_id)
        if session and session.user_id == user_id:
            return session
    # Create a default session if none provided or not found
    session = ConsoleSession(user_id=user_id, server_id=server_id, title="New Session")
    db.add(session)
    await db.flush()
    await db.refresh(session)
    return session


async def _save_message(
    session_id: int,
    role: str,
    content: str,
    msg_type: str,
    db: AsyncSession,
) -> ConsoleMessage:
    """Persist a console message."""
    msg = ConsoleMessage(
        session_id=session_id,
        role=role,
        content=content,
        type=msg_type,
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def _clear_session_messages(session_id: int, db: AsyncSession) -> None:
    """Remove all messages from a session."""
    result = await db.execute(
        select(ConsoleMessage).where(ConsoleMessage.session_id == session_id)
    )
    for msg in result.scalars().all():
        await db.delete(msg)
    await db.flush()


async def _dispatch_skill(
    skill_name: str,
    skill_args: str,
    user_id: int,
    db: AsyncSession,
    server_context: dict | None = None,
) -> dict:
    model = await get_model_for_user(user_id, db)
    if model is None:
        return {"type": "error", "content": "No AI model configured. Add an API key in Settings."}

    context = SkillContext(
        user_id=user_id,
        db=db,
        model=model,
        server_context=server_context,
    )
    result = await skill_registry.dispatch(skill_name, skill_args, context)
    return {"type": result.type, "content": result.content, "data": result.data}


# ---------------------------------------------------------------------------
# Execute endpoints
# ---------------------------------------------------------------------------

@router.post("/api/console/execute", response_model=ApiResponse)
async def console_execute(
    req: ConsoleExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await _get_or_create_session(req.session_id, current_user.id, None, db)

    # Save user input
    await _save_message(session.id, "user", req.input, "text", db)

    parsed = parse_input(req.input)

    # Skill invocation
    if parsed.is_skill and parsed.skill_name:
        if not req.ai_enabled:
            msg = await _save_message(
                session.id,
                "assistant",
                "$skill requires AI to be enabled. Toggle AI ON.",
                "error",
                db,
            )
            return ApiResponse(
                success=False,
                data={"type": "error", "content": msg.content, "session_id": session.id},
                message="AI is disabled",
            )
        result = await _dispatch_skill(parsed.skill_name, parsed.skill_args, current_user.id, db)
        await _save_message(session.id, "assistant", result.get("content", ""), result.get("type", "text"), db)
        return ApiResponse(success=True, data={**result, "session_id": session.id})

    if parsed.is_command and parsed.command:
        if parsed.command == "clear":
            await _clear_session_messages(session.id, db)
            await _save_message(session.id, "system", "Session cleared.", "clear", db)
            return ApiResponse(success=True, data={"type": "clear", "content": "Session cleared.", "session_id": session.id})

        result = await execute_command(parsed.command, parsed.command_args, db, current_user.id)
        await _save_message(session.id, "assistant", result.get("content", ""), result.get("type", "text"), db)
        return ApiResponse(success=True, data={**result, "session_id": session.id})

    # --- AI Intent Routing (natural language → skill auto-match) ---
    if req.ai_enabled:
        model = await get_model_for_user(current_user.id, db)
        if model is not None:
            intent_result = await analyze_intent(
                req.input, model, skill_registry.list_skills(), threshold=0.75
            )
            if intent_result.skill_name:
                # Auto-dispatch to matched skill
                skill_result = await _dispatch_skill(
                    intent_result.skill_name,
                    intent_result.args or req.input,
                    current_user.id,
                    db,
                )
                await _save_message(
                    session.id, "assistant",
                    skill_result.get("content", ""),
                    skill_result.get("type", "text"),
                    db,
                )
                return ApiResponse(
                    success=True,
                    data={
                        **skill_result,
                        "session_id": session.id,
                        "routed_by_intent": intent_result.intent,
                        "routed_skill": intent_result.skill_name,
                    },
                )

    # Dispatch to plugins first
    plugin_responses = await plugin_manager.dispatch_message(
        req.input, {"user_id": current_user.id}
    )

    # Create the note via smart classification
    smart_req = NoteCreateWithClassify(
        content=req.input,
        server_name=None,
        channel_name=None,
        auto_classify=req.ai_enabled,
    )
    note_result = await smart_create_note(smart_req, current_user, db)

    if plugin_responses:
        if note_result.data is None:
            note_result.data = {}
        if isinstance(note_result.data, dict):
            note_result.data["plugin_responses"] = plugin_responses

    # Save assistant response (note creation result)
    if note_result.data and isinstance(note_result.data, dict) and "note" in note_result.data:
        await _save_message(session.id, "assistant", "Note saved successfully.", "note", db)
    else:
        content = note_result.message or "Note processed."
        await _save_message(session.id, "assistant", content, "text", db)

    if isinstance(note_result.data, dict):
        note_result.data["session_id"] = session.id
    else:
        note_result.data = {"session_id": session.id}

    return note_result


@router.post("/api/server/{server_id}/console/execute", response_model=ApiResponse)
async def server_console_execute(
    server_id: int,
    req: ConsoleExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Console scoped to a specific server."""
    server = await db.get(Server, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    session = await _get_or_create_session(req.session_id, current_user.id, server_id, db)

    # Save user input
    await _save_message(session.id, "user", req.input, "text", db)

    parsed = parse_input(req.input)

    if parsed.is_skill and parsed.skill_name:
        if not req.ai_enabled:
            msg = await _save_message(
                session.id,
                "assistant",
                "$skill requires AI to be enabled. Toggle AI ON.",
                "error",
                db,
            )
            return ApiResponse(
                success=False,
                data={"type": "error", "content": msg.content, "session_id": session.id},
                message="AI is disabled",
            )
        result = await _dispatch_skill(
            parsed.skill_name, parsed.skill_args, current_user.id, db,
            server_context={"server_id": server_id, "server_name": server.name}
        )
        await _save_message(session.id, "assistant", result.get("content", ""), result.get("type", "text"), db)
        return ApiResponse(success=True, data={**result, "session_id": session.id})

    if parsed.is_command and parsed.command:
        if parsed.command == "clear":
            await _clear_session_messages(session.id, db)
            await _save_message(session.id, "system", "Session cleared.", "clear", db)
            return ApiResponse(success=True, data={"type": "clear", "content": "Session cleared.", "session_id": session.id})

        result = await execute_command(
            parsed.command, parsed.command_args, db, current_user.id,
            server_context={"server_id": server_id, "server_name": server.name}
        )
        await _save_message(session.id, "assistant", result.get("content", ""), result.get("type", "text"), db)
        return ApiResponse(success=True, data={**result, "session_id": session.id})

    # --- AI Intent Routing (natural language → skill auto-match) ---
    if req.ai_enabled:
        model = await get_model_for_user(current_user.id, db)
        if model is not None:
            intent_result = await analyze_intent(
                req.input, model, skill_registry.list_skills(), threshold=0.75
            )
            if intent_result.skill_name:
                skill_result = await _dispatch_skill(
                    intent_result.skill_name,
                    intent_result.args or req.input,
                    current_user.id,
                    db,
                    server_context={"server_id": server_id, "server_name": server.name},
                )
                await _save_message(
                    session.id, "assistant",
                    skill_result.get("content", ""),
                    skill_result.get("type", "text"),
                    db,
                )
                return ApiResponse(
                    success=True,
                    data={
                        **skill_result,
                        "session_id": session.id,
                        "routed_by_intent": intent_result.intent,
                        "routed_skill": intent_result.skill_name,
                    },
                )

    smart_req = NoteCreateWithClassify(
        content=req.input,
        server_name=server.name,
        channel_name=None,
        auto_classify=req.ai_enabled,
    )
    note_result = await smart_create_note(smart_req, current_user, db)

    if note_result.data and isinstance(note_result.data, dict) and "note" in note_result.data:
        await _save_message(session.id, "assistant", "Note saved successfully.", "note", db)
    else:
        content = note_result.message or "Note processed."
        await _save_message(session.id, "assistant", content, "text", db)

    if isinstance(note_result.data, dict):
        note_result.data["session_id"] = session.id
    else:
        note_result.data = {"session_id": session.id}

    return note_result


# ---------------------------------------------------------------------------
# Archive console session to a server/channel
# ---------------------------------------------------------------------------

@router.post("/api/console/sessions/{session_id}/archive", response_model=ApiResponse)
async def archive_session(
    session_id: int,
    req: ConsoleArchiveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive a console session's messages as a note in a server/channel."""
    session = await db.get(ConsoleSession, session_id)
    if not session or session.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Session not found")

    # Verify server/channel ownership
    server = await db.get(Server, req.server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    channel = await db.get(Channel, req.channel_id)
    if not channel or channel.server_id != server.id:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Load messages
    await db.refresh(session, attribute_names=["messages"])
    msgs = session.messages or []

    if not msgs:
        raise HTTPException(status_code=400, detail="Session has no messages to archive")

    # Build markdown content
    lines: list[str] = [f"# {session.title}\n", f"*Archived from Console Session*\n"]
    for msg in msgs:
        role_label = msg.role.capitalize()
        timestamp = msg.created_at.strftime("%Y-%m-%d %H:%M") if msg.created_at else ""
        lines.append(f"**{role_label}** ({timestamp}):\n{msg.content}\n")

    content = "\n".join(lines)

    note = Note(
        channel_id=channel.id,
        user_id=current_user.id,
        content=content,
        content_type="markdown",
        raw_input=f"[Archived from console session #{session.id}]",
        ai_tags='["archive", "console"]',
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    return ApiResponse(
        success=True,
        data={"note_id": note.id, "channel_id": channel.id, "server_id": server.id},
        message="Session archived successfully",
    )
