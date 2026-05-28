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
        "default_model": "deepseek-v4-flash",
        "fast_model": "deepseek-v4-flash",
        "strong_model": "deepseek-v4-pro",
    },
    "zhipu": {
        "base_url": "https://open.bigmodel.cn/api/paas/v4",
        "default_model": "glm-4.7",
        "fast_model": "glm-4.7-flash",
        "strong_model": "glm-5",
        "vision_model": "glm-4.6v",
    },
    "qwen": {
        "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "default_model": "qwen3.5-plus",
        "fast_model": "qwen3.5-flash",
        "strong_model": "qwen3-max",
        "vision_model": "qwen3-vl-plus",
    },
    "openai": {
        "base_url": None,
        "default_model": "gpt-5.4-mini",
        "fast_model": "gpt-5.4-mini",
        "strong_model": "gpt-5.5",
        "vision_model": "gpt-5.5",
    },
    "opencode-zen": {
        "base_url": "https://opencode.ai/zen/go/v1",
        "default_model": "kimi-k2.6",
        "fast_model": "kimi-k2.6",
        "strong_model": "deepseek-v4-pro",
    },
    "opencode-go": {
        "base_url": "https://opencode.ai/zen/go/v1",
        "default_model": "deepseek-v4-pro",
        "fast_model": "deepseek-v4-flash",
        "strong_model": "deepseek-v4-pro",
    },
    "moonshot": {
        "base_url": "https://api.moonshot.cn/v1",
        "default_model": "kimi-k2.6",
        "fast_model": "kimi-k2.5",
        "strong_model": "kimi-k2.6",
        "vision_model": "kimi-k2.6",
    },
}

# Providers whose vision_model has real visual recognition capability.
# DeepSeek does not have a native vision model; opencode-zen/go
# use third-party models without reliable vision routing.
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


def _resolve_enabled_providers(user: User | None) -> list[str]:
    """Return the list of enabled provider IDs for a user.

    enabled_providers supports two formats:
      - Legacy list:  ["deepseek", "moonshot"]
      - Dict format:  {"deepseek": ["fast", "strong"], "moonshot": ["vision"]}
        (tier preferences are extracted separately via _get_tier_preferences)

    Falls back to preferred_llm if enabled_providers is not set (legacy users).
    Excludes "mock" since it has no real API key.
    """
    if user and user.enabled_providers:
        if isinstance(user.enabled_providers, dict):
            return [p for p in user.enabled_providers if p != "mock"]
        elif isinstance(user.enabled_providers, list):
            return [p for p in user.enabled_providers if p != "mock"]
    if user and user.preferred_llm:
        provider = user.preferred_llm
        return [provider] if provider != "mock" else []
    return ["deepseek"]


def _get_tier_preferences(user: User | None) -> dict[str, list[str]] | None:
    """Extract per-provider tier preferences from enabled_providers dict format.

    Returns None for legacy list format (all tiers allowed for enabled providers),
    or a dict mapping provider_id → [allowed_tier_names].
    Empty tier list for a provider means all tiers disabled.
    """
    if user and isinstance(user.enabled_providers, dict):
        return {k: v for k, v in user.enabled_providers.items() if k != "mock"}
    return None


def _is_tier_allowed(tier: str, provider: str, tier_prefs: dict[str, list[str]] | None) -> bool:
    """Check whether a tier is allowed for a given provider.

    Returns True when tier_prefs is None (legacy: all tiers allowed) or when
    the tier is in the provider's allowed list.
    """
    if tier_prefs is None:
        return True
    allowed = tier_prefs.get(provider, [])
    return bool(allowed) and tier in allowed


async def _fetch_user_and_providers(
    user_id: int,
    db: AsyncSession,
) -> tuple[User | None, list[str]]:
    """Fetch the user record and resolve the ordered list of enabled providers."""
    user_result = await db.execute(select(User).where(User.id == user_id))
    user = user_result.scalar_one_or_none()
    providers = _resolve_enabled_providers(user)
    return user, providers


async def _find_api_key_for_providers(
    user_id: int,
    db: AsyncSession,
    providers: list[str],
) -> tuple[UserApiKey | None, str | None]:
    """Find the first available UserApiKey among the given providers (in order).

    Returns (key_record, provider_id) or (None, None) if no key found.
    """
    for provider in providers:
        config = PROVIDER_CONFIG.get(provider)
        if not config:
            continue
        key_result = await db.execute(
            select(UserApiKey).where(
                UserApiKey.user_id == user_id,
                UserApiKey.provider == provider,
            ).order_by(UserApiKey.is_default.desc())
        )
        key_record = key_result.scalars().first()
        if key_record:
            return key_record, provider

    # Fallback: try ANY non-mock key
    any_result = await db.execute(
        select(UserApiKey).where(
            UserApiKey.user_id == user_id,
            UserApiKey.provider != "mock",
        )
    )
    any_record = any_result.scalars().first()
    if any_record:
        return any_record, any_record.provider

    return None, None


async def _build_openai_chat(
    api_key_record: UserApiKey | None,
    decrypted_key: str,
    provider: str,
    model_id: str,
) -> OpenAIChat:
    """Build an OpenAIChat instance from resolved parameters."""
    config = PROVIDER_CONFIG.get(provider, PROVIDER_CONFIG["deepseek"])
    extra: dict[str, Any] = {}
    if provider == "moonshot":
        extra["extra_body"] = {"thinking": {"type": "disabled"}}
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
        **extra,
    )


async def get_model_for_user(
    user_id: int,
    db: AsyncSession,
    use_vision: bool = False,
) -> OpenAIChat | None:
    """Create an Agno OpenAIChat instance dynamically based on user's enabled providers.

    Iterates through the user's enabled_providers (or preferred_llm as fallback),
    picking the first provider that has a configured API key.
    Returns None if no API key is configured.

    Respects per-provider tier preferences when enabled_providers is in dict format.
    """
    user, providers = await _fetch_user_and_providers(user_id, db)

    # If all providers are "mock", no real model available
    if not providers:
        return None

    # Filter providers by tier preferences (dict format only)
    # get_model_for_user is a general-purpose function: accept any provider
    # with at least one tier enabled, not just "default" (which may not exist in dict)
    tier_prefs = _get_tier_preferences(user)
    if tier_prefs is not None:
        providers = [p for p in providers if tier_prefs.get(p, [])]
        if not providers:
            logger.info("No enabled provider for user %d", user_id)
            return None

    # For vision, only consider providers with real vision capability
    candidate_providers = providers
    if use_vision:
        candidate_providers = [p for p in providers if p in PROVIDERS_WITH_REAL_VISION]
        if not candidate_providers:
            # Fallback to Moonshot global key for vision
            if settings.MOONSHOT_API_KEY:
                logger.info("Vision requested, no real-vision enabled provider for user %d, using global Moonshot key", user_id)
                config = PROVIDER_CONFIG["moonshot"]
                return await _build_openai_chat(
                    None, settings.MOONSHOT_API_KEY, "moonshot",
                    config["vision_model"],
                )
            # If no MoonShot key either, try any enabled provider anyway (best-effort)
            candidate_providers = providers

    api_key_record, provider = await _find_api_key_for_providers(user_id, db, candidate_providers)

    # Moonshot global key fallback (when no personal key)
    if api_key_record is None and "moonshot" in providers and settings.MOONSHOT_API_KEY:
        logger.info("No personal moonshot key for user %d, using global MOONSHOT_API_KEY", user_id)
        config = PROVIDER_CONFIG["moonshot"]
        model_id = config["vision_model"] if use_vision else config["default_model"]
        return await _build_openai_chat(None, settings.MOONSHOT_API_KEY, "moonshot", model_id)

    if api_key_record is None:
        # Legacy: try user.api_key_encrypted
        if user and user.api_key_encrypted:
            try:
                decrypted_key = decrypt(user.api_key_encrypted)
            except Exception:
                logger.warning("Failed to decrypt legacy API key")
                return None
            provider = "deepseek"
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
        "Creating model for user %d: provider=%s model=%s vision=%s",
        user_id, provider, model_id, use_vision,
    )

    return await _build_openai_chat(api_key_record, decrypted_key, provider, model_id)


async def get_model_by_tier(
    user_id: int,
    db: AsyncSession,
    tier: str = "fast",
) -> OpenAIChat | None:
    """Create an Agno OpenAIChat instance dynamically based on a capability tier.

    Uses the user's enabled_providers to find the first provider with a key
    that supports the requested tier. For 'vision' tier, only providers with
    real vision capability are considered.

    Respects per-provider tier preferences when enabled_providers is in dict format.
    """
    user, providers = await _fetch_user_and_providers(user_id, db)

    if not providers:
        return None

    normalized_tier = tier.lower()

    # Filter providers by tier preferences (dict format only)
    tier_prefs = _get_tier_preferences(user)
    if tier_prefs is not None:
        providers = [p for p in providers if _is_tier_allowed(normalized_tier, p, tier_prefs)]
        if not providers:
            logger.info("No provider with tier '%s' enabled for user %d", normalized_tier, user_id)
            return None

    # For vision tier, only consider providers with real vision capability
    candidate_providers = providers
    if normalized_tier == "vision":
        candidate_providers = [p for p in providers if p in PROVIDERS_WITH_REAL_VISION]
        if not candidate_providers:
            if settings.MOONSHOT_API_KEY:
                logger.info("Vision tier requested, no real-vision enabled provider for user %d, using global Moonshot key", user_id)
                config = PROVIDER_CONFIG["moonshot"]
                return await _build_openai_chat(
                    None, settings.MOONSHOT_API_KEY, "moonshot",
                    config["vision_model"],
                )
            candidate_providers = providers

    api_key_record, provider = await _find_api_key_for_providers(user_id, db, candidate_providers)

    if api_key_record is None:
        if user and user.api_key_encrypted:
            try:
                decrypted_key = decrypt(user.api_key_encrypted)
            except Exception:
                logger.warning("Failed to decrypt legacy API key")
                return None
            provider = "deepseek"
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
    model_id = _resolve_tier_model_id(api_key_record, config, normalized_tier)

    logger.info(
        "Creating tiered model for user %d: provider=%s tier=%s model=%s",
        user_id, provider, tier, model_id,
    )

    return await _build_openai_chat(api_key_record, decrypted_key, provider, model_id)


def _resolve_model_id(
    api_key_record: UserApiKey | None,
    config: dict,
    use_vision: bool,
) -> str:
    # Vision requests always use the configured vision model
    if use_vision:
        return config.get("vision_model", config["default_model"])
    return config["default_model"]


def _resolve_tier_model_id(
    api_key_record: UserApiKey | None,
    config: dict[str, Any],
    tier: str,
) -> str:
    normalized_tier = tier.lower()
    if normalized_tier == "strong":
        return config.get("strong_model", config["default_model"])
    if normalized_tier == "fast":
        return config.get("fast_model", config["default_model"])
    if normalized_tier == "vision":
        return config.get("vision_model", config["default_model"])
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
