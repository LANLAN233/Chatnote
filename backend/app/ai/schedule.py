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
from app.ai.models import PROVIDER_CONFIG

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
    - **CRITICAL**: Every schedule MUST include a `server_name` field that matches exactly one of the `servers[*].name` values. This is required for the system to associate schedules with the correct server/channel.

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
            "confidence": 0.0-1.0,
            "server_name": "对应Server的名称（必须与servers中的某个name一致）"
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

# Mid-length prompt optimized for Kimi k2.5 vision — more detailed than the
# original 16-line version for better structure extraction, but shorter than
# the full 72-line SCHEDULE_IMPORT_PROMPT to avoid image processing timeout.
KIMI_VISION_PROMPT = """You are an expert academic schedule analyst for ChatNote. Extract ALL courses, topics, and schedule information from the provided image and output structured JSON. Do NOT add markdown formatting, code fences, or explanations outside the JSON.

## Analysis Strategy

1. **Course Extraction**
   Identify ALL courses/subjects mentioned in the image. Use concise Chinese names (2-10 characters). Group related sub-topics under the same course server (e.g., "理论力学" and "材料力学" both under "力学").

2. **Topic Hierarchy**
   Break each course into logical chapters/units as channels. Each channel represents a distinct learning module. For each channel, generate a brief 1-line overview note. Consider prerequisite relationships when ordering channels.

3. **Schedule Extraction**
   Extract ALL class times, recurrence patterns, and locations. Handle formats like "周一 8:00-9:35", "Mon/Wed/Fri 2pm", "第1-18周". Include location info in the description field. Distinguish between lectures, labs, and review sessions. Handle exam dates and special events.

4. **Smart Suggestions**
   Identify missing study resources (e.g., "建议添加 #习题集 频道"). Suggest complementary channels, note scheduling conflicts, recommend review schedules. Use type "channel" for channel suggestions, "schedule" for schedule items, "study_tip" for general advice.

## Output Format
{
  "servers": [{"name": "CourseName", "channels": [{"name": "Chapter 1", "notes": [{"content": "Brief overview"}]}]}],
  "schedules": [{"title": "CourseName", "start_time": "HH:MM", "end_time": "HH:MM", "date": "YYYY-MM-DD or null", "day_of_week": 0, "repeat_rule": {"type": "weekly"} or null, "is_all_day": false, "server_name": "对应Server的名称（必须与servers中的某个name一致）", "description": "Location or notes", "confidence": 0.9}],
  "suggestions": [{"type": "channel", "target_server": "Server Name", "message": "建议添加 #习题集 频道"}]
}

## Rules
- day_of_week: 0=Monday, 1=Tuesday, 2=Wednesday, 3=Thursday, 4=Friday, 5=Saturday, 6=Sunday
- **CRITICAL**: Every schedule MUST include a "server_name" field that matches EXACTLY one of the servers[*].name values
- Use concise Chinese names for courses
- Group related topics as channels under each course server
- ALL courses found in the image MUST appear in both servers and schedules arrays
- Output ONLY valid JSON — no markdown code fences, no explanatory text"""


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


def _apply_default_end_time(result: dict) -> dict:
    """If start_time is present but end_time is missing and not all-day, default to +1 hour."""
    start_time = result.get("start_time")
    end_time = result.get("end_time")
    if start_time and not end_time and not result.get("is_all_day"):
        try:
            parts = start_time.split(":")
            if len(parts) == 2:
                h, m = int(parts[0]), int(parts[1])
                end_h = (h + 1) % 24
                result["end_time"] = f"{end_h:02d}:{m:02d}"
        except Exception:
            pass
    return result


async def parse_natural_language_schedule(
    text: str,
    model: OpenAIChat | None,
) -> dict:
    """Parse natural language into structured schedule using Agno Agent.

    Returns local regex fallback when no model is available.
    """
    local = _try_local_parse(text)
    if local and local.get("confidence", 0) > 0.8:
        return _apply_default_end_time(local)

    if model is None:
        if local:
            return _apply_default_end_time(local)
        return _apply_default_end_time({
            "title": text[:50],
            "description": None,
            "start_time": "09:00",
            "end_time": None,
            "date": date.today().isoformat(),
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.3,
        })

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
            return _apply_default_end_time(result.model_dump())
        # Try model_validate (handles dict, string via pydantic v2 coercion)
        if result is not None:
            try:
                validated = ParsedSchedule.model_validate(result)
                return _apply_default_end_time(validated.model_dump())
            except Exception:
                pass
        # Try parsing JSON from string (some models return raw JSON text)
        if isinstance(result, str):
            try:
                parsed = json.loads(result)
                validated = ParsedSchedule.model_validate(parsed)
                return _apply_default_end_time(validated.model_dump())
            except Exception:
                # Try extracting JSON from markdown code block
                match = re.search(r'```json\s*(.*?)\s*```', result, re.DOTALL)
                if match:
                    try:
                        parsed = json.loads(match.group(1))
                        validated = ParsedSchedule.model_validate(parsed)
                        return _apply_default_end_time(validated.model_dump())
                    except Exception:
                        pass
                # Try extracting first JSON object
                match = re.search(r'\{.*\}', result, re.DOTALL)
                if match:
                    try:
                        parsed = json.loads(match.group())
                        validated = ParsedSchedule.model_validate(parsed)
                        return _apply_default_end_time(validated.model_dump())
                    except Exception:
                        pass
        logger.warning("Schedule parse: Agent returned unparseable result type=%s, using fallback", type(result).__name__)
        if local:
            return _apply_default_end_time(local)
        return _apply_default_end_time({
            "title": text[:50],
            "description": None,
            "start_time": "09:00",
            "end_time": None,
            "date": date.today().isoformat(),
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.3,
        })
    except Exception as e:
        logger.warning("Schedule parse via Agent failed: %s, using local fallback", e)
        if local:
            return _apply_default_end_time(local)
        return _apply_default_end_time({
            "title": text[:50],
            "description": None,
            "start_time": "09:00",
            "end_time": None,
            "date": date.today().isoformat(),
            "day_of_week": None,
            "repeat_rule": None,
            "is_all_day": False,
            "confidence": 0.3,
        })


async def _call_kimi_vision_sdk(
    text: str | None,
    image_url: str,
    client,
) -> dict[str, Any]:
    """Call Kimi k2.5 vision via raw openai SDK (bypasses Agno).

    Used as a fallback when Agno's extra_body forwarding fails or when
    the user's default provider lacks real vision capability.
    """
    content_items: list[dict[str, Any]] = []
    if text:
        content_items.append({"type": "text", "text": text})
    resolved_url = _resolve_image_url(image_url)
    content_items.append({
        "type": "image_url",
        "image_url": {"url": resolved_url},
    })

    try:
        response = await asyncio.wait_for(
            client.chat.completions.create(
                model=PROVIDER_CONFIG["moonshot"]["vision_model"],
                messages=[
                    {"role": "system", "content": KIMI_VISION_PROMPT},
                    {"role": "user", "content": content_items},
                ],
                # max_tokens=40000 prevents output truncation; Kimi k2.5 supports up to 128k context
                max_tokens=40000,
                extra_body={"thinking": {"type": "disabled"}},
                temperature=0.6,
                top_p=0.95,
            ),
            timeout=300.0,
        )
    except asyncio.TimeoutError:
        logger.warning("Kimi vision SDK call timed out for image: %s", image_url)
        return {"servers": [], "schedules": [], "suggestions": [{"type": "error", "message": "Kimi 图片识别超时，请尝试压缩图片后重试"}]}
    except Exception:
        logger.exception("Kimi vision SDK call failed")
        return {"servers": [], "schedules": [], "suggestions": [{"type": "error", "message": "Kimi 图片识别失败，请稍后重试"}]}

    raw_content = response.choices[0].message.content
    try:
        parsed = json.loads(raw_content)
    except json.JSONDecodeError:
        # Try to extract JSON from markdown code block
        match = re.search(r'\{.*\}', raw_content or "", re.DOTALL)
        if match:
            parsed = json.loads(match.group())
        else:
            parsed = {"servers": [], "schedules": [], "suggestions": []}

    return parsed


async def parse_schedule_import(
    text: str | None,
    image_url: str | None,
    model: OpenAIChat | None = None,
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
    
    # ── Return error if image input but no model available ──────────
    if image_url and model is None:
        return {
            "servers": [],
            "schedules": [],
            "suggestions": [
                {
                    "type": "error",
                    "target_server": None,
                    "message": "图片识别需要支持视觉的 AI 模型。请确认 API Key 配置正确，或使用支持图片识别的模型（如 GPT-4o、智谱 GLM-4V、通义千问 VL）。",
                }
            ],
        }
    
    # ── Return empty for text-only without model ─────────────────────
    if model is None:
        if text:
            local = _try_local_parse_schedule_import(text)
            if local and _has_meaningful_data(local):
                return local
        return {"servers": [], "schedules": [], "suggestions": []}

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
            # Agent returned a string (often an error message) - treat as empty
            logger.warning("Schedule import: agent returned string/error: %s", str(result)[:200])
            parsed = {"servers": [], "schedules": [], "suggestions": []}

        # If AI returned empty results or error, try local parse as fallback
        if not _has_meaningful_data(parsed):
            logger.info("Schedule import AI returned empty/error, trying local parse")
            if text:
                local = _try_local_parse_schedule_import(text)
                if local and _has_meaningful_data(local):
                    return local
            # For image-only or AI-failed imports, return a helpful message
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
            # If text provided but AI failed and local parse also failed, show suggestion
            if text:
                return {
                    "servers": [],
                    "schedules": [],
                    "suggestions": [
                        {
                            "type": "error",
                            "target_server": None,
                            "message": "AI 解析失败。请尝试使用更标准的格式，例如：\n课程名 周一 8:00-9:35\n第一章 内容",
                        }
                    ],
                }

        return parsed
    except Exception as e:
        logger.warning("Schedule import via Agent failed: %s, trying local parse", e)
        if text:
            local = _try_local_parse_schedule_import(text)
            if local and _has_meaningful_data(local):
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


def _is_schedule_line(line: str) -> bool:
    """Check if a line contains day-of-week and time info (without course name)."""
    return bool(re.search(r"(周[一二三四五六日]|星期[一二三四五六日]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*\d{1,2}:\d{2}", line))


def _extract_schedule(line: str) -> tuple[str | None, str | None, str | None]:
    """Extract day, start_time, end_time from a schedule-only line."""
    m = re.search(r"(周[一二三四五六日]|星期[一二三四五六日]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{1,2}:\d{2})\s*[-–—至到]\s*(\d{1,2}:\d{2})", line)
    if m:
        return m.group(1), m.group(2), m.group(3)
    # Try without end time
    m = re.search(r"(周[一二三四五六日]|星期[一二三四五六日]|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s*(\d{1,2}:\d{2})", line)
    if m:
        return m.group(1), m.group(2), None
    return None, None, None


def _try_local_parse_schedule_import(text: str) -> dict | None:
    """Try local regex-based parsing of course schedule text into servers/channels/schedules.
    
    Handles formats like:
    CourseName DayOfWeek StartTime-EndTime
    Chapter1
    Chapter2
    
    Or:
    CourseName
    DayOfWeek StartTime-EndTime
    Chapter1
    """
    import re
    from datetime import datetime, date, timedelta
    
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    if len(lines) < 1:
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
    pending_course_name = None
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
                "server_name": course_name,
            })
            pending_course_name = None
        elif _is_schedule_line(line):
            # Line has day+time but no course name - use pending name or previous server name
            day_str, start_time, end_time = _extract_schedule(line)
            if day_str is not None:
                # Finish previous server if any
                if current_server and current_channels:
                    current_server["channels"] = current_channels
                    servers.append(current_server)
                    current_channels = []
                
                course_name = pending_course_name or (current_server["name"] if current_server else "未命名课程")
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
                    "confidence": 0.75,
                    "server_name": course_name,
                })
                pending_course_name = None
        elif chapter_pattern.match(line) and current_server:
            ch_match = chapter_pattern.match(line)
            ch_name = ch_match.group(2) if ch_match.group(2) else line
            current_channels.append({
                "name": ch_name[:100],
                "notes": [{"content": f"{current_server['name']} - {ch_name}"}]
            })
        else:
            # Could be a course name for the next schedule line
            pending_course_name = line
        
        i += 1
    
    # Add last server (even if no chapters, so schedules have a home)
    if current_server:
        if current_channels:
            current_server["channels"] = current_channels
        else:
            current_server["channels"] = [
                {"name": "课程笔记", "notes": [{"content": f"{current_server['name']} 课程笔记"}]}
            ]
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
    # ── Chinese numeral normalization ──────────────────────────────
    # Convert Chinese numeral times ("四点"→"4点", "十二点"→"12点")
    # so the existing Arabic-digit regex patterns can match them.
    cn_num = {"一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    text = text.replace("十二", "12").replace("十一", "11").replace("十", "10")
    for cn, n in cn_num.items():
        text = re.sub(cn + r"(?=点|时)", str(n), text)
    text = text.replace("点半", "点30分")
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

    weekday_map = {"一": 0, "二": 1, "三": 2, "四": 3, "五": 4, "六": 5, "日": 6}
    weekday_full = {"周一": 0, "周二": 1, "周三": 2, "周四": 3, "周五": 4, "周六": 5, "周日": 6,
                    "星期一": 0, "星期二": 1, "星期三": 2, "星期四": 3, "星期五": 4, "星期六": 5, "星期日": 6}

    # ── Date parsing ──────────────────────────────────────────────
    if "明天" in text:
        result["date"] = (today + timedelta(days=1)).date().isoformat()
        result["confidence"] = 0.7
    elif "后天" in text:
        result["date"] = (today + timedelta(days=2)).date().isoformat()
        result["confidence"] = 0.7
    elif "今天" in text:
        result["date"] = today.date().isoformat()
        result["confidence"] = 0.7
    elif re.search(r"下周[一二三四五六日]|下星期[一二三四五六日]", text):
        # "下周三" / "下星期三" -> next Wednesday
        m = re.search(r"下(?:星期|周)([一二三四五六日])", text)
        if m:
            cn = m.group(1)
            num = weekday_map[cn]
            days_ahead = num - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            result["date"] = (today + timedelta(days=days_ahead + 7)).date().isoformat()
            result["day_of_week"] = num
            result["confidence"] = 0.7
    elif "这星期" in text or "本周" in text:
        m = re.search(r"[这本](?:星期|周)([一二三四五六日])", text)
        if m:
            cn = m.group(1)
            num = weekday_map[cn]
            days_ahead = num - today.weekday()
            if days_ahead < 0:
                days_ahead += 7
            result["date"] = (today + timedelta(days=days_ahead)).date().isoformat()
            result["day_of_week"] = num
            result["confidence"] = 0.7
    elif re.search(r"下下个[一二三四五六日]|下下周[一二三四五六日]", text):
        m = re.search(r"下下(?:星期|周)([一二三四五六日])", text)
        if m:
            cn = m.group(1)
            num = weekday_map[cn]
            days_ahead = num - today.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            result["date"] = (today + timedelta(days=days_ahead + 14)).date().isoformat()
            result["day_of_week"] = num
            result["confidence"] = 0.7
    elif "下个月" in text:
        m = re.search(r"下个月\s*(\d{1,2})\s*[号日]", text)
        if m:
            day_num = int(m.group(1))
            next_month = today.replace(day=28) + timedelta(days=4)
            next_month = next_month.replace(day=1)
            try:
                result["date"] = next_month.replace(day=day_num).date().isoformat()
                result["confidence"] = 0.7
            except ValueError:
                pass
    elif "这个月" in text or "本月" in text:
        m = re.search(r"[这本]月\s*(\d{1,2})\s*[号日]", text)
        if m:
            day_num = int(m.group(1))
            try:
                result["date"] = today.replace(day=day_num).date().isoformat()
                result["confidence"] = 0.7
            except ValueError:
                pass

    # ── Time parsing ──────────────────────────────────────────────
    # Try to find explicit time ranges first: "2点-4点", "14:00-16:00"
    range_match = re.search(r"(\d{1,2}):(\d{2})\s*[-~到至]\s*(\d{1,2}):(\d{2})", text)
    if range_match:
        sh, sm, eh, em = map(int, range_match.groups())
        if "下午" in text or "晚上" in text:
            if sh < 12:
                sh += 12
            if eh < 12:
                eh += 12
        result["start_time"] = f"{sh:02d}:{sm:02d}"
        result["end_time"] = f"{eh:02d}:{em:02d}"
        result["confidence"] = max(result["confidence"], 0.8)
    else:
        # Chinese style range: "2点到4点", "2点至4点"
        range_match2 = re.search(r"(\d{1,2})点\s*[-~到至]\s*(\d{1,2})点", text)
        if range_match2:
            sh, eh = int(range_match2.group(1)), int(range_match2.group(2))
            if "下午" in text or "晚上" in text:
                if sh < 12:
                    sh += 12
                if eh < 12:
                    eh += 12
            result["start_time"] = f"{sh:02d}:00"
            result["end_time"] = f"{eh:02d}:00"
            result["confidence"] = max(result["confidence"], 0.8)
        else:
            # Single time
            time_patterns = [
                r"(\d{1,2}):(\d{2})",
                r"(\d{1,2})点(?:(\d{1,2})分)?",
            ]
            for pattern in time_patterns:
                match = re.search(pattern, text)
                if match:
                    hour = int(match.group(1))
                    minute = 0
                    if match.lastindex and match.lastindex >= 2 and match.group(2):
                        try:
                            minute = int(match.group(2))
                        except (TypeError, ValueError):
                            minute = 0

                    # Determine AM/PM context
                    # Check if "下午"/"晚上" appears close to the time (within 5 chars before or after)
                    time_pos = match.start()
                    context = text[max(0, time_pos - 5):time_pos + 10]
                    if "下午" in context or "晚上" in context:
                        if hour < 12:
                            hour += 12
                    elif "上午" in context or "早上" in context:
                        if hour == 12:
                            hour = 0

                    result["start_time"] = f"{hour:02d}:{minute:02d}"
                    result["confidence"] = max(result["confidence"], 0.6)

                    # Check for duration like "2小时", "1个半小时"
                    duration_match = re.search(r"(\d{1,2})(?:个)?半?小时", text[match.end():])
                    if duration_match:
                        dur = int(duration_match.group(1))
                        if "半" in text[match.end():match.end() + 15]:
                            dur += 0.5
                        end_dt = datetime.combine(today.date(), __import__("datetime").time(hour, minute)) + timedelta(hours=dur)
                        result["end_time"] = end_dt.strftime("%H:%M")
                        result["confidence"] = max(result["confidence"], 0.75)
                    break

    # ── Recurrence parsing ────────────────────────────────────────
    if "每天" in text or "每日" in text:
        result["repeat_rule"] = json.dumps({"type": "daily"})
        result["confidence"] = max(result["confidence"], 0.7)
    elif "每周" in text or re.search(r"周[一二三四五六日]", text):
        matched_days = []
        # Try matching contiguous weekday chars first: "周一三五" -> [0,2,4]
        m = re.search(r"周([一二三四五六日]+)", text)
        if m:
            for cn in m.group(1):
                if cn in weekday_map and weekday_map[cn] not in matched_days:
                    matched_days.append(weekday_map[cn])
        else:
            # Fallback: scan individually
            for cn, num in weekday_map.items():
                if f"周{cn}" in text and num not in matched_days:
                    matched_days.append(num)
        if matched_days:
            result["day_of_week"] = matched_days[0]
            if len(matched_days) > 1:
                result["repeat_rule"] = json.dumps({"type": "weekly", "days": matched_days})
            else:
                result["repeat_rule"] = json.dumps({"type": "weekly"})
            result["confidence"] = max(result["confidence"], 0.7)
    elif "工作日" in text:
        result["repeat_rule"] = json.dumps({"type": "weekly", "days": [0, 1, 2, 3, 4]})
        result["confidence"] = max(result["confidence"], 0.7)

    # ── All-day parsing ───────────────────────────────────────────
    if "全天" in text or "整天" in text:
        result["is_all_day"] = True
        result["start_time"] = "00:00"
        result["end_time"] = "23:59"

    # ── Title extraction ──────────────────────────────────────────
    title = text
    # Remove temporal phrases (using word boundaries where possible)
    removal_patterns = [
        r"明天|今天|后天",
        r"下周[一二三四五六日]|下星期[一二三四五六日]|下下个[一二三四五六日]",
        r"[这本]月\s*\d{1,2}\s*[号日]",
        r"下个月\s*\d{1,2}\s*[号日]",
        r"\d{1,2}:\d{2}\s*[-~到至]\s*\d{1,2}:\d{2}",
        r"\d{1,2}点\s*[-~到至]\s*\d{1,2}点",
        r"\d{1,2}:\d{2}",
        r"\d{1,2}点(?:\d{1,2}分)?",
        r"\d{1,2}(?:个)?半?小时",
        r"上午|下午|早上|晚上|凌晨|中午",
        r"每天|每日|每周|工作日",
        r"全天|整天",
    ]
    for pat in removal_patterns:
        title = re.sub(pat, "", title)
    # Clean up extra spaces and punctuation
    title = re.sub(r"[\s\-~到至]+", " ", title).strip()
    # Remove leading/trailing punctuation
    title = title.strip("，,。.;:!?！？")
    if title:
        result["title"] = title

    return result if result["confidence"] > 0.5 else None
