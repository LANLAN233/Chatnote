"""$ask Skill — General-purpose AI Q&A assistant with agno tools.

Equipped with DuckDuckGo web search, Calculator, Python sandbox,
and custom note-search / stats tools that have full access to the
user's ChatNote knowledge base.

If the model does not support tool calling (e.g. some opencode-go models),
it falls back to a plain-text agent without tools.
"""

from __future__ import annotations

import logging
from typing import Any

from agno.agent import Agent
from agno.tools.calculator import CalculatorTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.python import PythonTools

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.ai.tools import make_get_stats_tool, make_search_notes_tool

logger = logging.getLogger(__name__)

# Error patterns that indicate tool-calling is not supported by the model
_TOOL_UNSUPPORTED_PATTERNS = [
    "Error from provider",
    "Provider returned error",
    "does not support tools",
    "tool_choice",
    "tools not supported",
]


def _is_tool_call_error(content: str) -> bool:
    """Check if the agent response indicates a tool-calling error."""
    for pattern in _TOOL_UNSUPPORTED_PATTERNS:
        if pattern.lower() in content.lower():
            return True
    return False


class AskSkill(BaseSkill):
    name = "ask"
    description = "通用 AI 问答助手 — equipped with web search, calculator, Python, and note tools"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$ask: Please provide a question.")

        # If loaded context exists, prepend it to the question
        if context.loaded_notes:
            context_block = "以下是用户已加载的参考笔记，请结合这些笔记回答用户的问题：\n\n"
            for i, note in enumerate(context.loaded_notes, 1):
                context_block += f"{i}. {note}\n"
            context_block += f"\n---\n\n用户问题: {args}\n\n请基于上述笔记内容回答问题。如果笔记内容不足以回答问题，可以结合你的知识进行补充，但请优先基于笔记内容回答。"
            enhanced_args = context_block
        else:
            enhanced_args = args

        # ── Try with tools first ───────────────────────────────────────
        result = await self._run_with_tools(enhanced_args, context)
        if result is not None:
            return result

        # ── Fallback: plain agent without tools ───────────────────────
        logger.info("$ask: tool-calling failed, falling back to plain agent")
        return await self._run_plain(enhanced_args, context)

    async def _run_with_tools(self, args: str, context: SkillContext) -> SkillResult | None:
        """Try running with full tool set. Returns None if fallback needed."""
        duckduckgo = DuckDuckGoTools()
        calculator = CalculatorTools()
        python = PythonTools()
        search_notes = make_search_notes_tool(context.db, context.user_id)
        get_stats = make_get_stats_tool(context.db, context.user_id)

        agent = Agent(
            model=context.model,
            name="Ask Assistant",
            system_message_role="system",
            instructions=_ASK_INSTRUCTIONS_TOOLS,
            tools=[duckduckgo, calculator, python, search_notes, get_stats],
            read_tool_call_history=True,
        )

        try:
            response = await agent.arun(input=args)
        except Exception as exc:
            logger.warning("$ask with tools raised: %s, will fallback", exc)
            return None

        content = response.content if hasattr(response, "content") else str(response)

        # Check if the provider returned a tool-calling error
        if _is_tool_call_error(content):
            logger.warning("$ask: tool-call error detected in response: %s", content[:200])
            return None

        # ── Extract tool call metadata ─────────────────────────────────
        tool_calls, tool_results = _extract_tool_metadata(response)

        return SkillResult(
            type="output",
            content=f"🤖 {content}",
            data={"tool_calls": tool_calls, "tool_results": tool_results},
        )

    async def _run_plain(self, args: str, context: SkillContext) -> SkillResult:
        """Fallback: plain agent without any tools."""
        agent = Agent(
            model=context.model,
            name="Ask Assistant",
            system_message_role="system",
            instructions=_ASK_INSTRUCTIONS_PLAIN,
        )

        try:
            response = await agent.arun(input=args)
        except Exception as exc:
            logger.error("$ask plain agent failed: %s", exc, exc_info=True)
            return SkillResult(
                type="error",
                content=f"$ask 执行失败: {exc}. 请检查 API Key 是否有效。",
            )

        content = response.content if hasattr(response, "content") else str(response)
        return SkillResult(type="output", content=f"🤖 {content}", data={})


def _extract_tool_metadata(response) -> tuple[list[dict], list[dict]]:
    """Extract tool call metadata from an agno RunResponse."""
    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []
    if hasattr(response, "tools") and response.tools:
        for tool_exec in response.tools:
            tool_calls.append({
                "tool_name": getattr(tool_exec, "tool_name", None),
                "tool_args": getattr(tool_exec, "tool_args", None),
                "tool_call_error": getattr(tool_exec, "tool_call_error", None),
            })
            tool_results.append({
                "tool_name": getattr(tool_exec, "tool_name", None),
                "result": getattr(tool_exec, "result", None),
            })
    return tool_calls, tool_results


_ASK_INSTRUCTIONS_PLAIN = """You are ChatNote AI, an intelligent study companion embedded in a Discord-style study notes application.

## Your Role
- Help users understand complex concepts, solve problems, and organize their learning
- Act as a knowledgeable tutor who explains things clearly and patiently

## Response Guidelines
1. **Be Context-Aware** — reference the user's learning journey
2. **Explain Deeply but Clearly** — break down concepts, use analogies and examples
3. **Language Matching** — respond in the same language as the user's query
4. **Conciseness with Depth** — comprehensive but not verbose, use formatting for readability
5. **Be Proactive** — suggest related topics, practice problems, or further reading when appropriate

You are part of their study workflow. Your answers should help them build a stronger, more organized knowledge base."""

_ASK_INSTRUCTIONS_TOOLS = """You are ChatNote AI, an intelligent study companion and knowledge assistant embedded in a Discord-style study notes application.

## Your Role
- Help users understand complex concepts, solve problems, and organize their learning
- Act as a knowledgeable tutor who explains things clearly and patiently
- Reference the user's existing notes, schedules, and study topics when relevant

## Response Guidelines

1. **Be Context-Aware**
   - When the user asks about a topic they've taken notes on, reference those notes
   - Connect new questions to their existing knowledge structure
   - If they have an upcoming schedule related to the topic, mention it

2. **Explain Deeply but Clearly**
   - Break down complex concepts into digestible parts
   - Use analogies and examples appropriate for the subject
   - For technical topics, include code snippets or formulas when helpful
   - Structure responses with clear headings, bullet points, or numbered steps

3. **Be Proactive and Helpful**
   - If the user's question is vague, ask clarifying questions
   - Suggest related topics they might want to explore
   - Recommend how they might organize this new knowledge in their notes
   - If applicable, suggest practice problems or further reading

4. **Language Matching**
   - Respond in the same language as the user's query
   - For Chinese queries, use proper academic terminology
   - For English queries, be precise and use standard technical vocabulary

5. **Conciseness with Depth**
   - Provide comprehensive answers but avoid unnecessary verbosity
   - Use formatting (bold, lists, code blocks) to improve readability
   - When appropriate, summarize key takeaways at the end

## Remember
You are part of their study workflow. Your answers should not just solve their immediate question but help them build a stronger, more organized knowledge base.

## Available Tools
- **DuckDuckGo**: Search the web for current information, facts, or external references.
- **Calculator**: Perform precise mathematical calculations.
- **Python**: Execute Python code for data analysis, visualization, or algorithmic problem solving.
- **search_notes(query)**: Search the user's personal notes by keyword. Use this to find relevant study notes.
- **get_stats()**: Get the user's statistics (server/channel/note counts). Use this for context about their knowledge base."""
