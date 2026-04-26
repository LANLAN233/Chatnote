import os
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.models import Server, User
from app.models.server_file import ServerFile
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse

router = APIRouter(prefix="/api/server", tags=["files"])

UPLOAD_ROOT = Path(settings.UPLOAD_DIR) / "servers"

EXCEL_MIMES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
    "text/csv",
}
CODE_EXTENSIONS = {".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".css",
                   ".html", ".xml", ".yaml", ".yml", ".toml", ".sql", ".sh", ".bat"}
IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/svg+xml", "image/webp"}
TEXT_MIMES = {"text/plain", "text/markdown", "text/csv"}


def _categorize(filename: str, mime_type: str | None) -> str:
    ext = os.path.splitext(filename)[1].lower()
    if mime_type and mime_type in IMAGE_MIMES:
        return "image"
    if mime_type and mime_type in EXCEL_MIMES:
        return "spreadsheet"
    if ext in CODE_EXTENSIONS:
        return "code"
    if mime_type and (mime_type in TEXT_MIMES or mime_type and mime_type.startswith("text/")):
        return "document"
    if mime_type and mime_type == "application/pdf":
        return "document"
    return "other"


@router.get("/{server_id}/files", response_model=ApiResponse)
async def list_server_files(
    server_id: int,
    category: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server = await db.get(Server, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    stmt = select(ServerFile).where(ServerFile.server_id == server_id)
    if category:
        stmt = stmt.where(ServerFile.file_category == category)
    stmt = stmt.order_by(ServerFile.created_at.desc())

    result = await db.execute(stmt)
    files = result.scalars().all()

    return ApiResponse(success=True, data={
        "files": [
            {
                "id": f.id,
                "filename": f.original_name,
                "file_type": f.file_type,
                "file_size": f.file_size,
                "file_category": f.file_category,
                "created_at": f.created_at.isoformat() if f.created_at else None,
                "url": f"/api/server/{server_id}/files/{f.id}/download",
            }
            for f in files
        ],
    })


@router.post("/{server_id}/files", response_model=ApiResponse)
async def upload_server_file(
    server_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server = await db.get(Server, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    # Generate unique filename
    ext = os.path.splitext(file.filename)[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    server_dir = UPLOAD_ROOT / str(server_id)
    server_dir.mkdir(parents=True, exist_ok=True)

    file_path = server_dir / unique_name
    content = await file.read()
    file_path.write_bytes(content)

    category = _categorize(file.filename, file.content_type)

    db_file = ServerFile(
        server_id=server_id,
        uploader_id=current_user.id,
        filename=unique_name,
        original_name=file.filename,
        file_path=str(file_path.relative_to(UPLOAD_ROOT.parent)),
        file_type=file.content_type or "application/octet-stream",
        file_size=len(content),
        file_category=category,
    )
    db.add(db_file)
    await db.commit()
    await db.refresh(db_file)

    return ApiResponse(success=True, data={
        "id": db_file.id,
        "filename": db_file.original_name,
        "file_type": db_file.file_type,
        "file_size": db_file.file_size,
        "file_category": db_file.file_category,
    }, message="File uploaded")


@router.get("/{server_id}/files/{file_id}/download")
async def download_server_file(
    server_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server = await db.get(Server, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    db_file = await db.get(ServerFile, file_id)
    if not db_file or db_file.server_id != server_id:
        raise HTTPException(status_code=404, detail="File not found")

    full_path = UPLOAD_ROOT.parent / db_file.file_path
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="File not found on disk")

    return FileResponse(
        path=str(full_path),
        filename=db_file.original_name,
        media_type=db_file.file_type,
    )


@router.delete("/{server_id}/files/{file_id}", response_model=ApiResponse)
async def delete_server_file(
    server_id: int,
    file_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server = await db.get(Server, server_id)
    if not server or server.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Server not found")

    db_file = await db.get(ServerFile, file_id)
    if not db_file or db_file.server_id != server_id:
        raise HTTPException(status_code=404, detail="File not found")

    full_path = UPLOAD_ROOT.parent / db_file.file_path
    if full_path.exists():
        full_path.unlink()

    await db.delete(db_file)
    await db.commit()
    return ApiResponse(success=True, message="File deleted")
