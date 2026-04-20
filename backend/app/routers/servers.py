from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import Server, User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, ServerCreate, ServerResponse, ServerUpdate

router = APIRouter(prefix="/api/servers", tags=["servers"])


@router.get("", response_model=ApiResponse)
async def list_servers(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Server).where(Server.user_id == current_user.id).order_by(Server.sort_order, Server.id)
    )
    servers = result.scalars().all()
    return ApiResponse(
        success=True,
        data=[ServerResponse.model_validate(s).model_dump() for s in servers],
    )


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
    return ApiResponse(success=True, data=ServerResponse.model_validate(server).model_dump(), message="Server created")


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
    return ApiResponse(success=True, data=ServerResponse.model_validate(server).model_dump())


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
    return ApiResponse(success=True, data=ServerResponse.model_validate(server).model_dump(), message="Server updated")


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