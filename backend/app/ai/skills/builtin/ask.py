"""$ask Skill — General-purpose AI Q&A assistant with agno tools.

Equipped with DuckDuckGo web search, Calculator, Python sandbox,
and custom note-search / stats tools that have full access to the
user's ChatNote knowledge base.
"""

from __future__ import annotations

from typing import Any

from agno.agent import Agent
from agno.tools.calculator import CalculatorTools
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.python import PythonTools

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.ai.tools import make_get_stats_tool, make_search_notes_tool


class AskSkill(BaseSkill):
    name = "ask"
    description = "通用 AI 问答助手 — equipped with web search, calculator, Python, and note tools"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$ask: Please provide a question.")

        # ── Instantiate agno built-in tools ────────────────────────────
        duckduckgo = DuckDuckGoTools()
        calculator = CalculatorTools()
        python = PythonTools()  # sandbox enabled by default

        # ── Factory tools need db/user_id captured in the closure ──────
        search_notes = make_search_notes_tool(context.db, context.user_id)
        get_stats = make_get_stats_tool(context.db, context.user_id)

        agent = Agent(
            model=context.model,
            name="Ask Assistant",
            system_message_role="system",
            instructions="""You are ChatNote AI, an intelligent study companion and knowledge assistant embedded in a Discord-style study notes application.

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
- **get_stats()**: Get the user's statistics (server/channel/note counts). Use this for context about their knowledge base.""",
            tools=[
                duckduckgo,
                calculator,
                python,
                search_notes,
                get_stats,
            ],
            read_tool_call_history=True,
        )

        response = await agent.arun(input=args)
        content = response.content if hasattr(response, "content") else str(response)

        # ── Extract tool call metadata from RunResponse ────────────────
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

        return SkillResult(
            type="output",
            content=f"🤖 {content}",
            data={
                "tool_calls": tool_calls,
                "tool_results": tool_results,
            },
        )
