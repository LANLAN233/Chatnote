from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import PROVIDER_CONFIG, PROVIDERS_WITH_REAL_VISION
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

    if settings_in.enabled_providers is not None:
        current_user.enabled_providers = settings_in.enabled_providers
        # Keep preferred_llm in sync: use the first enabled provider as default
        if settings_in.enabled_providers and settings_in.preferred_llm is None:
            if isinstance(settings_in.enabled_providers, dict):
                # Dict format: keys are provider IDs
                first_provider = next(iter(settings_in.enabled_providers), None)
                if first_provider:
                    current_user.preferred_llm = first_provider
            elif isinstance(settings_in.enabled_providers, list) and len(settings_in.enabled_providers) > 0:
                current_user.preferred_llm = settings_in.enabled_providers[0]
        updated = True

    if settings_in.api_key is not None:
        current_user.api_key_encrypted = encrypt(settings_in.api_key) if settings_in.api_key else None
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


# ── Provider display metadata (names, preset_models) ────────────────────
# Only PROVIDER_CONFIG is the source of truth for model IDs.
# This map adds UI-friendly display info for each provider.
_PROVIDER_DISPLAY: dict[str, dict] = {
    "deepseek": {
        "name": "DeepSeek（推荐）",
        "preset_models": ["deepseek-v4-flash", "deepseek-v4-pro"],
    },
    "zhipu": {
        "name": "智谱 AI",
        "preset_models": ["glm-4.7-flash", "glm-4.7", "glm-5", "glm-5.1", "glm-4.6v", "glm-5v-turbo"],
    },
    "qwen": {
        "name": "通义千问",
        "preset_models": ["qwen3.5-flash", "qwen3.5-plus", "qwen3-max", "qwen3-vl-plus"],
    },
    "openai": {
        "name": "OpenAI",
        "preset_models": ["gpt-5.4-nano", "gpt-5.4-mini", "gpt-5.4", "gpt-5.5"],
    },
    "moonshot": {
        "name": "Moonshot (Kimi)",
        "preset_models": ["kimi-k2.5", "kimi-k2.6"],
    },
    "opencode-zen": {
        "name": "OpenCode Zen",
        "preset_models": [
            "kimi-k2.6", "glm-5.1", "glm-5", "qwen3.6-plus", "qwen3.5-plus",
            "deepseek-v4-pro", "deepseek-v4-flash",
            "gpt-5.5", "gpt-5.4", "gpt-5.4-mini",
            "gemini-3.1-pro", "gemini-3-flash",
        ],
    },
    "opencode-go": {
        "name": "OpenCode Go",
        "preset_models": [
            # Sorted by estimated monthly request count (cheapest first)
            # From opencode.ai/docs/zh-cn/go/ — 2026-05-28
            "deepseek-v4-flash",   # ~158K req/month — light
            "mimo-v2.5",            # ~150K req/month — light
            "qwen3.5-plus",         # ~50K req/month — economy
            "minimax-m2.5",         # ~32K req/month — economy
            "minimax-m2.7",         # ~17K req/month — balanced
            "deepseek-v4-pro",      # ~17K req/month — balanced
            "mimo-v2.5-pro",        # ~16K req/month — balanced
            "qwen3.6-plus",         # ~16K req/month — balanced
            "kimi-k2.5",            # ~9K req/month — premium
            "kimi-k2.6",            # ~6K req/month — premium
            "glm-5",                # ~6K req/month — premium
            "qwen3.7-max",          # ~5K req/month — premium
            "glm-5.1",              # ~4K req/month — strongest
        ],
    },
    "mock": {
        "name": "模拟模式（演示）",
        "preset_models": ["mock"],
    },
}

# Tier labels for frontend display
TIER_LABELS = {
    "fast": "快速",
    "default": "标准",
    "strong": "高级",
    "vision": "多模态",
}


@router.get("/api-keys/providers", response_model=ApiResponse)
async def list_providers(
    current_user: Optional[User] = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return supported LLM providers with tier models, vision support, and per-user API key status.

    Each provider includes:
    - models: dict of tier → {model, label} (fast/default/strong/vision)
    - has_real_vision: whether vision_model supports real image recognition
    - has_api_key: whether the current user has an API key configured for this provider
    """
    # Build set of providers for which the current user has keys
    user_providers: set[str] = set()
    if current_user:
        result = await db.execute(
            select(UserApiKey.provider).where(UserApiKey.user_id == current_user.id)
        )
        user_providers = {row[0] for row in result.all() if row[0]}

    providers = []
    for provider_id, config in PROVIDER_CONFIG.items():
        display = _PROVIDER_DISPLAY.get(provider_id, {})
        has_vision = provider_id in PROVIDERS_WITH_REAL_VISION
        models: dict[str, dict[str, str]] = {
            "fast": {
                "model": config.get("fast_model", config["default_model"]),
                "label": TIER_LABELS["fast"],
            },
            "default": {
                "model": config["default_model"],
                "label": TIER_LABELS["default"],
            },
            "strong": {
                "model": config.get("strong_model", config["default_model"]),
                "label": TIER_LABELS["strong"],
            },
        }
        # Only include vision tier for providers with real vision capability
        if has_vision and config.get("vision_model"):
            models["vision"] = {
                "model": config["vision_model"],
                "label": TIER_LABELS["vision"],
            }
        providers.append({
            "id": provider_id,
            "name": display.get("name", provider_id),
            "models": models,
            "has_real_vision": has_vision,
            "has_api_key": provider_id in user_providers,
            "preset_models": display.get("preset_models", [config["default_model"]]),
            "base_url": config.get("base_url") or "",
        })

    return ApiResponse(
        success=True,
        data={"providers": providers},
    )
