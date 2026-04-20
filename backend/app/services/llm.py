import json
import logging
from abc import ABC, abstractmethod
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        pass


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-3.5-turbo", base_url: str = "https://api.openai.com/v1"):
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")

    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 1024),
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{self.base_url}/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


class ZhipuProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "glm-4-flash"):
        self.api_key = api_key
        self.model = model

    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 1024),
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post("https://open.bigmodel.cn/api/paas/v4/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


class QwenProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "qwen-turbo"):
        self.api_key = api_key
        self.model = model

    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", self.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 1024),
        }
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
                headers=headers,
                json=payload,
            )
            resp.raise_for_status()
            return resp.json()["choices"][0]["message"]["content"]


class MockProvider(LLMProvider):
    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        last = messages[-1]["content"] if messages else ""
        return json.dumps({
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.5,
            "tags": ["note"],
            "summary": last[:100] if last else "",
            "is_new_server": True,
            "is_new_channel": True,
        })


def get_llm_provider(
    provider_name: str | None = None,
    api_key: str | None = None,
) -> LLMProvider:
    name = provider_name or getattr(settings, "LLM_PROVIDER", "mock")
    key = api_key or getattr(settings, "LLM_API_KEY", "")

    if name == "openai":
        base_url = getattr(settings, "LLM_BASE_URL", "https://api.openai.com/v1")
        model = getattr(settings, "LLM_MODEL", "gpt-3.5-turbo")
        return OpenAIProvider(api_key=key, model=model, base_url=base_url)
    elif name == "zhipu":
        model = getattr(settings, "LLM_MODEL", "glm-4-flash")
        return ZhipuProvider(api_key=key, model=model)
    elif name == "qwen":
        model = getattr(settings, "LLM_MODEL", "qwen-turbo")
        return QwenProvider(api_key=key, model=model)
    else:
        return MockProvider()
