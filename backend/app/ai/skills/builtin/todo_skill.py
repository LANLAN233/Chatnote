import logging

from agno.agent import Agent

from app.ai.schedule import parse_natural_language_schedule
from app.ai.skills.base import BaseSkill, SkillContext, SkillResult

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
    description = "AI 智能解析日程"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$schedule: Describe your schedule, e.g. 'tomorrow 2pm math class'")

        try:
            parsed = await parse_natural_language_schedule(args, context.model)
            title = parsed.get("title", "Schedule")
            start = parsed.get("start_time", "?")
            return SkillResult(
                type="output",
                content=f"📅 $schedule: {title} at {start}",
            )
        except Exception as e:
            logger.error("Schedule skill failed: %s", e)
            return SkillResult(type="error", content=f"Schedule parse failed: {e}")
