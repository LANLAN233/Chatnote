"""Console router — handles console input, command routing, and skill dispatch."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.console_agent import execute_command
from app.ai.models import get_model_for_user
from app.ai.skills import skill_registry
from app.ai.skills.base import SkillContext
from app.database import get_db
from app.models.models import Server, User
from app.plugins import plugin_manager
from app.routers.ai import smart_create_note
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ConsoleExecuteRequest, NoteCreateWithClassify
from app.services.parser import parse_input

logger = logging.getLogger(__name__)
router = APIRouter(tags=["console"])


@router.post("/api/console/execute", response_model=ApiResponse)
async def console_execute(
    req: ConsoleExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = parse_input(req.input)

    # Skill invocation
    if parsed.is_skill and parsed.skill_name:
        if not req.ai_enabled:
            return ApiResponse(
                success=False,
                data={"type": "error", "content": "$skill requires AI to be enabled. Toggle AI ON."},
                message="AI is disabled",
            )
        result = await _dispatch_skill(parsed.skill_name, parsed.skill_args, current_user.id, db)
        return ApiResponse(success=True, data=result)

    if parsed.is_command and parsed.command:
        result = await execute_command(parsed.command, parsed.command_args, db, current_user.id)
        return ApiResponse(success=True, data=result)

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

    parsed = parse_input(req.input)

    if parsed.is_skill and parsed.skill_name:
        if not req.ai_enabled:
            return ApiResponse(
                success=False,
                data={"type": "error", "content": "$skill requires AI to be enabled. Toggle AI ON."},
                message="AI is disabled",
            )
        result = await _dispatch_skill(
            parsed.skill_name, parsed.skill_args, current_user.id, db,
            server_context={"server_id": server_id, "server_name": server.name}
        )
        return ApiResponse(success=True, data=result)

    if parsed.is_command and parsed.command:
        result = await execute_command(
            parsed.command, parsed.command_args, db, current_user.id,
            server_context={"server_id": server_id, "server_name": server.name}
        )
        return ApiResponse(success=True, data=result)

    smart_req = NoteCreateWithClassify(
        content=req.input,
        server_name=server.name,
        channel_name=None,
        auto_classify=req.ai_enabled,
    )
    note_result = await smart_create_note(smart_req, current_user, db)
    return note_result


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
