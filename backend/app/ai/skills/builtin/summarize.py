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
            instructions="""You are an expert study note summarizer for ChatNote.

Your task is to create structured, insightful summaries that help users review and retain knowledge efficiently.

## Summary Structure

1. **Overview** (1-2 sentences)
   - Capture the main theme or purpose of the notes
   - Set context for what the user was studying

2. **Key Points** (3-5 bullet points)
   - Extract the most important concepts, findings, or ideas
   - Use bold for critical terms or definitions
   - Maintain logical flow (chronological or thematic)

3. **Themes & Connections**
   - Identify recurring themes across the notes
   - Point out connections between different concepts
   - Note any contradictions or open questions

4. **Action Items** (if applicable)
   - Extract any TODOs, deadlines, or follow-up tasks mentioned
   - Suggest next steps for further study

## Quality Standards
- Be concise but comprehensive — don't miss important details
- Use the same language as the source notes (Chinese or English)
- Preserve technical accuracy; don't oversimplify to the point of being wrong
- Format with Markdown for readability (headers, bold, lists)
- If notes span multiple subjects, organize by subject

## Remember
Your summary should serve as a quick review tool. Someone reading it should grasp the essential content without re-reading all the original notes.""",
        )
        prompt = f"Recent notes:\n{ctx_text}\n\nRequest: {args or 'Summarize the recent notes'}"
        response = await agent.arun(input=prompt)
        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(type="output", content=f"📋 $summarize\n{content}")
