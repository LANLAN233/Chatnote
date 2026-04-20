from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ConsoleExecuteRequest
from app.services.console import execute_command
from app.services.parser import parse_input
from app.routers.ai import smart_create_note
from app.schemas.schemas import NoteCreateWithClassify

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

    smart_req = NoteCreateWithClassify(
        content=req.input,
        server_name=None,
        channel_name=None,
        auto_classify=True,
    )
    return await smart_create_note(smart_req, current_user, db)
