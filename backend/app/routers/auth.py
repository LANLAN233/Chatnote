from fastapi import APIRouter, Depends, HTTPException, WebSocket
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User
from app.schemas.schemas import ApiResponse, TokenResponse, UserCreate, UserLogin, UserResponse
from app.services.auth import authenticate_user, create_access_token, decode_access_token, get_user_by_username, hash_password

router = APIRouter(prefix="/api/auth", tags=["auth"])
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)) -> User:
    payload = decode_access_token(token)
    if payload is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user_ws(websocket: WebSocket, db: AsyncSession = Depends(get_db)) -> int:
    """Authenticate WebSocket connection using query parameter or header."""
    token = websocket.query_params.get("token")
    if not token:
        # Try to get from header
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
    
    if not token:
        await websocket.close(code=4001, reason="Missing authentication token")
        raise HTTPException(status_code=401, detail="Missing authentication token")
    
    payload = decode_access_token(token)
    if payload is None:
        await websocket.close(code=4001, reason="Invalid or expired token")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_id = int(payload.get("sub", 0))
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        await websocket.close(code=4001, reason="User not found")
        raise HTTPException(status_code=401, detail="User not found")
    
    return user_id


@router.post("/register", response_model=ApiResponse, status_code=201)
async def register(user_in: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await get_user_by_username(db, user_in.username)
    if existing:
        raise HTTPException(status_code=400, detail="Username already registered")
    user = User(
        username=user_in.username,
        hashed_password=hash_password(user_in.password),
        display_name=user_in.display_name or user_in.username,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    return ApiResponse(
        success=True,
        data={
            "user": UserResponse.model_validate(user).model_dump(),
            "token": TokenResponse(access_token=token).model_dump(),
        },
        message="Registration successful",
    )


@router.post("/login", response_model=ApiResponse)
async def login(user_in: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, user_in.username, user_in.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": str(user.id)})
    return ApiResponse(
        success=True,
        data={
            "user": UserResponse.model_validate(user).model_dump(),
            "token": TokenResponse(access_token=token).model_dump(),
        },
        message="Login successful",
    )


@router.get("/me", response_model=ApiResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return ApiResponse(success=True, data=UserResponse.model_validate(current_user).model_dump())