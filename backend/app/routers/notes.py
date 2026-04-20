from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Channel, Note, Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, NoteCreate, NoteListResponse, NoteResponse, NoteUpdate
from app.services.websocket import manager as ws_manager

router = APIRouter(tags=["notes"])


@router.get("/api/channels/{channel_id}/notes", response_model=ApiResponse)
async def list_notes(
    channel_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Note).where(Note.channel_id == channel_id, Note.user_id == current_user.id)
    count_query = select(func.count()).select_from(Note).where(
        Note.channel_id == channel_id, Note.user_id == current_user.id
    )

    if search:
        search_filter = Note.content.ilike(f"%{search}%")
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    offset = (page - 1) * page_size
    query = query.order_by(Note.created_at.desc()).offset(offset).limit(page_size)
    result = await db.execute(query)
    notes = result.scalars().all()

    return ApiResponse(
        success=True,
        data=NoteListResponse(
            items=[NoteResponse.model_validate(n) for n in notes],
            total=total,
            page=page,
            page_size=page_size,
        ).model_dump(),
    )


@router.post("/api/notes", response_model=ApiResponse, status_code=201)
async def create_note(
    note_in: NoteCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Channel).where(Channel.id == note_in.channel_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    note = Note(
        channel_id=note_in.channel_id,
        user_id=current_user.id,
        content=note_in.content,
        content_type=note_in.content_type,
        raw_input=note_in.raw_input,
        ai_category=note_in.ai_category,
        ai_summary=note_in.ai_summary,
        ai_confidence=note_in.ai_confidence,
        ai_tags=note_in.ai_tags,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    
    # Broadcast via WebSocket
    await ws_manager.broadcast_note_created(current_user.id, NoteResponse.model_validate(note).model_dump())
    
    return ApiResponse(success=True, data=NoteResponse.model_validate(note).model_dump(), message="Note created")


@router.get("/api/notes/search", response_model=ApiResponse)
async def search_notes(
    q: str = Query(..., min_length=1),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fts_ids = []
    try:
        from app.services.search import fts_search
        fts_ids = await fts_search(db, q, current_user.id, 20)
    except Exception:
        pass

    if fts_ids:
        result = await db.execute(
            select(Note).where(Note.id.in_(fts_ids), Note.user_id == current_user.id).order_by(Note.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Note)
            .where(Note.user_id == current_user.id, Note.content.ilike(f"%{q}%"))
            .order_by(Note.created_at.desc())
        )
    notes = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[NoteResponse.model_validate(n).model_dump() for n in notes],
    )


@router.get("/api/notes/{note_id}", response_model=ApiResponse)
async def get_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == current_user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    return ApiResponse(success=True, data=NoteResponse.model_validate(note).model_dump())


@router.put("/api/notes/{note_id}", response_model=ApiResponse)
async def update_note(
    note_id: int,
    note_in: NoteUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == current_user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    update_data = note_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)
    note.is_edited = True
    await db.flush()
    await db.refresh(note)
    
    # Broadcast via WebSocket
    await ws_manager.broadcast_note_updated(current_user.id, NoteResponse.model_validate(note).model_dump())
    
    return ApiResponse(success=True, data=NoteResponse.model_validate(note).model_dump(), message="Note updated")


@router.delete("/api/notes/{note_id}", response_model=ApiResponse)
async def delete_note(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Note).where(Note.id == note_id, Note.user_id == current_user.id))
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    await db.delete(note)
    
    # Broadcast via WebSocket
    await ws_manager.broadcast_note_deleted(current_user.id, note_id)
    
    return ApiResponse(success=True, message="Note deleted")