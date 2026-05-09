from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.models.models import Channel, Note, Server, Thread, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, NoteCreate, NoteListResponse, NoteResponse, NoteUpdate, ThreadCreate, ThreadMessageCreate, ThreadResponse
from app.services.websocket import manager as ws_manager

router = APIRouter(tags=["notes"])


@router.get("/api/channels/{channel_id}/notes", response_model=ApiResponse)
async def list_notes(
    channel_id: int,
    search: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(Note.channel_id == channel_id, Note.user_id == current_user.id)
        .where(Note.thread_id.is_(None))
    )

    if search:
        query = query.where(Note.content.ilike(f"%{search}%"))

    query = query.order_by(Note.created_at.desc())
    result = await db.execute(query)
    notes = result.scalars().all()

    return ApiResponse(
        success=True,
        data=NoteListResponse(
            items=[NoteResponse.model_validate(n) for n in notes],
            total=len(notes),
            page=1,
            page_size=len(notes),
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
        reply_to_id=note_in.reply_to_id,
        user_tags=note_in.user_tags,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments", "reply_to"])
    
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
            select(Note)
            .options(selectinload(Note.attachments))
            .options(selectinload(Note.reply_to))
            .where(Note.id.in_(fts_ids), Note.user_id == current_user.id)
            .order_by(Note.created_at.desc())
        )
    else:
        result = await db.execute(
            select(Note)
            .options(selectinload(Note.attachments))
            .options(selectinload(Note.reply_to))
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
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(Note.id == note_id, Note.user_id == current_user.id)
    )
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
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    update_data = note_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(note, key, value)
    note.is_edited = True
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments", "reply_to"])
    
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


# Phase 12: Pin / Unpin
@router.put("/api/notes/{note_id}/pin", response_model=ApiResponse)
async def toggle_pin(
    note_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    note.is_pinned = not note.is_pinned
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments", "reply_to"])

    await ws_manager.broadcast_note_updated(current_user.id, NoteResponse.model_validate(note).model_dump())

    action = "pinned" if note.is_pinned else "unpinned"
    return ApiResponse(success=True, data=NoteResponse.model_validate(note).model_dump(), message=f"Note {action}")


# Phase 12: List pinned notes in a channel
@router.get("/api/channels/{channel_id}/pinned", response_model=ApiResponse)
async def list_pinned(
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(
            Note.channel_id == channel_id,
            Note.user_id == current_user.id,
            Note.is_pinned == True,
        )
        .order_by(Note.created_at.desc())
    )
    notes = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[NoteResponse.model_validate(n).model_dump() for n in notes],
    )


# Phase 12: Update user tags
@router.put("/api/notes/{note_id}/tags", response_model=ApiResponse)
async def update_tags(
    note_id: int,
    tags: list[str],
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .options(selectinload(Note.reply_to))
        .where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")
    import json
    note.user_tags = json.dumps(tags)
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments", "reply_to"])

    await ws_manager.broadcast_note_updated(current_user.id, NoteResponse.model_validate(note).model_dump())

    return ApiResponse(success=True, data=NoteResponse.model_validate(note).model_dump(), message="Tags updated")


# ── Phase 13: Thread CRUD ──────────────────────────────────────────────

@router.post("/api/notes/{note_id}/thread", response_model=ApiResponse, status_code=201)
async def create_thread(
    note_id: int,
    thread_in: ThreadCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate parent note exists and belongs to current user
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Default title: first 20 chars of parent content + "的讨论串"
    title = thread_in.title or (note.content[:20] + "的讨论串")

    thread = Thread(
        channel_id=note.channel_id,
        parent_note_id=note.id,
        title=title,
        created_by=current_user.id,
    )
    db.add(thread)
    await db.flush()

    # Set thread_id on parent note
    note.thread_id = thread.id
    await db.flush()
    await db.refresh(thread)

    return ApiResponse(
        success=True,
        data=ThreadResponse.model_validate(thread).model_dump(),
        message="Thread created",
    )


@router.get("/api/threads/{thread_id}", response_model=ApiResponse)
async def get_thread(
    thread_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Thread)
        .options(selectinload(Thread.notes).selectinload(Note.attachments))
        .options(selectinload(Thread.notes).selectinload(Note.reply_to))
        .where(Thread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Validate user owns the parent note (or channel)
    parent_result = await db.execute(
        select(Note).where(Note.id == thread.parent_note_id, Note.user_id == current_user.id)
    )
    if not parent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Thread not found")

    thread_data = ThreadResponse.model_validate(thread)
    thread_data.messages = [NoteResponse.model_validate(n) for n in thread.notes]

    return ApiResponse(success=True, data=thread_data.model_dump())


@router.put("/api/threads/{thread_id}", response_model=ApiResponse)
async def update_thread(
    thread_id: int,
    body: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Thread).where(Thread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Validate user owns the parent note
    parent_result = await db.execute(
        select(Note).where(Note.id == thread.parent_note_id, Note.user_id == current_user.id)
    )
    if not parent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Thread not found")

    if "title" in body and body["title"]:
        thread.title = body["title"]

    await db.flush()
    await db.refresh(thread)

    return ApiResponse(
        success=True,
        data=ThreadResponse.model_validate(thread).model_dump(),
        message="Thread updated",
    )


@router.post("/api/threads/{thread_id}/messages", response_model=ApiResponse, status_code=201)
async def create_thread_message(
    thread_id: int,
    msg_in: ThreadMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Thread).where(Thread.id == thread_id)
    )
    thread = result.scalar_one_or_none()
    if not thread:
        raise HTTPException(status_code=404, detail="Thread not found")

    # Validate user owns the parent note
    parent_result = await db.execute(
        select(Note).where(Note.id == thread.parent_note_id, Note.user_id == current_user.id)
    )
    if not parent_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Thread not found")

    note = Note(
        channel_id=thread.channel_id,
        user_id=current_user.id,
        content=msg_in.content,
        content_type="markdown",
        thread_id=thread.id,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments", "reply_to"])

    return ApiResponse(
        success=True,
        data=NoteResponse.model_validate(note).model_dump(),
        message="Message posted to thread",
    )


@router.get("/api/channels/{channel_id}/threads", response_model=ApiResponse)
async def list_channel_threads(
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all threads in a channel created by the current user."""
    query = (
        select(Thread)
        .options(selectinload(Thread.notes))
        .where(Thread.channel_id == channel_id, Thread.created_by == current_user.id)
        .order_by(Thread.updated_at.desc())
    )
    result = await db.execute(query)
    threads = result.scalars().all()

    return ApiResponse(
        success=True,
        data=[ThreadResponse.model_validate(t).model_dump() for t in threads],
    )