import os
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models import Attachment, Note
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, AttachmentResponse
from app.services.websocket import manager

router = APIRouter(prefix="/api/attachments", tags=["attachments"])

UPLOAD_DIR = Path(settings.UPLOAD_DIR)
UPLOAD_DIR.mkdir(exist_ok=True)


@router.post("/temp-upload", response_model=ApiResponse)
async def temp_upload(
    file: UploadFile = File(...),
    current_user = Depends(get_current_user),
):
    """Upload a temporary image for AI vision processing."""
    temp_dir = UPLOAD_DIR / "temp" / str(current_user.id)
    temp_dir.mkdir(parents=True, exist_ok=True)

    file_ext = Path(file.filename).suffix
    safe_filename = f"temp_{int(__import__('time').time())}{file_ext}"
    file_path = temp_dir / safe_filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Return a relative URL that can be used by the AI endpoint
    relative = file_path.relative_to(UPLOAD_DIR)
    return ApiResponse(
        success=True,
        data={"url": f"/uploads/temp/{current_user.id}/{safe_filename}", "filename": file.filename},
        message="Image uploaded",
    )


@router.post("/upload/{note_id}", response_model=ApiResponse)
async def upload_attachment(
    note_id: int,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # Verify note exists and belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    # Create user directory
    user_dir = UPLOAD_DIR / str(current_user.id)
    user_dir.mkdir(exist_ok=True)

    # Save file
    file_ext = Path(file.filename).suffix
    safe_filename = f"{note_id}_{int(__import__('time').time())}{file_ext}"
    file_path = user_dir / safe_filename

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    # Create attachment record
    attachment = Attachment(
        note_id=note_id,
        filename=file.filename,
        file_path=str(file_path.relative_to(UPLOAD_DIR)),
        file_type=file.content_type,
        file_size=os.path.getsize(file_path),
    )
    db.add(attachment)
    await db.flush()
    await db.refresh(attachment)

    return ApiResponse(
        success=True,
        data=AttachmentResponse.model_validate(attachment).model_dump(),
        message="File uploaded successfully",
    )


@router.get("/note/{note_id}", response_model=ApiResponse)
async def get_note_attachments(
    note_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    # Verify note belongs to user
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found")

    result = await db.execute(
        select(Attachment).where(Attachment.note_id == note_id)
    )
    attachments = result.scalars().all()

    return ApiResponse(
        success=True,
        data=[AttachmentResponse.model_validate(a).model_dump() for a in attachments],
    )


@router.delete("/{attachment_id}", response_model=ApiResponse)
async def delete_attachment(
    attachment_id: int,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    result = await db.execute(
        select(Attachment).where(Attachment.id == attachment_id)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    # Verify note belongs to user
    result = await db.execute(
        select(Note).where(Note.id == attachment.note_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=403, detail="Not authorized to delete this attachment")

    # Delete file
    file_path = UPLOAD_DIR / attachment.file_path
    if file_path.exists():
        file_path.unlink()

    await db.delete(attachment)

    return ApiResponse(success=True, message="Attachment deleted successfully")
