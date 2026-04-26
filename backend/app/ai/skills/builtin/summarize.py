from agno.agent import Agent
from sqlalchemy import select

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.models.models import Note


class SummarizeSkill(BaseSkill):
    name = "summarize"
    description = "AI 摘要最近笔记或指定内容"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        result = await context.db.execute(
            select(Note)
            .where(Note.user_id == context.user_id)
            .order_by(Note.created_at.desc())
            .limit(10)
        )
        recent = result.scalars().all()
        ctx_text = "\n".join([f"- {n.content[:200]}" for n in recent]) if recent else "(no notes)"

        agent = Agent(
            model=context.model,
            name="Summarizer",
            system_message_role="system",
            instructions="Summarize the content concisely. Highlight key points and themes.",
        )
        prompt = f"Recent notes:\n{ctx_text}\n\nRequest: {args or 'Summarize the recent notes'}"
        response = await agent.arun(input=prompt)
        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(type="output", content=f"📋 $summarize\n{content}")
