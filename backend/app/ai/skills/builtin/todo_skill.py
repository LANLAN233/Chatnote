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
            instructions="Extract the todo item from the text. Return a clear, single-line actionable task description.",
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
