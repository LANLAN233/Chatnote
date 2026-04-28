import logging
from typing import Any

from agno.models.openai import OpenAIChat
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import User, UserApiKey
from app.services.crypto import decrypt

logger = logging.getLogger(__name__)

PROVIDER_CONFIG: dict[str, dict[str, Any]] = {
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "vision_model": "deepseek-chat",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "vision_model": "glm-4v",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-turbo",
        "vision_model": "qwen-vl-max",
    },
    "openai": {
        "base_url": None,
        "default_model": "gpt-3.5-turbo",
        "vision_model": "gpt-4o",
    },
    "opencode-zen": {
        "base_url": "https://opencode.ai/zen/v1",
        "default_model": "kimi-k2.6",
        "vision_model": "kimi-k2.6",
    },
    "opencode-go": {
        "base_url": "https://opencode.ai/zen/go/v1",
        "default_model": "kimi-k2.6",
        "vision_model": "kimi-k2.6",
    },
}


async def get_model_for_user(
    user_id: int,
    db: AsyncSession,
    use_vision: bool = False,
) -> OpenAIChat | None:
    """Create an Agno OpenAIChat instance dynamically based on user settings.

    Returns None if no API key is configured (caller should use fallback).
    """
    provider = "deepseek"

    # 1. Get user's preferred provider
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user:
        provider = user.preferred_llm or "deepseek"

    # Skip "mock" provider — no real API key available
    if provider == "mock":
        return None

    # 2. Find API key for this provider
    key_result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == provider,
        ).order_by(UserApiKey.is_default.desc())
    )
    api_key_record = key_result.scalars().first() if key_result else None

    # 3. Fallback: try any available key (skip mock)
    if api_key_record is None:
        any_result = await db.execute(
            select(UserApiKey).where(
                UserApiKey.user_id == user_id,
                UserApiKey.provider != "mock",
            )
        )
        api_key_record = any_result.scalars().first() if any_result else None
        if api_key_record:
            provider = api_key_record.provider

    # 4. No key configured → return None (caller uses fallback)
    if api_key_record is None:
        if user and user.api_key_encrypted:
            try:
                decrypted_key = decrypt(user.api_key_encrypted)
            except Exception:
                logger.warning("Failed to decrypt legacy API key")
                return None
        else:
            logger.warning("No API key for user %d, returning None", user_id)
            return None
    else:
        try:
            decrypted_key = decrypt(api_key_record.api_key_encrypted)
        except Exception:
            logger.warning("Failed to decrypt API key, returning None")
            return None

    config = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["deepseek"])
    model_id = _resolve_model_id(api_key_record, config, use_vision)

    logger.info(
        "Creating model for user %d: provider=%s model=%s",
        user_id, provider, model_id,
    )

    return OpenAIChat(
        id=model_id,
        api_key=decrypted_key,
        base_url=config["base_url"],
        role_map={
            "system": "system",
            "user": "user",
            "assistant": "assistant",
            "tool": "tool",
            "model": "assistant",
        },
    )


def _resolve_model_id(
    api_key_record: UserApiKey | None,
    config: dict,
    use_vision: bool,
) -> str:
    if api_key_record and api_key_record.model:
        return api_key_record.model
    if use_vision:
        return config["vision_model"]
    return config["default_model"]


def get_model_by_provider(
    provider: str,
    api_key: str,
    model: str | None = None,
    use_vision: bool = False,
) -> OpenAIChat:
    """Create a model instance directly from provider + key (for testing / direct use)."""
    config = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["mock"])
    model_id = model or (config["vision_model"] if use_vision else config["default_model"])
    return OpenAIChat(
        id=model_id,
        api_key=api_key,
        base_url=config["base_url"],
        role_map={
            "system": "system",
            "user": "user",
            "assistant": "assistant",
            "tool": "tool",
            "model": "assistant",
        },
    )


def get_mock_model() -> OpenAIChat:
    return OpenAIChat(id="mock", api_key="mock-key")
