from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User, UserApiKey
from app.routers.auth import get_current_user
from app.schemas.schemas import (
    ApiResponse,
    UserApiKeyCreate,
    UserApiKeyResponse,
    UserResponse,
    UserSettingsUpdate,
)
from app.services.crypto import encrypt, mask_key

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/me", response_model=ApiResponse)
async def get_settings(current_user: User = Depends(get_current_user)):
    """Get current user settings."""
    return ApiResponse(
        success=True,
        data=UserResponse.model_validate(current_user).model_dump(),
    )


@router.put("/me", response_model=ApiResponse)
async def update_settings(
    settings_in: UserSettingsUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update current user settings."""
    updated = False

    if settings_in.display_name is not None:
        current_user.display_name = settings_in.display_name
        updated = True

    if settings_in.preferred_llm is not None:
        current_user.preferred_llm = settings_in.preferred_llm
        updated = True

    if settings_in.api_key is not None:
        current_user.api_key_encrypted = settings_in.api_key if settings_in.api_key else None
        updated = True

    if settings_in.theme is not None:
        current_user.theme = settings_in.theme
        updated = True

    if settings_in.notifications_enabled is not None:
        current_user.notifications_enabled = settings_in.notifications_enabled
        updated = True

    if updated:
        await db.commit()
        await db.refresh(current_user)

    return ApiResponse(
        success=True,
        data=UserResponse.model_validate(current_user).model_dump(),
        message="Settings updated successfully",
    )


# --- API Key Management ---

@router.get("/api-keys", response_model=ApiResponse)
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List current user's API keys (masked)."""
    result = await db.execute(
        select(UserApiKey).where(UserApiKey.user_id == current_user.id)
    )
    keys = result.scalars().all()
    data = []
    for key in keys:
        decrypted = ""
        try:
            from app.services.crypto import decrypt
            decrypted = decrypt(key.api_key_encrypted)
        except Exception:
            pass
        data.append({
            "id": key.id,
            "user_id": key.user_id,
            "provider": key.provider,
            "api_key_masked": mask_key(decrypted),
            "model": key.model,
            "is_default": key.is_default,
            "created_at": key.created_at,
            "updated_at": key.updated_at,
        })
    return ApiResponse(success=True, data=data)


@router.post("/api-keys", response_model=ApiResponse)
async def create_api_key(
    data: UserApiKeyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create or update an API key for a provider."""
    # Check if key contains mask characters -> treat as unchanged
    if "*" in data.api_key:
        # Only update model if provided
        result = await db.execute(
            select(UserApiKey).where(
                UserApiKey.user_id == current_user.id,
                UserApiKey.provider == data.provider,
            )
        )
        existing = result.scalar_one_or_none()
        if existing and data.model is not None:
            existing.model = data.model
            await db.commit()
            await db.refresh(existing)
            return ApiResponse(success=True, message="Model updated")
        raise HTTPException(status_code=400, detail="API key unchanged but no existing key found")

    encrypted = encrypt(data.api_key)

    # Check for existing key for this provider
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == current_user.id,
            UserApiKey.provider == data.provider,
        )
    )
    existing = result.scalar_one_or_none()

    if existing:
        existing.api_key_encrypted = encrypted
        existing.model = data.model
        await db.commit()
        await db.refresh(existing)
        key_obj = existing
    else:
        key_obj = UserApiKey(
            user_id=current_user.id,
            provider=data.provider,
            api_key_encrypted=encrypted,
            model=data.model,
            is_default=True,
        )
        db.add(key_obj)
        await db.commit()
        await db.refresh(key_obj)

    return ApiResponse(
        success=True,
        data={
            "id": key_obj.id,
            "provider": key_obj.provider,
            "api_key_masked": mask_key(data.api_key),
            "model": key_obj.model,
            "is_default": key_obj.is_default,
        },
        message="API key saved",
    )


@router.delete("/api-keys/{key_id}", response_model=ApiResponse)
async def delete_api_key(
    key_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete an API key."""
    result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.id == key_id,
            UserApiKey.user_id == current_user.id,
        )
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    await db.delete(key)
    await db.commit()
    return ApiResponse(success=True, message="API key deleted")


@router.get("/api-keys/providers", response_model=ApiResponse)
async def list_providers():
    """Return supported LLM providers and default models."""
    return ApiResponse(
        success=True,
        data={
            "providers": [
                {
                    "id": "openai",
                    "name": "OpenAI",
                    "default_model": "gpt-4o",
                    "text_model": "gpt-3.5-turbo",
                    "vision_model": "gpt-4o",
                    "base_url": "https://api.openai.com/v1",
                },
                {
                    "id": "zhipu",
                    "name": "智谱 AI",
                    "default_model": "glm-4v",
                    "text_model": "glm-4-flash",
                    "vision_model": "glm-4v",
                    "base_url": "https://open.bigmodel.cn/api/paas/v4",
                },
                {
                    "id": "qwen",
                    "name": "通义千问",
                    "default_model": "qwen-vl-max",
                    "text_model": "qwen-turbo",
                    "vision_model": "qwen-vl-max",
                    "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                },
                {
                    "id": "mock",
                    "name": "模拟模式（演示）",
                    "default_model": "mock",
                    "text_model": "mock",
                    "vision_model": "mock",
                    "base_url": "",
                },
            ]
        },
    )
