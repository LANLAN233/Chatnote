import asyncio
import base64
import json
import logging
import os
import re
from datetime import date, datetime, time, timedelta
from pathlib import Path
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings

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
        response = await asyncio.wait_for(
            agent.arun(input=f"Parse: {text}"),
            timeout=90.0,
        )
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
    """Parse course syllabus / schedule text or image into structured suggestions.
    
    Tries local regex first for text-only input (instant); falls back to AI agent
    if local parse fails or for image input.
    """
    # ── Local parse for text-only input ──────────────────────────────
    if text and not image_url:
        local = _try_local_parse_schedule_import(text)
        if local and _has_meaningful_data(local):
            logger.info("Schedule import: using local regex parse (instant)")
            return local
    
    # ── AI agent for complex text or image input ────────────────────
    agent = create_schedule_import_agent(model)

    input_content: str | list[dict] = ""
    if image_url:
        content_items: list[dict] = []
        if text:
            content_items.append({"type": "text", "text": text})
        # Convert local image URLs to base64 data URLs so the remote LLM can access them
        resolved_image_url = _resolve_image_url(image_url)
        logger.info("Schedule import: image_url=%s... resolved to %s...", 
                     str(image_url)[:80], str(resolved_image_url)[:80])
        content_items.append({
            "type": "image_url",
            "image_url": {"url": resolved_image_url},
        })
        input_content = content_items
    else:
        input_content = text or ""

    logger.info("Schedule import: calling agent with input type=%s len=%s", 
                type(input_content).__name__, 
                len(str(input_content)) if isinstance(input_content, str) else len(str(input_content)))

    try:
        response = await asyncio.wait_for(
            agent.arun(input=input_content),
            timeout=90.0,
        )
        result = response.content
        logger.info("Schedule import: agent response type=%s", type(result).__name__)
        if isinstance(result, ScheduleImportResult):
            parsed = result.model_dump()
            logger.info("Schedule import: parsed as ScheduleImportResult, servers=%d schedules=%d",
                       len(parsed.get('servers',[])), len(parsed.get('schedules',[])))
        elif isinstance(result, dict):
            parsed = result
            logger.info("Schedule import: parsed as dict, keys=%s", list(parsed.keys())[:5])
        else:
            parsed = {"servers": [], "schedules": [], "suggestions": []}
            logger.warning("Schedule import: unexpected response type: %s", type(result))

        # If AI returned empty results, try local parse as fallback
        if not _has_meaningful_data(parsed):
            logger.info("Schedule import AI returned empty, trying local parse")
            if text:
                local = _try_local_parse_schedule_import(text)
                if local:
                    return local
            # For image-only imports that failed, return a helpful message
            if image_url and not text:
                return {
                    "servers": [],
                    "schedules": [],
                    "suggestions": [
                        {
                            "type": "error",
                            "target_server": None,
                            "message": "图片识别需要支持视觉的 AI 模型。请尝试同时提供文字描述（如课程名称、时间），或使用支持图片识别的模型。",
                        }
                    ],
                }

        return parsed
    except Exception as e:
        logger.warning("Schedule import via Agent failed: %s, trying local parse", e)
        if text:
            local = _try_local_parse_schedule_import(text)
            if local:
                return local
        # For image-only imports that failed, return a helpful message
        if image_url and not text:
            return {
                "servers": [],
                "schedules": [],
                "suggestions": [
                    {
                        "type": "error",
                        "target_server": None,
                        "message": "图片识别需要支持视觉的 AI 模型。请尝试同时提供文字描述（如课程名称、时间），或使用支持图片识别的模型。",
                    }
                ],
            }
        return {"servers": [], "schedules": [], "suggestions": []}


def _resolve_image_url(image_url: str) -> str:
    """Convert local image URLs to base64 data URLs for remote LLM access.
    
    If the URL points to a local file (relative path or localhost), read the
    file and convert to a base64 data URL. Otherwise return as-is for remote URLs.
    """
    # Already a data URL or remote URL
    if image_url.startswith("data:") or image_url.startswith("https://"):
        return image_url
    
    # Remove http://localhost:8000 prefix if present
    local_path = image_url
    if image_url.startswith("http://localhost"):
        # Extract path after port
        from urllib.parse import urlparse
        parsed = urlparse(image_url)
        local_path = parsed.path
    
    # If it starts with /uploads/, resolve relative to UPLOAD_DIR
    if local_path.startswith("/uploads/"):
        local_path = local_path[len("/uploads/"):]
    
    # Try to find the actual file
    upload_dir = Path(settings.UPLOAD_DIR)
    file_path = upload_dir / local_path
    if not file_path.exists():
        # Try without stripping prefix
        file_path = Path(local_path.lstrip("/"))
    
    if not file_path.exists():
        logger.warning("Image file not found for URL: %s", image_url)
        return image_url  # Return original, let LLM handle it
    
    # Determine MIME type from extension
    ext = file_path.suffix.lower()
    mime_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    mime_type = mime_map.get(ext, "image/png")
    
    try:
        with open(file_path, "rb") as f:
            image_data = base64.b64encode(f.read()).decode("utf-8")
        logger.info("Converted local image to base64: %s (%d chars)", file_path.name, len(image_data))
        return f"data:{mime_type};base64,{image_data}"
    except Exception as e:
        logger.warning("Failed to read image file %s: %s", file_path, e)
        return image_url


def _has_meaningful_data(parsed: dict) -> bool:
    """Check if the parsed schedule import has actual content (not just empty objects)."""
    servers = parsed.get("servers", [])
    schedules = parsed.get("schedules", [])
    # Check if servers have name or channels
    for s in servers:
        if isinstance(s, dict) and (s.get("name") or s.get("channels")):
            return True
    # Check if schedules have a title
    for s in schedules:
        if isinstance(s, dict) and s.get("title"):
            return True
    # Check suggestions
    suggestions = parsed.get("suggestions", [])
    for s in suggestions:
        if isinstance(s, dict) and (s.get("message") or s.get("type")):
            return True
    return False


def _try_local_parse_schedule_import(text: str) -> dict | None:
    """Try local regex-based parsing of course schedule text into servers/channels/schedules.
    
    Handles format like:
    CourseName DayOfWeek StartTime-EndTime
    Chapter1
    Chapter2
    """
    import re
    from datetime import datetime, date, timedelta
    
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    if len(lines) < 2:
        return None
    
    day_map = {
        "周一": 0, "星期二": 1, "周三": 2, "周四": 3, "周五": 4, "周六": 5, "周日": 6,
        "星期一": 0, "星期二": 1, "星期三": 2, "星期四": 3, "星期五": 4, "星期六": 5, "星期日": 6,
        "Mon": 0, "Tue": 1, "Wed": 2, "Thu": 3, "Fri": 4, "Sat": 5, "Sun": 6,
    }
    
    servers = []
    schedules = []
    current_server = None
    current_channels = []
    today = date.today()
    
    course_pattern = re.compile(
        r"^(.+?)\s*(周[一二三四五六日]|星期[一二三四五六日]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{1,2}:\d{2})\s*[-–—至到]\s*(\d{1,2}:\d{2})"
    )
    chapter_pattern = re.compile(r"^(第[一二三四五六七八九十\d]+[章节]|Unit\s*\d+|Chapter\s*\d+|[一二三四五六七八九十]、)\s*(.*)")
    
    i = 0
    while i < len(lines):
        line = lines[i]
        course_match = course_pattern.match(line)
        if course_match:
            # Finish previous server if any
            if current_server and current_channels:
                current_server["channels"] = current_channels
                servers.append(current_server)
                current_channels = []
            
            course_name = course_match.group(1).strip()
            day_str = course_match.group(2).strip()
            start_time = course_match.group(3)
            end_time = course_match.group(4)
            day_of_week = None
            for k, v in day_map.items():
                if k in day_str:
                    day_of_week = v
                    break
            
            current_server = {"name": course_name, "channels": []}
            schedules.append({
                "title": course_name,
                "description": None,
                "start_time": start_time,
                "end_time": end_time,
                "day_of_week": day_of_week,
                "repeat_rule": {"type": "weekly"},
                "is_all_day": False,
                "confidence": 0.85,
            })
        elif chapter_pattern.match(line) and current_server:
            ch_match = chapter_pattern.match(line)
            ch_name = ch_match.group(2) if ch_match.group(2) else line
            current_channels.append({
                "name": ch_name[:100],
                "notes": [{"content": f"{current_server['name']} - {ch_name}"}]
            })
        
        i += 1
    
    # Add last server
    if current_server and current_channels:
        current_server["channels"] = current_channels
        servers.append(current_server)
    
    if not servers and not schedules:
        return None
    
    return {
        "servers": servers,
        "schedules": schedules,
        "suggestions": [
            {"type": "study_tip", "target_server": None, "message": "请检查解析结果，手动调整不准确的内容。"}
        ],
    }


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
