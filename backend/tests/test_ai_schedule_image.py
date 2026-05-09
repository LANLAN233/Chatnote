"""Tests for schedule import with image (Kimi auto-switch) functionality.

All tests use unittest.mock to avoid calling real AI APIs.
"""

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ── Test data fixtures ───────────────────────────────────────────────────────

VALID_KIMI_RESPONSE = {
    "servers": [
        {
            "name": "高等数学",
            "channels": [
                {"name": "第一章", "notes": [{"content": "函数与极限"}]}
            ],
        }
    ],
    "schedules": [
        {
            "title": "高等数学",
            "start_time": "08:00",
            "end_time": "09:35",
            "day_of_week": 0,
            "repeat_rule": '{"type": "weekly"}',
            "is_all_day": False,
            "confidence": 0.9,
            "server_name": "高等数学",
        }
    ],
    "suggestions": [{"type": "channel", "target_server": "高等数学", "message": "建议添加 #习题集 频道"}],
}

VALID_KIMI_RESPONSE_SIMPLE = {
    "servers": [{"name": "测试", "channels": []}],
    "schedules": [],
    "suggestions": [],
}


# ── Mock helpers ─────────────────────────────────────────────────────────────

def _fake_model():
    """Return a SimpleNamespace that looks like an OpenAIChat instance."""
    return SimpleNamespace(
        id="deepseek-chat",
        api_key="fake-key",
        base_url="https://api.deepseek.com/v1",
    )


def _mock_agent_arun(output_content):
    """Create a MagicMock simulating agent.arun() returning the given content."""
    mock_response = MagicMock()
    mock_response.content = output_content
    mock_agent = MagicMock()
    mock_agent.arun = AsyncMock(return_value=mock_response)
    return mock_agent


# ── Tests ────────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_import_schedule_with_image_mock(client, auth_headers):
    """Mock Kimi returns valid JSON — endpoint should return success with data."""
    from app.ai import schedule as schedule_module
    from app.ai import models as models_module

    fake_model = _fake_model()
    fake_kimi = _fake_model()
    fake_kimi.id = "kimi-k2.5"
    fake_kimi.base_url = "https://api.moonshot.cn/v1"
    mock_agent = _mock_agent_arun(VALID_KIMI_RESPONSE)

    # Mock SDK client to prevent real API calls
    mock_sdk_response = MagicMock()
    mock_sdk_response.choices = [MagicMock()]
    mock_sdk_response.choices[0].message = MagicMock()
    mock_sdk_response.choices[0].message.content = json.dumps(VALID_KIMI_RESPONSE)
    mock_sdk_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=AsyncMock(return_value=mock_sdk_response)
            )
        )
    )

    with patch.object(models_module, "get_model_for_user", AsyncMock(return_value=fake_model)), \
         patch.object(models_module, "has_real_vision", return_value=False), \
         patch.object(models_module, "get_kimi_vision_model", return_value=fake_kimi), \
         patch.object(models_module, "get_kimi_vision_model_sdk", return_value=mock_sdk_client), \
         patch.object(schedule_module, "create_schedule_import_agent", return_value=mock_agent):

        response = await client.post(
            "/api/ai/import-schedule",
            json={"text": "课程表", "image_url": "/uploads/test.png"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    result = data["data"]
    assert len(result["servers"]) == 1
    assert result["servers"][0]["name"] == "高等数学"
    assert len(result["schedules"]) == 1
    assert result["schedules"][0]["title"] == "高等数学"
    # Wave 1+2: schedules include server_name for server association
    assert result["schedules"][0]["server_name"] == "高等数学"
    # Wave 1+2: suggestions can include channel-type entries
    assert len(result["suggestions"]) >= 1
    assert any(s.get("type") == "channel" for s in result["suggestions"])


@pytest.mark.asyncio
async def test_import_schedule_no_moonshot_key(client, auth_headers):
    """MOONSHOT_API_KEY empty, user has deepseek → image import returns error."""
    from app.ai import models as models_module

    fake_model = _fake_model()

    with patch.object(models_module, "get_model_for_user", AsyncMock(return_value=fake_model)), \
         patch.object(models_module, "has_real_vision", return_value=False), \
         patch.object(models_module, "get_kimi_vision_model", return_value=None), \
         patch.object(models_module, "get_kimi_vision_model_sdk", return_value=None):

        response = await client.post(
            "/api/ai/import-schedule",
            json={"text": None, "image_url": "/uploads/test.png"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is False
    assert "图片识别" in data.get("message", "")
    suggestions = data.get("data", {}).get("suggestions", [])
    assert any("图片识别" in s.get("message", "") for s in suggestions)


@pytest.mark.asyncio
async def test_import_schedule_image_malformed_response(client, auth_headers):
    """Mock Kimi returns invalid JSON — endpoint should handle gracefully."""
    from app.ai import schedule as schedule_module
    from app.ai import models as models_module

    fake_model = _fake_model()
    fake_kimi = _fake_model()
    fake_kimi.id = "kimi-k2.5"
    fake_kimi.base_url = "https://api.moonshot.cn/v1"
    mock_agent = _mock_agent_arun("This is not JSON at all, just random text")

    # Mock SDK client returning malformed content
    mock_sdk_response = MagicMock()
    mock_sdk_response.choices = [MagicMock()]
    mock_sdk_response.choices[0].message = MagicMock()
    mock_sdk_response.choices[0].message.content = "This is not JSON at all, just random text"
    mock_sdk_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=AsyncMock(return_value=mock_sdk_response)
            )
        )
    )

    with patch.object(models_module, "get_model_for_user", AsyncMock(return_value=fake_model)), \
         patch.object(models_module, "has_real_vision", return_value=False), \
         patch.object(models_module, "get_kimi_vision_model", return_value=fake_kimi), \
         patch.object(models_module, "get_kimi_vision_model_sdk", return_value=mock_sdk_client), \
         patch.object(schedule_module, "create_schedule_import_agent", return_value=mock_agent):

        response = await client.post(
            "/api/ai/import-schedule",
            json={"text": "课程表", "image_url": "/uploads/test.png"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    # Should not crash — malformed response handled gracefully
    assert data["success"] in (True, False)


@pytest.mark.asyncio
async def test_import_schedule_text_only_no_regression(client, auth_headers):
    """Text-only import should NOT trigger Kimi auto-switch and work as before."""
    # Use text that triggers local regex parse
    response = await client.post(
        "/api/ai/import-schedule",
        json={"text": "高等数学 周一 8:00-09:35\n第一章 函数与极限", "image_url": None},
        headers=auth_headers,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    result = data["data"]
    assert "servers" in result
    assert "schedules" in result
    # Local parse should extract at least the server or schedule
    assert len(result["servers"]) >= 1 or len(result["schedules"]) >= 1
    # Wave 1+2: local parser now includes server_name in schedule dicts
    for sch in result.get("schedules", []):
        assert "server_name" in sch, f"schedule missing server_name: {sch}"


@pytest.mark.asyncio
async def test_auto_switch_to_kimi_for_deepseek_user(client, auth_headers):
    """Deepseek user with image input triggers Kimi auto-switch."""
    from app.ai import schedule as schedule_module
    from app.ai import models as models_module

    fake_deepseek = _fake_model()
    fake_kimi = _fake_model()
    fake_kimi.id = "kimi-k2.5"
    fake_kimi.base_url = "https://api.moonshot.cn/v1"
    mock_agent = _mock_agent_arun(VALID_KIMI_RESPONSE_SIMPLE)

    # Mock SDK client to prevent real API calls
    mock_sdk_response = MagicMock()
    mock_sdk_response.choices = [MagicMock()]
    mock_sdk_response.choices[0].message = MagicMock()
    mock_sdk_response.choices[0].message.content = json.dumps(VALID_KIMI_RESPONSE_SIMPLE)
    mock_sdk_client = SimpleNamespace(
        chat=SimpleNamespace(
            completions=SimpleNamespace(
                create=AsyncMock(return_value=mock_sdk_response)
            )
        )
    )

    with patch.object(models_module, "get_model_for_user", AsyncMock(return_value=fake_deepseek)), \
         patch.object(models_module, "has_real_vision", return_value=False), \
         patch.object(models_module, "get_kimi_vision_model", return_value=fake_kimi), \
         patch.object(models_module, "get_kimi_vision_model_sdk", return_value=mock_sdk_client), \
         patch.object(schedule_module, "create_schedule_import_agent", return_value=mock_agent):

        response = await client.post(
            "/api/ai/import-schedule",
            json={"text": "课程表", "image_url": "/uploads/test.png"},
            headers=auth_headers,
        )

    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    result = data["data"]
    assert len(result["servers"]) >= 1
    assert result["servers"][0]["name"] == "测试"


# ── Prompt verification ───────────────────────────────────────────────────────


def test_kimi_vision_prompt_includes_required_fields():
    """KIMI_VISION_PROMPT must include server_name, suggestions, and be mid-length."""
    from app.ai.schedule import KIMI_VISION_PROMPT

    assert "server_name" in KIMI_VISION_PROMPT, "KIMI_VISION_PROMPT missing 'server_name'"
    assert "suggestions" in KIMI_VISION_PROMPT, "KIMI_VISION_PROMPT missing 'suggestions'"
    assert len(KIMI_VISION_PROMPT) > 500, (
        f"KIMI_VISION_PROMPT too short ({len(KIMI_VISION_PROMPT)} chars), expected > 500"
    )
