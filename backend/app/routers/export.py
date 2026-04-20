import json
from datetime import datetime
from io import BytesIO, StringIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Channel, Note, Schedule, Server, User
from app.routers.auth import get_current_user

router = APIRouter(prefix="/api/export", tags=["export"])


@router.get("/markdown")
async def export_markdown(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all notes as markdown files in a zip archive."""
    import zipfile

    # Get all user's servers and channels
    result = await db.execute(select(Server).where(Server.user_id == current_user.id))
    servers = result.scalars().all()

    zip_buffer = BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for server in servers:
            result = await db.execute(
                select(Channel).where(Channel.server_id == server.id)
            )
            channels = result.scalars().all()

            for channel in channels:
                result = await db.execute(
                    select(Note).where(Note.channel_id == channel.id)
                )
                notes = result.scalars().all()

                for note in notes:
                    # Create markdown content
                    md_content = f"""# Note from {channel.name}

**Server:** {server.name}  
**Channel:** {channel.name}  
**Created:** {note.created_at.strftime('%Y-%m-%d %H:%M')}

---

{note.content}

---

**Tags:** {note.ai_tags or 'None'}
**Summary:** {note.ai_summary or 'None'}
"""
                    # Sanitize filename
                    safe_server = "".join(c for c in server.name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                    safe_channel = "".join(c for c in channel.name if c.isalnum() or c in (' ', '-', '_')).rstrip()
                    filename = f"{safe_server}/{safe_channel}/note_{note.id}_{note.created_at.strftime('%Y%m%d')}.md"
                    zip_file.writestr(filename, md_content)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename=notes_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
        },
    )


@router.get("/json")
async def export_json(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all data as JSON."""
    result = await db.execute(select(Server).where(Server.user_id == current_user.id))
    servers = result.scalars().all()

    export_data = {
        "exported_at": datetime.now().isoformat(),
        "user": {
            "id": current_user.id,
            "username": current_user.username,
            "display_name": current_user.display_name,
        },
        "servers": [],
    }

    for server in servers:
        server_data = {
            "id": server.id,
            "name": server.name,
            "description": server.description,
            "channels": [],
        }

        result = await db.execute(
            select(Channel).where(Channel.server_id == server.id)
        )
        channels = result.scalars().all()

        for channel in channels:
            channel_data = {
                "id": channel.id,
                "name": channel.name,
                "description": channel.description,
                "notes": [],
            }

            result = await db.execute(
                select(Note).where(Note.channel_id == channel.id)
            )
            notes = result.scalars().all()

            for note in notes:
                note_data = {
                    "id": note.id,
                    "content": note.content,
                    "content_type": note.content_type,
                    "ai_summary": note.ai_summary,
                    "ai_tags": note.ai_tags,
                    "created_at": note.created_at.isoformat() if note.created_at else None,
                    "updated_at": note.updated_at.isoformat() if note.updated_at else None,
                }
                channel_data["notes"].append(note_data)

            server_data["channels"].append(channel_data)

        export_data["servers"].append(server_data)

    # Get schedules
    result = await db.execute(
        select(Schedule).where(Schedule.user_id == current_user.id)
    )
    schedules = result.scalars().all()
    export_data["schedules"] = [
        {
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "start_time": s.start_time.isoformat() if s.start_time else None,
            "end_time": s.end_time.isoformat() if s.end_time else None,
            "date": s.date.isoformat() if s.date else None,
            "day_of_week": s.day_of_week,
            "repeat_rule": s.repeat_rule,
            "color": s.color,
        }
        for s in schedules
    ]

    json_content = json.dumps(export_data, ensure_ascii=False, indent=2)

    return StreamingResponse(
        StringIO(json_content),
        media_type="application/json",
        headers={
            "Content-Disposition": f"attachment; filename=notes_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        },
    )
