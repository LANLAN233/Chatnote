import json
import logging
import re
from abc import ABC, abstractmethod
from datetime import date, datetime, time, timedelta
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

DEFAULT_MODELS = {
    "openai": {"text": "gpt-3.5-turbo", "vision": "gpt-4o"},
    "zhipu": {"text": "glm-4-flash", "vision": "glm-4v"},
    "qwen": {"text": "qwen-turbo", "vision": "qwen-vl-max"},
    "mock": {"text": "mock", "vision": "mock"},
}


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, messages: list[dict[str, str]], **kwargs: Any) -> str:
        pass

    @abstractmethod
    async def chat_with_image(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
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

    async def chat_with_image(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", DEFAULT_MODELS["openai"]["vision"]),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
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

    async def chat_with_image(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", DEFAULT_MODELS["zhipu"]["vision"]),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
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

    async def chat_with_image(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": kwargs.get("model", DEFAULT_MODELS["qwen"]["vision"]),
            "messages": messages,
            "temperature": kwargs.get("temperature", 0.3),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }
        async with httpx.AsyncClient(timeout=60.0) as client:
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
        if isinstance(last, list):
            last = last[-1].get("text", "") if last else ""
        # 检测是否是日程解析请求
        if "日程" in messages[0].get("content", "") or "parse" in str(last).lower():
            return json.dumps({
                "title": "测试日程",
                "description": None,
                "start_time": "14:00",
                "end_time": None,
                "date": datetime.now().strftime("%Y-%m-%d"),
                "day_of_week": None,
                "repeat_rule": None,
                "is_all_day": False,
                "confidence": 0.8,
            })
        # 分类请求 mock 响应
        return json.dumps({
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.5,
            "tags": ["note"],
            "summary": last[:100] if last else "",
            "is_new_server": True,
            "is_new_channel": True,
        })

    async def chat_with_image(self, messages: list[dict[str, Any]], **kwargs: Any) -> str:
        return json.dumps({
            "servers": [
                {
                    "name": "高等数学I",
                    "channels": [
                        {"name": "第一章 函数与极限", "notes": [{"content": "函数的概念与性质"}]},
                        {"name": "第二章 导数与微分", "notes": [{"content": "导数的定义与计算"}]},
                    ],
                }
            ],
            "schedules": [
                {"title": "高等数学I", "start_time": "08:00", "end_time": "09:35", "date": datetime.now().strftime("%Y-%m-%d"), "is_all_day": False, "confidence": 0.9}
            ],
            "suggestions": [
                {"type": "channel", "target_server": "高等数学I", "message": "建议添加 #错题本 频道用于记录易错题目"}
            ],
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


def get_schedule_parse_prompt() -> str:
    today_str = datetime.now().strftime("%Y-%m-%d")
    weekday_str = str(datetime.now().weekday())
    return f"""你是一个日程解析助手。用户会用自然语言描述日程，你需要提取以下信息：

1. 标题 (title): 日程的主要内容
2. 描述 (description): 详细信息（可选）
3. 开始时间 (start_time): HH:MM 格式，如 "14:00"
4. 结束时间 (end_time): HH:MM 格式（可选）
5. 日期 (date): YYYY-MM-DD 格式（如果用户说"明天"等，请转换为具体日期）
6. 星期几 (day_of_week): 0=周一, 1=周二...6=周日（如果是每周重复的日程）
7. 重复规则 (repeat_rule): 如果是重复日程，返回 {{"type": "weekly"}} 或 {{"type": "daily"}} 等
8. 是否全天 (is_all_day): true 或 false

请严格按以下JSON格式返回，不要包含任何其他文字：
{{
    "title": "日程标题",
    "description": "详细描述或null",
    "start_time": "14:00",
    "end_time": "16:00或null",
    "date": "2026-04-20或null",
    "day_of_week": 0或null,
    "repeat_rule": {{"type": "weekly"}}或null,
    "is_all_day": false,
    "confidence": 0.95
}}

注意：今天的日期是 {today_str}，星期{weekday_str}

示例输入：
- "明天下午2点高数课"
- "每周一三五晚上7点健身"
- "下周三全天开会"
- "每天上午9点背单词"

请准确解析时间、日期和重复模式。"""


SCHEDULE_IMPORT_SYSTEM_PROMPT = """你是"以聊代记"的课程与日程导入助手。分析用户提供的课程大纲、课表截图或日程描述。

任务：
1. 提取所有学科/课程名称 → 作为建议的服务器
2. 提取每个学科下的章节、主题或课时 → 作为建议的频道
3. 如果有具体的上课时间、地点、重复规则 → 作为日程
4. 提供1-3条额外优化建议

输出格式（严格JSON，不要包含任何其他文字）：
{
    "servers": [
        {
            "name": "高等数学I",
            "channels": [
                {"name": "第一章 函数与极限", "notes": [{"content": "函数的概念与性质概述"}]},
                {"name": "第二章 导数与微分", "notes": [{"content": "导数的定义与基本求导法则"}]}
            ]
        }
    ],
    "schedules": [
        {
            "title": "高等数学I",
            "description": "周一第1-2节",
            "start_time": "08:00",
            "end_time": "09:35",
            "date": null,
            "day_of_week": 0,
            "repeat_rule": {"type": "weekly"},
            "is_all_day": false,
            "confidence": 0.9
        }
    ],
    "suggestions": [
        {"type": "channel", "target_server": "高等数学I", "message": "建议添加 #错题本 频道用于记录易错题目"}
    ]
}

规则：
- 如果没有时间信息，schedules 可以为空数组
- notes 内容可以是对该章节的一句话概括
- suggestions 要具体、可操作"""


class LLMService:
    def __init__(self, api_key: str | None = None, provider: str | None = None):
        self.provider = get_llm_provider(provider, api_key)

    async def parse_schedule(self, text: str) -> dict:
        """使用 AI 解析自然语言日程描述"""
        local_result = self._try_local_parse(text)
        if local_result and local_result.get("confidence", 0) > 0.8:
            return local_result

        messages = [
            {"role": "system", "content": get_schedule_parse_prompt()},
            {"role": "user", "content": f"请解析以下日程描述：{text}"},
        ]

        try:
            response = await self.provider.chat(messages, temperature=0.1)
            result = self._parse_schedule_response(response)
            return result
        except Exception as e:
            logger.warning(f"LLM schedule parse failed: {e}, using fallback")
            if local_result:
                return local_result
            return {
                "title": text[:50],
                "description": None,
                "start_time": time(9, 0),
                "end_time": None,
                "date": date.today(),
                "day_of_week": None,
                "repeat_rule": None,
                "is_all_day": False,
                "confidence": 0.5,
            }

    async def parse_schedule_import(self, text: str | None, image_url: str | None) -> dict:
        """解析课程大纲/课表/日程描述，返回结构化建议"""
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": SCHEDULE_IMPORT_SYSTEM_PROMPT},
        ]

        if image_url:
            # Vision API format (OpenAI compatible, others will adapt)
            content: list[dict[str, Any]] = []
            if text:
                content.append({"type": "text", "text": text})
            content.append({
                "type": "image_url",
                "image_url": {"url": image_url},
            })
            messages.append({"role": "user", "content": content})
            try:
                response = await self.provider.chat_with_image(messages, temperature=0.2, max_tokens=4096)
                return self._parse_import_response(response)
            except Exception as e:
                logger.warning(f"Vision import failed: {e}, using text fallback")
                if text:
                    messages = [
                        {"role": "system", "content": SCHEDULE_IMPORT_SYSTEM_PROMPT},
                        {"role": "user", "content": text},
                    ]
                    response = await self.provider.chat(messages, temperature=0.2, max_tokens=4096)
                    return self._parse_import_response(response)
                raise
        else:
            messages.append({"role": "user", "content": text or ""})
            response = await self.provider.chat(messages, temperature=0.2, max_tokens=4096)
            return self._parse_import_response(response)

    def _parse_import_response(self, text: str) -> dict:
        try:
            json_match = re.search(r"\{[\s\S]*\}", text)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = json.loads(text)
            return data
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse import JSON: {e}")
            return {"servers": [], "schedules": [], "suggestions": []}

    def _try_local_parse(self, text: str) -> dict | None:
        """尝试使用本地规则解析日程"""
        text = text.strip()
        today = datetime.now()
        result = {
            "title": text,
            "description": None,
            "start_time": None,
            "end_time": None,
            "date": None,
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.0,
        }

        if "明天" in text:
            result["date"] = (today + timedelta(days=1)).date()
            result["confidence"] = 0.7
        elif "后天" in text:
            result["date"] = (today + timedelta(days=2)).date()
            result["confidence"] = 0.7
        elif "今天" in text:
            result["date"] = today.date()
            result["confidence"] = 0.7

        time_patterns = [
            r'(\d{1,2}):(\d{2})',
            r'(\d{1,2})点(?:\d{1,2}分)?',
            r'(?:上午|早上|am)\s*(\d{1,2})(?:点|:)?(?:\d{2})?',
            r'(?:下午|晚上|pm)\s*(\d{1,2})(?:点|:)?(?:\d{2})?',
        ]

        for pattern in time_patterns:
            match = re.search(pattern, text)
            if match:
                hour = int(match.group(1))
                if "下午" in text or "晚上" in text or "pm" in text.lower():
                    if hour < 12:
                        hour += 12
                minute = 0
                if len(match.groups()) > 1 and match.group(2) and match.group(2).isdigit():
                    minute = int(match.group(2))
                result["start_time"] = time(hour, minute)
                result["confidence"] = max(result["confidence"], 0.6)
                break

        if "每天" in text or "每日" in text:
            result["repeat_rule"] = {"type": "daily"}
            result["confidence"] = max(result["confidence"], 0.7)
        elif "每周" in text or re.search(r'每周[一二三四五六日]', text):
            result["repeat_rule"] = {"type": "weekly"}
            result["confidence"] = max(result["confidence"], 0.7)
            weekday_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6, "天": 6}
            for cn, num in weekday_map.items():
                if f"周{cn}" in text or f"星期{cn}" in text:
                    result["day_of_week"] = num
                    break

        if "全天" in text or "整天" in text:
            result["is_all_day"] = True
            result["start_time"] = time(0, 0)
            result["end_time"] = time(23, 59)

        title = text
        title = re.sub(r'(明天|今天|后天)', '', title)
        title = re.sub(r'\d{1,2}:\d{2}', '', title)
        title = re.sub(r'\d{1,2}点(?:\d{1,2}分)?', '', title)
        title = re.sub(r'(上午|下午|早上|晚上|每天|每周)', '', title)
        title = title.strip()
        if title:
            result["title"] = title

        return result if result["confidence"] > 0.5 else None

    def _parse_schedule_response(self, text: str) -> dict:
        """解析 LLM 返回的 JSON 响应"""
        try:
            json_match = re.search(r'\{[\s\S]*\}', text)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = json.loads(text)

            start_time = data.get("start_time")
            if start_time and isinstance(start_time, str):
                try:
                    if ":" in start_time:
                        hour, minute = map(int, start_time.split(":")[:2])
                        data["start_time"] = time(hour, minute)
                    else:
                        data["start_time"] = None
                except ValueError:
                    data["start_time"] = None

            end_time = data.get("end_time")
            if end_time and isinstance(end_time, str):
                try:
                    if ":" in end_time:
                        hour, minute = map(int, end_time.split(":")[:2])
                        data["end_time"] = time(hour, minute)
                    else:
                        data["end_time"] = None
                except ValueError:
                    data["end_time"] = None

            date_str = data.get("date")
            if date_str and isinstance(date_str, str):
                try:
                    data["date"] = date.fromisoformat(date_str)
                except ValueError:
                    data["date"] = None

            return data
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse schedule JSON: {e}")
            return {
                "title": text[:50],
                "description": None,
                "start_time": time(9, 0),
                "end_time": None,
                "date": date.today(),
                "day_of_week": None,
                "repeat_rule": None,
                "is_all_day": False,
                "confidence": 0.3,
            }
