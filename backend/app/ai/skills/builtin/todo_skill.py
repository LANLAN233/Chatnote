import json
import logging
from datetime import date, time

from agno.agent import Agent

from app.ai.schedule import parse_natural_language_schedule
from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.models.models import Schedule

logger = logging.getLogger(__name__)


class TodoSkill(BaseSkill):
    name = "todo"
    description = "AI 智能创建待办事项"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$todo: Describe what you need to do.")

        agent = Agent(
            model=context.model,
            name="Todo Creator",
            system_message_role="system",
            instructions="""You are a smart task extraction and organization assistant for ChatNote.

Your task is to intelligently extract actionable todo items from user input and enrich them with useful metadata.

## Extraction Rules

1. **Core Task Extraction**
   - Identify the primary action the user needs to take
   - Remove filler words and conversational context
   - Convert to a clear, actionable statement starting with a verb
   - Examples:
     - "我明天得把高数作业交了" → "完成高等数学作业并提交"
     - "记得复习第三章" → "复习第三章内容"
     - "need to email professor about extension" → "Email professor requesting deadline extension"

2. **Priority Detection**
   - HIGH: Contains words like "紧急", "urgent", "deadline", "明天", "今天必须"
   - MEDIUM: Contains words like "需要", "应该", "should", "下周"
   - LOW: Contains words like "有时间的话", "maybe", "eventually"
   - If no priority cues, default to MEDIUM

3. **Deadline Extraction**
   - Extract any temporal references: "明天", "周五", "next Monday", "3天后"
   - Convert to relative or absolute date descriptions
   - If multiple deadlines, note the earliest one

4. **Category Inference**
   - Infer the subject domain: "数学", "编程", "英语", "项目"
   - This helps organize todos in the appropriate server/channel

## Output Format
Return a single, well-formed todo description. Optionally include:
- [优先级] at the start if clearly high priority
- (截止日期) at the end if a deadline is mentioned

## Examples
Input: "明天下午要交线性代数作业，很急！"
Output: "[高优先级] 完成线性代数作业并提交 (明天下午)"

Input: "记得周末复习一下物理第三章"
Output: "复习物理第三章内容 (本周末)

Input: "I need to finish the React project by next Friday"
Output: "Complete React project (next Friday)"""
        )
        response = await agent.arun(input=f"Extract todo: {args}")
        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(type="output", content=f"📝 $todo: {content}")


class ScheduleSkill(BaseSkill):
    name = "schedule"
    description = "AI 智能解析日程并创建"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$schedule: Describe your schedule, e.g. '$schedule 明天下午2点高数课'")

        try:
            parsed = await parse_natural_language_schedule(args, context.model)
            title = parsed.get("title") or args[:50]
            start_str = parsed.get("start_time")
            end_str = parsed.get("end_time")
            date_str = parsed.get("date")
            day_of_week = parsed.get("day_of_week")
            repeat_rule_raw = parsed.get("repeat_rule")
            is_all_day = parsed.get("is_all_day", False)
            description = parsed.get("description")
            confidence = parsed.get("confidence", 0.5)

            if not start_str:
                return SkillResult(
                    type="error",
                    content=f"无法从输入中解析时间，请提供更明确的时间描述\n解析结果: {parsed.get('title', args)}",
                )

            # Parse time strings
            try:
                start_time = time.fromisoformat(start_str) if ":" in start_str else time(9, 0)
            except (ValueError, TypeError):
                start_time = time(9, 0)
            try:
                end_time = time.fromisoformat(end_str) if end_str and ":" in (end_str or "") else None
            except (ValueError, TypeError):
                end_time = None

            schedule_date = None
            if date_str:
                try:
                    schedule_date = date.fromisoformat(date_str)
                except (ValueError, TypeError):
                    pass

            # Normalize repeat_rule
            repeat_rule = None
            if repeat_rule_raw:
                if isinstance(repeat_rule_raw, dict):
                    repeat_rule = json.dumps(repeat_rule_raw, ensure_ascii=False)
                elif isinstance(repeat_rule_raw, str):
                    try:
                        json.loads(repeat_rule_raw)
                        repeat_rule = repeat_rule_raw
                    except json.JSONDecodeError:
                        pass

            # Create schedule in database
            schedule = Schedule(
                user_id=context.user_id,
                title=title,
                description=description,
                start_time=start_time,
                end_time=end_time,
                date=schedule_date,
                day_of_week=day_of_week,
                repeat_rule=repeat_rule,
                is_all_day=is_all_day,
            )
            context.db.add(schedule)
            await context.db.flush()
            await context.db.refresh(schedule)

            # Build response message
            date_display = schedule_date.strftime("%Y-%m-%d") if schedule_date else "未指定日期"
            time_display = start_str
            if end_str:
                time_display += f" - {end_str}"
            if repeat_rule:
                try:
                    rr = json.loads(repeat_rule)
                    rr_type = rr.get("type", "")
                    if rr_type == "daily":
                        time_display += " (每日)"
                    elif rr_type == "weekly":
                        time_display += " (每周)"
                except (json.JSONDecodeError, TypeError):
                    pass

            return SkillResult(
                type="output",
                content=f"📅 日程已创建: {title}\n日期: {date_display}  时间: {time_display}",
                data={
                    "schedule_id": schedule.id,
                    "title": title,
                    "start_time": start_str,
                    "end_time": end_str,
                    "date": date_str,
                    "confidence": confidence,
                },
            )
        except Exception as e:
            logger.error("Schedule skill failed: %s", e)
            return SkillResult(type="error", content=f"日程解析失败: {e}")
