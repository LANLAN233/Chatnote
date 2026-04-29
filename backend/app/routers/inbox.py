"""Inbox router — temporary note storage with AI classification suggestions."""

import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.classification import classify_note, resolve_classification
from app.database import get_db
from app.models.models import Channel, InboxItem, Note, Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    ApiResponse,
    InboxItemArchiveRequest,
    InboxItemCreate,
    InboxItemResponse,
    InboxItemUpdate,
    NoteResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["inbox"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _inbox_to_dict(item: InboxItem) -> dict:
    return {
        "id": item.id,
        "user_id": item.user_id,
        "content": item.content,
        "raw_input": item.raw_input,
        "ai_suggested_server": item.ai_suggested_server,
        "ai_suggested_channel": item.ai_suggested_channel,
        "ai_tags": item.ai_tags,
        "ai_summary": item.ai_summary,
        "ai_confidence": item.ai_confidence,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("/api/inbox", response_model=ApiResponse)
async def list_inbox(
    status: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List inbox items for the current user."""
    query = select(InboxItem).where(InboxItem.user_id == current_user.id)
    if status:
        query = query.where(InboxItem.status == status)
    query = query.order_by(InboxItem.created_at.desc())
    result = await db.execute(query)
    items = result.scalars().all()
    return ApiResponse(success=True, data=[_inbox_to_dict(i) for i in items])


@router.post("/api/inbox", response_model=ApiResponse, status_code=201)
async def create_inbox(
    req: InboxItemCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new inbox item."""
    item = InboxItem(
        user_id=current_user.id,
        content=req.content,
        raw_input=req.raw_input,
    )
    db.add(item)
    await db.flush()
    await db.refresh(item)
    return ApiResponse(success=True, data=_inbox_to_dict(item), message="Inbox item created")


@router.get("/api/inbox/{item_id}", response_model=ApiResponse)
async def get_inbox(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get a single inbox item."""
    item = await db.get(InboxItem, item_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    return ApiResponse(success=True, data=_inbox_to_dict(item))


@router.put("/api/inbox/{item_id}", response_model=ApiResponse)
async def update_inbox(
    item_id: int,
    req: InboxItemUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update an inbox item (e.g., manual classification suggestions)."""
    item = await db.get(InboxItem, item_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Inbox item not found")

    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.flush()
    await db.refresh(item)
    return ApiResponse(success=True, data=_inbox_to_dict(item), message="Inbox item updated")


@router.delete("/api/inbox/{item_id}", response_model=ApiResponse)
async def delete_inbox(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an inbox item."""
    item = await db.get(InboxItem, item_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Inbox item not found")
    await db.delete(item)
    await db.flush()
    return ApiResponse(success=True, message="Inbox item deleted")


# ---------------------------------------------------------------------------
# AI Suggestion
# ---------------------------------------------------------------------------

@router.post("/api/inbox/{item_id}/ai-suggest", response_model=ApiResponse)
async def inbox_ai_suggest(
    item_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Run AI classification on an inbox item and save suggestions."""
    item = await db.get(InboxItem, item_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Inbox item not found")

    classification = await classify_note(item.content, db, current_user.id)
    classification = await resolve_classification(classification, db, current_user.id)

    item.ai_suggested_server = classification.get("suggested_server")
    item.ai_suggested_channel = classification.get("suggested_channel")
    item.ai_confidence = classification.get("confidence")
    item.ai_summary = classification.get("summary")
    item.ai_tags = json.dumps(classification.get("tags", []), ensure_ascii=False)

    await db.flush()
    await db.refresh(item)
    return ApiResponse(
        success=True,
        data=_inbox_to_dict(item),
        message="AI classification suggestion generated",
    )


# ---------------------------------------------------------------------------
# Archive
# ---------------------------------------------------------------------------

@router.post("/api/inbox/{item_id}/archive", response_model=ApiResponse)
async def inbox_archive(
    item_id: int,
    req: InboxItemArchiveRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Archive an inbox item to a specific server/channel.

    If create_server_name is provided, a new server (and optionally channel) will be created.
    """
    item = await db.get(InboxItem, item_id)
    if not item or item.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Inbox item not found")

    server_id = req.server_id
    channel_id = req.channel_id

    # Create new server if requested
    if req.create_server_name:
        srv_result = await db.execute(
            select(Server).where(
                Server.name == req.create_server_name,
                Server.user_id == current_user.id,
            )
        )
        server = srv_result.scalar_one_or_none()
        if not server:
            server = Server(user_id=current_user.id, name=req.create_server_name)
            db.add(server)
            await db.flush()
            await db.refresh(server)
        server_id = server.id

        # Create channel if requested or fallback to "General"
        if req.create_channel_name:
            ch_result = await db.execute(
                select(Channel).where(
                    Channel.server_id == server_id,
                    Channel.name == req.create_channel_name,
                )
            )
            channel = ch_result.scalar_one_or_none()
            if not channel:
                channel = Channel(server_id=server_id, name=req.create_channel_name)
                db.add(channel)
                await db.flush()
                await db.refresh(channel)
            channel_id = channel.id
        else:
            # Auto-create General channel if none exists
            ch_result = await db.execute(
                select(Channel)
                .where(Channel.server_id == server_id)
                .order_by(Channel.sort_order)
                .limit(1)
            )
            channel = ch_result.scalar_one_or_none()
            if not channel:
                channel = Channel(server_id=server_id, name="General")
                db.add(channel)
                await db.flush()
                await db.refresh(channel)
            channel_id = channel.id

    if not server_id or not channel_id:
        raise HTTPException(status_code=400, detail="Target server and channel must be specified")

    # Create the actual note
    note = Note(
        channel_id=channel_id,
        user_id=current_user.id,
        content=item.content,
        content_type="markdown",
        raw_input=item.raw_input,
        ai_category=item.ai_suggested_server,
        ai_summary=item.ai_summary,
        ai_confidence=item.ai_confidence,
        ai_tags=item.ai_tags,
    )
    db.add(note)

    # Mark inbox item as archived
    item.status = "archived"
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments"])

    return ApiResponse(
        success=True,
        data={
            "note": NoteResponse.model_validate(note).model_dump(),
            "server_id": server_id,
            "channel_id": channel_id,
            "inbox_item_id": item.id,
        },
        message="Inbox item archived successfully",
    )
