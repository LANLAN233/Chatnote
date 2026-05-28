from types import SimpleNamespace

import pytest

import app.ai.models as ai_models


class FakeSelect:
    def __init__(self, entity):
        self.entity = entity

    def where(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self


class FakeScalarResult:
    def __init__(self, value):
        self._value = value

    def scalar_one_or_none(self):
        return self._value

    def scalars(self):
        return self

    def first(self):
        return self._value


class FakeDB:
    def __init__(self, user, api_key_record):
        self.user = user
        self.api_key_record = api_key_record

    async def execute(self, query):
        if query.entity is FakeUser:
            return FakeScalarResult(self.user)
        if query.entity is FakeUserApiKey:
            return FakeScalarResult(self.api_key_record)
        return FakeScalarResult(None)


class FakeUser:
    id = object()


class FakeUserApiKey:
    user_id = object()
    provider = object()
    class _SortableColumn:
        def desc(self):
            return self

    is_default = _SortableColumn()
    api_key_encrypted = object()
    model = object()


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("provider", "fast_model", "strong_model"),
    [
        ("deepseek", "deepseek-chat", "deepseek-reasoner"),
        ("zhipu", "glm-4-flash", "glm-4-plus"),
        ("qwen", "qwen-turbo", "qwen-max"),
        ("openai", "gpt-4o-mini", "gpt-4o"),
        ("opencode-zen", "kimi-k2.6", "deepseek-v4"),
        ("opencode-go", "deepseek-v4-flash", "glm-5.1"),
    ],
)
async def test_get_model_by_tier_returns_expected_model_ids(
    monkeypatch,
    provider: str,
    fast_model: str,
    strong_model: str,
):
    user = SimpleNamespace(preferred_llm=provider, api_key_encrypted=None)
    api_key_record = SimpleNamespace(
        provider=provider,
        api_key_encrypted="encrypted-key",
        model=None,
    )

    monkeypatch.setattr(ai_models, "select", lambda entity: FakeSelect(entity))
    monkeypatch.setattr(ai_models, "User", FakeUser)
    monkeypatch.setattr(ai_models, "UserApiKey", FakeUserApiKey)
    monkeypatch.setattr(ai_models, "decrypt", lambda value: value)

    model = await ai_models.get_model_by_tier(
        user_id=1,
        db=FakeDB(user, api_key_record),
        tier="fast",
    )
    strong_model_client = await ai_models.get_model_by_tier(
        user_id=1,
        db=FakeDB(user, api_key_record),
        tier="strong",
    )

    assert model is not None
    assert strong_model_client is not None
    assert model.id == fast_model
    assert strong_model_client.id == strong_model
