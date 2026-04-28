from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Channel, Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ChannelCreate, ChannelResponse, ChannelUpdate

router = APIRouter(prefix="/api/servers/{server_id}/channels", tags=["channels"])


async def _verify_server_ownership(server_id: int, current_user: User, db: AsyncSession) -> Server:
    result = await db.execute(select(Server).where(Server.id == server_id, Server.user_id == current_user.id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return server


@router.get("", response_model=ApiResponse)
async def list_channels(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
    result = await db.execute(
        select(Channel).where(Channel.server_id == server_id).order_by(Channel.sort_order, Channel.id)
    )
    channels = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[ChannelResponse.model_validate(c).model_dump() for c in channels],
    )


async def _check_duplicate_channel_name(
    server_id: int,
    name: str,
    db: AsyncSession,
    exclude_channel_id: int | None = None,
) -> None:
    stmt = select(Channel).where(
        Channel.server_id == server_id,
        func.lower(Channel.name) == name.lower(),
    )
    if exclude_channel_id is not None:
        stmt = stmt.where(Channel.id != exclude_channel_id)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Channel name already exists in this server")


@router.post("", response_model=ApiResponse, status_code=201)
async def create_channel(
    server_id: int,
    channel_in: ChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
    await _check_duplicate_channel_name(server_id, channel_in.name, db)
    channel = Channel(server_id=server_id, **channel_in.model_dump())
    db.add(channel)
    await db.flush()
    await db.refresh(channel)
    return ApiResponse(success=True, data=ChannelResponse.model_validate(channel).model_dump(), message="Channel created")


@router.get("/{channel_id}", response_model=ApiResponse)
async def get_channel(
    server_id: int,
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
    result = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    return ApiResponse(success=True, data=ChannelResponse.model_validate(channel).model_dump())


@router.put("/{channel_id}", response_model=ApiResponse)
async def update_channel(
    server_id: int,
    channel_id: int,
    channel_in: ChannelUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
    result = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    update_data = channel_in.model_dump(exclude_unset=True)
    if "name" in update_data:
        await _check_duplicate_channel_name(server_id, update_data["name"], db, exclude_channel_id=channel_id)
    for key, value in update_data.items():
        setattr(channel, key, value)
    await db.flush()
    await db.refresh(channel)
    return ApiResponse(success=True, data=ChannelResponse.model_validate(channel).model_dump(), message="Channel updated")


@router.delete("/{channel_id}", response_model=ApiResponse)
async def delete_channel(
    server_id: int,
    channel_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
    result = await db.execute(select(Channel).where(Channel.id == channel_id, Channel.server_id == server_id))
    channel = result.scalar_one_or_none()
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel.type == "primary":
        raise HTTPException(status_code=400, detail="Cannot delete the primary channel")
    await db.delete(channel)
    return ApiResponse(success=True, message="Channel deleted")