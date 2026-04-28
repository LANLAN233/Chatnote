from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Channel, Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ServerCreate, ServerResponse, ServerUpdate

router = APIRouter(prefix="/api/servers", tags=["servers"])


async def _server_to_dict(server: Server, db: AsyncSession) -> dict:
    """Serialize a server including its primary channel id."""
    result = await db.execute(
        select(Channel).where(Channel.server_id == server.id, Channel.type == "primary")
    )
    primary_channel = result.scalar_one_or_none()
    return {
        "id": server.id,
        "user_id": server.user_id,
        "name": server.name,
        "icon": server.icon,
        "description": server.description,
        "sort_order": server.sort_order,
        "primary_channel_id": primary_channel.id if primary_channel else None,
        "created_at": server.created_at,
        "updated_at": server.updated_at,
    }


@router.get("", response_model=ApiResponse)
async def list_servers(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Server).where(Server.user_id == current_user.id).order_by(Server.sort_order, Server.id)
    )
    servers = result.scalars().all()
    data = []
    for s in servers:
        data.append(await _server_to_dict(s, db))
    return ApiResponse(success=True, data=data)


@router.post("", response_model=ApiResponse, status_code=201)
async def create_server(
    server_in: ServerCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    server = Server(user_id=current_user.id, **server_in.model_dump())
    db.add(server)
    await db.flush()
    await db.refresh(server)

    # Auto-create primary channel
    primary_channel = Channel(server_id=server.id, name="General", type="primary")
    db.add(primary_channel)
    await db.flush()
    await db.refresh(primary_channel)

    return ApiResponse(success=True, data=await _server_to_dict(server, db), message="Server created")


@router.get("/{server_id}", response_model=ApiResponse)
async def get_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Server).where(Server.id == server_id, Server.user_id == current_user.id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    return ApiResponse(success=True, data=await _server_to_dict(server, db))


@router.put("/{server_id}", response_model=ApiResponse)
async def update_server(
    server_id: int,
    server_in: ServerUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Server).where(Server.id == server_id, Server.user_id == current_user.id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    update_data = server_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(server, key, value)
    await db.flush()
    await db.refresh(server)
    return ApiResponse(success=True, data=await _server_to_dict(server, db), message="Server updated")


@router.delete("/{server_id}", response_model=ApiResponse)
async def delete_server(
    server_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Server).where(Server.id == server_id, Server.user_id == current_user.id))
    server = result.scalar_one_or_none()
    if not server:
        raise HTTPException(status_code=404, detail="Server not found")
    await db.delete(server)
    return ApiResponse(success=True, message="Server deleted")
