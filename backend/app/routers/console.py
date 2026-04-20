from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User
from app.plugins import plugin_manager
from app.routers.ai import smart_create_note
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ConsoleExecuteRequest, NoteCreateWithClassify
from app.services.console import execute_command
from app.services.parser import parse_input

router = APIRouter(tags=["console"])


@router.post("/api/console/execute", response_model=ApiResponse)
async def console_execute(
    req: ConsoleExecuteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = parse_input(req.input)

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
        auto_classify=True,
    )
    note_result = await smart_create_note(smart_req, current_user, db)

    # Include plugin responses in the result
    if plugin_responses:
        if note_result.data is None:
            note_result.data = {}
        if isinstance(note_result.data, dict):
            note_result.data["plugin_responses"] = plugin_responses

    return note_result
