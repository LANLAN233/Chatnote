from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Channel, Note, Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ClassifyRequest, ClassifyResponse, NoteCreateWithClassify, NoteResponse
from app.services.classifier import classify_note, resolve_classification
from app.services.parser import parse_input

router = APIRouter(tags=["ai"])


@router.post("/api/ai/classify", response_model=ApiResponse)
async def ai_classify(
    req: ClassifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await classify_note(
        req.content, db, current_user.id,
        llm_provider=current_user.preferred_llm,
        api_key=current_user.api_key_encrypted or None,
    )
    return ApiResponse(success=True, data=result)


@router.post("/api/notes/smart-create", response_model=ApiResponse, status_code=201)
async def smart_create_note(
    req: NoteCreateWithClassify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = parse_input(req.content)

    if req.server_name:
        parsed.server_name = req.server_name
    if req.channel_name:
        parsed.channel_name = req.channel_name

    server_id = None
    channel_id = None

    if parsed.server_name or parsed.channel_name:
        if parsed.server_name:
            srv_result = await db.execute(
                select(Server).where(Server.name == parsed.server_name, Server.user_id == current_user.id)
            )
            server = srv_result.scalar_one_or_none()
            if not server:
                server = Server(user_id=current_user.id, name=parsed.server_name)
                db.add(server)
                await db.flush()
                await db.refresh(server)
            server_id = server.id
        else:
            srv_result = await db.execute(
                select(Server).where(Server.user_id == current_user.id).order_by(Server.sort_order).limit(1)
            )
            server = srv_result.scalar_one_or_none()
            if server:
                server_id = server.id

        if parsed.channel_name and server_id:
            ch_result = await db.execute(
                select(Channel).where(Channel.server_id == server_id, Channel.name == parsed.channel_name)
            )
            channel = ch_result.scalar_one_or_none()
            if not channel:
                channel = Channel(server_id=server_id, name=parsed.channel_name)
                db.add(channel)
                await db.flush()
                await db.refresh(channel)
            channel_id = channel.id
        elif server_id:
            ch_result = await db.execute(
                select(Channel).where(Channel.server_id == server_id).order_by(Channel.sort_order).limit(1)
            )
            channel = ch_result.scalar_one_or_none()
            if channel:
                channel_id = channel.id
    elif req.auto_classify:
        classification = await classify_note(
            parsed.content, db, current_user.id,
            llm_provider=current_user.preferred_llm,
            api_key=current_user.api_key_encrypted or None,
        )
        classification = await resolve_classification(classification, db, current_user.id)
        server_id = classification.get("server_id")
        channel_id = classification.get("channel_id")
    else:
        srv_result = await db.execute(
            select(Server).where(Server.user_id == current_user.id).order_by(Server.sort_order).limit(1)
        )
        server = srv_result.scalar_one_or_none()
        if server:
            server_id = server.id
            ch_result = await db.execute(
                select(Channel).where(Channel.server_id == server.id).order_by(Channel.sort_order).limit(1)
            )
            channel = ch_result.scalar_one_or_none()
            if channel:
                channel_id = channel.id

    if not channel_id:
        if not server_id:
            server = Server(user_id=current_user.id, name="General")
            db.add(server)
            await db.flush()
            await db.refresh(server)
            server_id = server.id
        channel = Channel(server_id=server_id, name="General")
        db.add(channel)
        await db.flush()
        await db.refresh(channel)
        channel_id = channel.id

    note = Note(
        channel_id=channel_id,
        user_id=current_user.id,
        content=parsed.content,
        content_type="markdown",
        raw_input=parsed.raw_input or req.content,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)

    return ApiResponse(
        success=True,
        data={
            "note": NoteResponse.model_validate(note).model_dump(),
            "server_id": server_id,
            "channel_id": channel_id,
        },
        message="Note created",
    )


@router.get("/api/stats", response_model=ApiResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server_count = await db.execute(
        select(func.count()).select_from(Server).where(Server.user_id == current_user.id)
    )
    channel_count = await db.execute(
        select(func.count())
        .select_from(Channel)
        .join(Server, Channel.server_id == Server.id)
        .where(Server.user_id == current_user.id)
    )
    note_count = await db.execute(
        select(func.count()).select_from(Note).where(Note.user_id == current_user.id)
    )
    recent_result = await db.execute(
        select(Note)
        .where(Note.user_id == current_user.id)
        .order_by(Note.created_at.desc())
        .limit(10)
    )
    recent_notes = recent_result.scalars().all()

    return ApiResponse(
        success=True,
        data={
            "total_servers": server_count.scalar() or 0,
            "total_channels": channel_count.scalar() or 0,
            "total_notes": note_count.scalar() or 0,
            "recent_notes": [NoteResponse.model_validate(n).model_dump() for n in recent_notes],
        },
    )
