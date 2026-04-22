from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.models import User
from app.routers.auth import get_current_user
from app.schemas.schemas import ApiResponse, UserResponse, UserSettingsUpdate

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
        # Store API key as-is for now (encryption can be added later)
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
