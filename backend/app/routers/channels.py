from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
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


@router.post("", response_model=ApiResponse, status_code=201)
async def create_channel(
    server_id: int,
    channel_in: ChannelCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _verify_server_ownership(server_id, current_user, db)
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
    await db.delete(channel)
    return ApiResponse(success=True, message="Channel deleted")