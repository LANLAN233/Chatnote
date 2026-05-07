"""$summarize Skill — AI 摘要最近笔记。

If the model does not support tool calling (e.g. WikipediaTools),
it falls back to a plain-text agent without tools.
"""

import logging

from agno.agent import Agent
from agno.tools.wikipedia import WikipediaTools
from sqlalchemy import select

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.ai.skills.builtin.ask import _is_tool_call_error
from app.models.models import Note

logger = logging.getLogger(__name__)


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
        prompt = f"Recent notes:\n{ctx_text}\n\nRequest: {args or 'Summarize the recent notes'}"

        # ── Try with WikipediaTools first ──────────────────────────────
        result_data = await self._run_with_tools(prompt, context)
        if result_data is not None:
            return SkillResult(
                type="output",
                content=f"📋 $summarize\n{result_data['content']}",
                data={"wiki_sources": result_data.get("wiki_sources", [])},
            )

        # ── Fallback: plain agent without tools ───────────────────────
        logger.info("$summarize: tool-calling failed, falling back to plain agent")
        return await self._run_plain(prompt, context)

    async def _run_with_tools(self, prompt: str, context: SkillContext) -> dict | None:
        """Try with WikipediaTools. Returns None if fallback needed."""
        agent = Agent(
            model=context.model,
            name="Summarizer",
            system_message_role="system",
            tools=[WikipediaTools()],
            read_tool_call_history=True,
            instructions=_SUMMARIZE_INSTRUCTIONS_TOOLS,
        )

        try:
            response = await agent.arun(input=prompt)
        except Exception as exc:
            logger.warning("$summarize with tools raised: %s, will fallback", exc)
            return None

        content = response.content if hasattr(response, "content") else str(response)

        if _is_tool_call_error(content):
            logger.warning("$summarize: tool-call error detected, will fallback")
            return None

        # Extract Wikipedia page titles from tool call results
        wiki_sources: list[str] = []
        tools = getattr(response, "tools", None)
        if tools:
            for tool in tools:
                if tool.tool_name and "wikipedia" in tool.tool_name.lower():
                    if tool.tool_args and "query" in tool.tool_args:
                        wiki_sources.append(tool.tool_args["query"])
        wiki_sources = list(dict.fromkeys(wiki_sources))

        return {"content": content, "wiki_sources": wiki_sources}

    async def _run_plain(self, prompt: str, context: SkillContext) -> SkillResult:
        """Plain agent without tools."""
        agent = Agent(
            model=context.model,
            name="Summarizer",
            system_message_role="system",
            instructions=_SUMMARIZE_INSTRUCTIONS_PLAIN,
        )

        try:
            response = await agent.arun(input=prompt)
        except Exception as exc:
            logger.error("$summarize plain agent failed: %s", exc)
            return SkillResult(
                type="error",
                content=f"$summarize 执行失败: {exc}",
            )

        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(
            type="output",
            content=f"📋 $summarize\n{content}",
            data={},
        )


_SUMMARIZE_INSTRUCTIONS_PLAIN = """You are an expert study note summarizer for ChatNote.

Your task is to create structured, insightful summaries that help users review and retain knowledge efficiently.

## Summary Structure

1. **Overview** (1-2 sentences) — main theme, context
2. **Key Points** (3-5 bullet points) — most important concepts, bold for critical terms
3. **Themes & Connections** — recurring themes, concept connections, open questions
4. **Action Items** (if applicable) — TODOs, deadlines, next steps

## Quality Standards
- Be concise but comprehensive
- Use the same language as the source notes (Chinese or English)
- Preserve technical accuracy
- Format with Markdown (headers, bold, lists)
- If notes span multiple subjects, organize by subject"""

_SUMMARIZE_INSTRUCTIONS_TOOLS = """You are an expert study note summarizer for ChatNote.

Your task is to create structured, insightful summaries that help users review and retain knowledge efficiently.

## Tools Available
- **search_wikipedia**: Look up definitions and background for technical terms, concepts, or topics mentioned in the notes. Use this to enrich your summary with authoritative definitions.

## Summary Structure

1. **Overview** (1-2 sentences)
   - Capture the main theme or purpose of the notes
   - Set context for what the user was studying

2. **Key Points** (3-5 bullet points)
   - Extract the most important concepts, findings, or ideas
   - Use bold for critical terms or definitions
   - Maintain logical flow (chronological or thematic)
   - Where helpful, include Wikipedia definitions for key technical terms

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
- When you use Wikipedia, cite the page title as the source

## Remember
Your summary should serve as a quick review tool. Someone reading it should grasp the essential content without re-reading all the original notes."""
