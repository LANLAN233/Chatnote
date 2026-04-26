import json
import logging
import re
from datetime import date, datetime, time, timedelta
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class ParsedSchedule(BaseModel):
    title: str = Field(description="Schedule title or course name")
    description: str | None = Field(description="Additional details", default=None)
    start_time: str = Field(description="Start time in HH:MM format, e.g. 14:00")
    end_time: str | None = Field(description="End time in HH:MM format", default=None)
    date: str | None = Field(description="Date in YYYY-MM-DD format", default=None)
    day_of_week: int | None = Field(description="0=Mon ... 6=Sun", default=None)
    repeat_rule: str | None = Field(description="JSON repeat rule", default=None)
    is_all_day: bool = Field(description="Whether this is an all-day event", default=False)
    confidence: float = Field(description="Confidence 0-1", ge=0, le=1, default=0.8)


class ScheduleImportResult(BaseModel):
    servers: list[dict] = Field(description="Suggested servers with channels and notes")
    schedules: list[dict] = Field(description="Parsed schedule items")
    suggestions: list[dict] = Field(description="Optimization suggestions", default_factory=list)


SCHEDULE_PARSE_PROMPT = """You are a schedule parser. Parse the user's natural language schedule description.

Today's date: {today_str}, weekday: {weekday_str}

Output strict JSON:
{{
    "title": "schedule title",
    "description": "details or null",
    "start_time": "HH:MM",
    "end_time": "HH:MM or null",
    "date": "YYYY-MM-DD or null",
    "day_of_week": 0-6 or null,
    "repeat_rule": null or {{"type":"weekly"}} or {{"type":"daily"}},
    "is_all_day": false,
    "confidence": 0.95
}}

Examples:
- "tomorrow 2pm math class" → date=tomorrow, start_time=14:00
- "every Mon Wed Fri 7pm gym" → day_of_week, repeat_rule weekly
- "next Wednesday all day meeting" → date, is_all_day true
- "9am daily vocabulary" → repeat_rule daily, start_time=09:00"""

SCHEDULE_IMPORT_PROMPT = """You are a course syllabus and schedule import assistant for ChatNote.

Tasks:
1. Extract all courses/subjects → suggested servers
2. Extract chapters/topics per subject → suggested channels with brief note content
3. Extract class times/locations/repeat rules → schedules
4. Provide 1-3 actionable optimization suggestions

Output strict JSON:
{
    "servers": [
        {
            "name": "Advanced Calculus II",
            "channels": [
                {"name": "Chapter 3 Limits", "notes": [{"content": "Limits and continuity overview"}]}
            ]
        }
    ],
    "schedules": [
        {
            "title": "Advanced Calculus II",
            "description": "Mon period 1-2, Room 301",
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
        {"type": "channel", "target_server": "Advanced Calculus II", "message": "Add #ErrorLog channel"}
    ]
}

Rules:
- schedules can be empty array if no time info
- notes content should be a one-line overview
- suggestions must be specific and actionable"""


def create_schedule_parser_agent(model: OpenAIChat) -> Agent:
    return Agent(
        model=model,
        name="Schedule Parser",
        description="Parse natural language into structured schedule data",
        instructions=SCHEDULE_PARSE_PROMPT.format(
            today_str=datetime.now().strftime("%Y-%m-%d"),
            weekday_str=str(datetime.now().weekday()),
        ),
        output_schema=ParsedSchedule,
        structured_outputs=True,
    )


def create_schedule_import_agent(model: OpenAIChat) -> Agent:
    return Agent(
        model=model,
        name="Schedule Import",
        description="Parse course syllabus / schedule images into structured data",
        instructions=SCHEDULE_IMPORT_PROMPT,
        output_schema=ScheduleImportResult,
        structured_outputs=True,
    )


async def parse_natural_language_schedule(
    text: str,
    model: OpenAIChat | None,
) -> dict:
    """Parse natural language into structured schedule using Agno Agent.

    Returns local regex fallback when no model is available.
    """
    local = _try_local_parse(text)
    if local and local.get("confidence", 0) > 0.8:
        return local

    if model is None:
        if local:
            return local
        return {
            "title": text[:50],
            "description": None,
            "start_time": "09:00",
            "end_time": None,
            "date": date.today().isoformat(),
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.3,
        }

    agent = create_schedule_parser_agent(model)
    today_str = datetime.now().strftime("%Y-%m-%d")
    weekday_str = str(datetime.now().weekday())
    agent.instructions = SCHEDULE_PARSE_PROMPT.format(
        today_str=today_str, weekday_str=weekday_str
    )

    try:
        response = await agent.arun(input=f"Parse: {text}")
        result = response.content
        if isinstance(result, ParsedSchedule):
            return result.model_dump()
        return result if isinstance(result, dict) else {}
    except Exception as e:
        logger.warning("Schedule parse via Agent failed: %s, using local fallback", e)
        if local:
            return local
        return {
            "title": text[:50],
            "description": None,
            "start_time": "09:00",
            "end_time": None,
            "date": date.today().isoformat(),
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.3,
        }


async def parse_schedule_import(
    text: str | None,
    image_url: str | None,
    model: OpenAIChat,
) -> dict[str, Any]:
    """Parse course syllabus / schedule text or image into structured suggestions."""
    agent = create_schedule_import_agent(model)

    input_content: str | list[dict] = ""
    if image_url:
        content_items: list[dict] = []
        if text:
            content_items.append({"type": "text", "text": text})
        content_items.append({
            "type": "image_url",
            "image_url": {"url": image_url},
        })
        input_content = content_items
    else:
        input_content = text or ""

    try:
        response = await agent.arun(input=input_content)
        result = response.content
        if isinstance(result, ScheduleImportResult):
            return result.model_dump()
        return result if isinstance(result, dict) else {"servers": [], "schedules": [], "suggestions": []}
    except Exception as e:
        logger.warning("Schedule import via Agent failed: %s", e)
        return {"servers": [], "schedules": [], "suggestions": []}


def _try_local_parse(text: str) -> dict | None:
    """Try local regex-based schedule parsing for common Chinese patterns."""
    text = text.strip()
    today = datetime.now()
    result: dict = {
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
        result["date"] = (today + timedelta(days=1)).date().isoformat()
        result["confidence"] = 0.7
    elif "后天" in text:
        result["date"] = (today + timedelta(days=2)).date().isoformat()
        result["confidence"] = 0.7
    elif "今天" in text:
        result["date"] = today.date().isoformat()
        result["confidence"] = 0.7

    time_patterns = [
        r"(\d{1,2}):(\d{2})",
        r"(\d{1,2})点(?:(\d{1,2})分)?",
    ]
    for pattern in time_patterns:
        match = re.search(pattern, text)
        if match:
            hour = int(match.group(1))
            if "下午" in text or "晚上" in text:
                if hour < 12:
                    hour += 12
            try:
                minute = int(match.group(2)) if match.lastindex and match.lastindex >= 2 and match.group(2) else 0
            except (TypeError, ValueError, IndexError):
                minute = 0
            result["start_time"] = f"{hour:02d}:{minute:02d}"
            result["confidence"] = max(result["confidence"], 0.6)
            break

    if "每天" in text or "每日" in text:
        result["repeat_rule"] = json.dumps({"type": "daily"})
        result["confidence"] = max(result["confidence"], 0.7)
    elif "每周" in text or re.search(r"周[一二三四五六日]", text):
        result["repeat_rule"] = json.dumps({"type": "weekly"})
        result["confidence"] = max(result["confidence"], 0.7)
        weekday_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6}
        for cn, num in weekday_map.items():
            if f"周{cn}" in text:
                result["day_of_week"] = num
                break

    if "全天" in text or "整天" in text:
        result["is_all_day"] = True
        result["start_time"] = "00:00"
        result["end_time"] = "23:59"

    # Clean title
    title = text
    for pat in [r"(明天|今天|后天)", r"\d{1,2}:\d{2}", r"\d{1,2}点(\d{1,2}分)?",
                r"(上午|下午|早上|晚上|每天|每周)"]:
        title = re.sub(pat, "", title).strip()
    if title:
        result["title"] = title

    return result if result["confidence"] > 0.5 else None
