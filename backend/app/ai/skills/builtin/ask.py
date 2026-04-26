from agno.agent import Agent

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult


class AskSkill(BaseSkill):
    name = "ask"
    description = "通用 AI 问答助手"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$ask: Please provide a question.")

        agent = Agent(
            model=context.model,
            name="Ask Assistant",
            system_message_role="system",
            instructions="You are a helpful assistant in ChatNote. Answer concisely. Reference notes, schedules, and study topics when relevant.",
        )
        response = await agent.arun(input=args)
        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(type="output", content=f"🤖 {content}")
