from __future__ import annotations

import logging
from typing import Any

from agno.models.openai import OpenAIChat
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.models import User, UserApiKey
from app.services.crypto import decrypt

logger = logging.getLogger(__name__)

PROVIDER_CONFIG: dict[str, dict[str, Any]] = {
    "deepseek": {
        "base_url": "https://api.deepseek.com/v1",
        "default_model": "deepseek-chat",
        "fast_model": "deepseek-chat",
        "strong_model": "deepseek-chat",
        "vision_model": "deepseek-chat",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4-flash",
        "fast_model": "glm-4-flash",
        "strong_model": "glm-4-plus",
        "vision_model": "glm-4v",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen-turbo-latest",
        "fast_model": "qwen-turbo-latest",
        "strong_model": "qwen-plus-latest",
        "vision_model": "qwen-vl-max-latest",
    },
    "openai": {
        "base_url": None,
        "default_model": "gpt-3.5-turbo",
        "fast_model": "gpt-4o-mini",
        "strong_model": "gpt-4o",
        "vision_model": "gpt-4o",
    },
    "opencode-zen": {
        "base_url": "https://opencode.ai/zen/go/v1",
        "default_model": "kimi-k2.6",
        "fast_model": "kimi-k2.6",
        "strong_model": "deepseek-v4-pro",
        "vision_model": "kimi-k2.6",
    },
    "opencode-go": {
        "base_url": "https://opencode.ai/zen/go/v1",
        "default_model": "deepseek-v4-pro",
        "fast_model": "deepseek-v4-flash",
        "strong_model": "deepseek-v4-pro",
        "vision_model": "kimi-k2.6",
    },
    "moonshot": {
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "kimi-k2.5",
        "fast_model": "kimi-k2.5",
        "strong_model": "kimi-k2.5",
        "vision_model": "kimi-k2.5",
    },
}

# Providers whose vision_model has real visual recognition capability.
# deepseek-chat claims vision but only does text-based; opencode-zen/go
# use the same models without real vision.
PROVIDERS_WITH_REAL_VISION: set[str] = {"moonshot", "openai", "zhipu", "qwen"}


def has_real_vision(provider: str) -> bool:
    """Return True if the provider's vision_model supports real image recognition."""
    return provider in PROVIDERS_WITH_REAL_VISION


def _infer_provider_from_model(model: OpenAIChat | None) -> str | None:
    """Infer which provider a model instance belongs to.

    Matches the model's base_url against PROVIDER_CONFIG entries first
    (most reliable), then falls back to matching model.id against known
    model IDs for each provider.

    Args:
        model: An OpenAIChat instance from get_model_for_user(), or None.

    Returns:
        Provider key string (e.g., "openai", "deepseek", "moonshot") or None.
    """
    if model is None:
        return None

    model_base = getattr(model, "base_url", None)
    model_id = (getattr(model, "id", "") or "").lower()

    # 1. Try matching base_url first (most reliable)
    for provider, config in PROVIDER_CONFIG.items():
        cfg_base = config.get("base_url")
        if cfg_base and model_base:
            if model_base.rstrip("/") == cfg_base.rstrip("/"):
                return provider

    # 2. OpenAI special case: PROVIDER_CONFIG has base_url=None
    #    Model may have default OpenAI base URL or None
    if not model_base or (model_base and "api.openai.com" in model_base):
        if model_id and any(
            model_id.startswith(p) for p in ("gpt-", "o1", "o3", "o4")
        ):
            return "openai"

    # 3. Fallback: match model_id against known model IDs per provider
    for provider, config in PROVIDER_CONFIG.items():
        for key in ("default_model", "fast_model", "strong_model", "vision_model"):
            if (config.get(key, "") or "").lower() == model_id:
                return provider

    return None


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
        # 3a. Special case: moonshot with no personal key → use global key
        if provider == "moonshot" and settings.MOONSHOT_API_KEY:
            logger.info(
                "No personal moonshot key for user %d, using global MOONSHOT_API_KEY",
                user_id,
            )
            config = PROVIDER_CONFIG["moonshot"]
            model_id = config["vision_model"] if use_vision else config["default_model"]
            return OpenAIChat(
                id=model_id,
                api_key=settings.MOONSHOT_API_KEY,
                base_url=config["base_url"],
                extra_body={"thinking": {"type": "disabled"}},
                role_map={
                    "system": "system",
                    "user": "user",
                    "assistant": "assistant",
                    "tool": "tool",
                    "model": "assistant",
                },
            )

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


async def get_model_by_tier(
    user_id: int,
    db: AsyncSession,
    tier: str = "fast",
) -> OpenAIChat | None:
    """Create an Agno OpenAIChat instance dynamically based on a capability tier."""
    provider = "deepseek"

    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    if user:
        provider = user.preferred_llm or "deepseek"

    if provider == "mock":
        return None

    key_result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id,
            UserApiKey.provider == provider,
        ).order_by(UserApiKey.is_default.desc())
    )
    api_key_record = key_result.scalars().first() if key_result else None

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
    model_id = _resolve_tier_model_id(api_key_record, config, tier)

    logger.info(
        "Creating tiered model for user %d: provider=%s tier=%s model=%s",
        user_id, provider, tier, model_id,
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
    # Vision requests always use the configured vision model,
    # not the user's custom model (which may not support images)
    if use_vision:
        return config["vision_model"]
    if api_key_record and api_key_record.model:
        return api_key_record.model
    return config["default_model"]


def _resolve_tier_model_id(
    api_key_record: UserApiKey | None,
    config: dict[str, Any],
    tier: str,
) -> str:
    if api_key_record and api_key_record.model:
        return api_key_record.model

    normalized_tier = tier.lower()
    if normalized_tier == "strong":
        return config.get("strong_model", config["default_model"])
    if normalized_tier == "fast":
        return config.get("fast_model", config["default_model"])
    return config["default_model"]


def get_model_by_provider(
    provider: str,
    api_key: str,
    model: str | None = None,
    use_vision: bool = False,
) -> OpenAIChat:
    """Create a model instance directly from provider + key (for testing / direct use)."""
    config = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["deepseek"])
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


def get_kimi_vision_model() -> OpenAIChat | None:
    """Create a Kimi k2.5 vision model instance using the server-side global API key.

    Returns None if MOONSHOT_API_KEY is not configured in settings.
    Uses instant mode (thinking disabled) for direct vision responses.
    """
    if not settings.MOONSHOT_API_KEY:
        return None

    config = PROVIDER_CONFIG["moonshot"]
    return OpenAIChat(
        id=config["vision_model"],
        api_key=settings.MOONSHOT_API_KEY,
        base_url=config["base_url"],
        role_map={
            "system": "system",
            "user": "user",
            "assistant": "assistant",
            "tool": "tool",
            "model": "assistant",
        },
        extra_body={"thinking": {"type": "disabled"}},
    )


def get_kimi_vision_model_sdk() -> "AsyncOpenAI | None":
    """Create a raw AsyncOpenAI client for Kimi k2.5 (bypasses Agno).

    Returns None if MOONSHOT_API_KEY is not configured.
    Use this as fallback when Agno's extra_body forwarding fails.
    """
    import openai

    if not settings.MOONSHOT_API_KEY:
        return None
    config = PROVIDER_CONFIG["moonshot"]
    return openai.AsyncOpenAI(
        api_key=settings.MOONSHOT_API_KEY,
        base_url=config["base_url"],
    )
