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


SCHEDULE_PARSE_PROMPT = """You are an intelligent schedule and time management assistant for ChatNote. Parse natural language schedule descriptions into structured data with high accuracy.

## Context
Today's date: {today_str}, weekday: {weekday_str} (0=Monday, 6=Sunday)

## Parsing Rules

1. **Time Recognition**
   - Convert Chinese time expressions precisely:
     - "上午8点" → 08:00, "下午3点半" → 15:30
     - "晚上7点" → 19:00, "中午12点" → 12:00
     - "凌晨2点" → 02:00
   - Handle duration-implied end times:
     - "2pm to 4pm" → start_time=14:00, end_time=16:00
     - "3点开始的2小时课" → start_time=15:00, end_time=17:00
   - Default class duration: 45-90 minutes if end_time not specified

2. **Date Recognition**
   - Relative dates:
     - "今天" → today, "明天" → tomorrow, "后天" → day after tomorrow
     - "下周三" → next Wednesday, "这周五" → this Friday
     - "下个月1号" → first day of next month
   - Absolute dates: extract YYYY-MM-DD if present

3. **Recurring Patterns**
   - "每周一三五" → repeat_rule: {{"type": "weekly", "days": [0, 2, 4]}}
   - "每天" / "每日" → repeat_rule: {{"type": "daily"}}
   - "工作日" → repeat_rule: {{"type": "weekly", "days": [0, 1, 2, 3, 4]}}
   - "每两周" → repeat_rule: {{"type": "weekly", "interval": 2}}

4. **Title Extraction**
   - Remove temporal markers from title
   - Keep the core event name: "明天下午2点高数课" → "高等数学"
   - Include location if mentioned: "301教室的物理实验" → "物理实验 @301教室"

5. **Confidence Scoring**
   - 0.9-1.0: Explicit time, clear date, unambiguous event
   - 0.7-0.9: Implicit time (e.g., "下午" without exact hour), relative date
   - 0.5-0.7: Vague timing (e.g., "最近"), missing key details
   - <0.5: Unclear what the event is

## Output Format
{{
    "title": "schedule title",
    "description": "details or null",
    "start_time": "HH:MM",
    "end_time": "HH:MM or null",
    "date": "YYYY-MM-DD or null",
    "day_of_week": 0-6 or null,
    "repeat_rule": null or {{"type":"weekly"}} or {{"type":"daily"}},
    "is_all_day": false,
    "confidence": 0.0-1.0
}}

## Examples
- "明天下午2点高数课" → title="高等数学", date=tomorrow, start_time=14:00, end_time=15:35
- "每周一三五晚上7点健身" → title="健身", repeat_rule={{"type":"weekly"}}, start_time=19:00
- "下周三全天开会" → title="会议", date=next_Wednesday, is_all_day=true
- "每天早上8点背单词" → title="背单词", repeat_rule={{"type":"daily"}}, start_time=08:00"""

SCHEDULE_IMPORT_PROMPT = """You are an expert academic schedule analyst and course organizer for ChatNote.

Your task is to intelligently parse course syllabi, schedules, or curriculum descriptions (text or images) and convert them into a structured learning plan.

## Analysis Strategy

1. **Course Extraction**
   - Identify ALL courses/subjects mentioned
   - Use concise Chinese names when the source is in Chinese
   - Group related sub-topics under the same course (e.g., "理论力学" and "材料力学" both under "力学")

2. **Topic Hierarchy**
   - Break down each course into logical chapters/units
   - Channel names should represent distinct learning modules
   - For each channel, generate a brief 1-line overview note
   - Consider prerequisite relationships (mark foundational topics)

3. **Schedule Extraction**
   - Extract ALL class times, locations, and recurrence patterns
   - Handle various formats: "周一 8:00-9:35", "Mon/Wed/Fri 2pm", etc.
   - Include location info in description when available
   - Handle exam dates, deadlines, and special events
   - Distinguish between lecture, lab, and review sessions

4. **Smart Suggestions**
   - Identify missing study resources (e.g., "建议添加 #错题本 频道")
   - Note scheduling conflicts or dense periods
   - Suggest review schedules before exams
   - Recommend complementary channels based on course type

## Output Format
{
    "servers": [
        {
            "name": "Course Name",
            "channels": [
                {
                    "name": "Topic Name",
                    "notes": [{"content": "Brief overview of this topic"}]
                }
            ]
        }
    ],
    "schedules": [
        {
            "title": "Course Name",
            "description": "Location, room, or additional info",
            "start_time": "HH:MM",
            "end_time": "HH:MM",
            "date": "YYYY-MM-DD or null",
            "day_of_week": 0-6 or null,
            "repeat_rule": {"type": "weekly"} or null,
            "is_all_day": false,
            "confidence": 0.0-1.0
        }
    ],
    "suggestions": [
        {
            "type": "channel|schedule|study_tip",
            "target_server": "Server Name",
            "message": "Specific actionable suggestion"
        }
    ]
}

## Quality Standards
- Server names: 2-10 characters, clear and specific
- Channel names: represent actual learning modules, not vague categories
- Schedules: include all recurring patterns, handle edge cases
- Suggestions: be specific and genuinely useful, not generic
- Handle ambiguous or incomplete input gracefully"""


def create_schedule_parser_agent(model: OpenAIChat) -> Agent:
    return Agent(
        model=model,
        name="Schedule Parser",
        description="Parse natural language into structured schedule data",
        system_message_role="system",
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
        system_message_role="system",
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
