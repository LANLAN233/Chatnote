"""$query Skill — Two-agent pipeline for knowledge-base Q&A.

Stage 1 (Retrieval Agent, fast model): Given the user's question and
    fetched notes, select the Top-5 most relevant notes and extract key excerpts.
Stage 2 (Answer Agent, strong model): Based on the Top-5 notes and the
    original question, generate a comprehensive answer with source citations.
"""

from __future__ import annotations

import json
import logging
import re
import time

from agno.agent import Agent
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.models import get_model_by_tier
from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.models.models import Channel, Server
from app.schemas.ai_progress import AiProgressStage
from app.services.note_service import fetch_notes_for_context

logger = logging.getLogger(__name__)

# Maximum notes to feed into Stage 2 (answer generation)
MAX_SOURCE_NOTES = 5
# Notes to fetch from DB for retrieval (wider net)
FETCH_LIMIT = 20


class QuerySkill(BaseSkill):
    name = "query"
    description = "知识库问答 — 在指定服务器/频道中检索笔记并生成 AI 回答"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        question = args.strip()
        if not question:
            return SkillResult(
                type="error",
                content="$query: Please provide a question after @Server #Channel.",
            )

        ctx = context.server_context or {}
        server_id = ctx.get("server_id")
        server_name = ctx.get("server_name", "Unknown Server")
        channel_id = ctx.get("channel_id")
        channel_name = ctx.get("channel_name")

        if not server_id:
            return SkillResult(
                type="error",
                content="$query: No server specified. Use @Server [#Channel] to target your query.",
            )

        # -----------------------------------------------------------------
        # 1. Fetch notes from the target server/channel
        # -----------------------------------------------------------------
        db: AsyncSession = context.db
        raw_notes: list[str] = await fetch_notes_for_context(
            db,
            user_id=context.user_id,
            server_id=server_id,
            channel_id=channel_id,
            limit=FETCH_LIMIT,
        )

        # Merge loaded notes from session context (deduplicate by content)
        if context.loaded_notes:
            seen = set(raw_notes)
            for note in context.loaded_notes:
                if note not in seen:
                    raw_notes.append(note)
                    seen.add(note)
            # Limit total notes to FETCH_LIMIT * 2 to avoid prompt overflow
            if len(raw_notes) > FETCH_LIMIT * 2:
                raw_notes = raw_notes[:FETCH_LIMIT * 2]

        if not raw_notes:
            scope = f"#{channel_name}" if channel_name else f"@{server_name}"
            return SkillResult(
                type="output",
                content=f"📭 在 {scope} 中未找到任何笔记。请先添加一些笔记再提问。\n\n"
                f"No notes found in {scope}. Add some notes first before querying.",
            )

        # -----------------------------------------------------------------
        # 2. Stage 1 — Retrieval Agent (fast model)
        #    Select Top-5 most relevant notes from the fetched set
        # -----------------------------------------------------------------
        # Emit progress: retrieval start
        t_retrieval_start: float | None = None
        if context.ws_manager and context.operation_id and context.user_id:
            t_retrieval_start = time.time()
            await context.ws_manager.broadcast_ai_progress(
                context.user_id,
                context.operation_id,
                AiProgressStage(
                    stage="retrieval",
                    status="in_progress",
                    model="",
                    tier="fast",
                    message="Searching notes...",
                ),
            )

        fast_model = await get_model_by_tier(context.user_id, db, tier="fast")
        if fast_model is None:
            fast_model = context.model  # fallback

        top_notes = await self._retrieve_top_notes(
            fast_model, question, raw_notes, server_name, channel_name
        )

        # Emit progress: retrieval complete
        if context.ws_manager and context.operation_id and context.user_id and t_retrieval_start is not None:
            await context.ws_manager.broadcast_ai_progress(
                context.user_id,
                context.operation_id,
                AiProgressStage(
                    stage="retrieval",
                    status="completed",
                    model=getattr(fast_model, "id", ""),
                    tier="fast",
                    message=f"Found {len(top_notes)} notes",
                    metadata={"notes_found": len(top_notes)},
                    duration_ms=int((time.time() - t_retrieval_start) * 1000),
                ),
            )

        # -----------------------------------------------------------------
        # 3. Stage 2 — Answer Agent (strong model)
        #    Generate answer based on Top-5 notes + original question
        # -----------------------------------------------------------------
        strong_model = await get_model_by_tier(context.user_id, db, tier="strong")
        if strong_model is None:
            strong_model = context.model  # fallback

        # Emit progress: answer generation start
        t_answer_start: float | None = None
        if context.ws_manager and context.operation_id and context.user_id:
            t_answer_start = time.time()
            await context.ws_manager.broadcast_ai_progress(
                context.user_id,
                context.operation_id,
                AiProgressStage(
                    stage="answer_generation",
                    status="in_progress",
                    model=getattr(strong_model, "id", ""),
                    tier="strong",
                    message="Generating answer...",
                ),
            )

        answer = await self._generate_answer(
            strong_model, question, top_notes, server_name, channel_name
        )

        # Emit progress: answer generation complete
        if context.ws_manager and context.operation_id and context.user_id and t_answer_start is not None:
            await context.ws_manager.broadcast_ai_progress(
                context.user_id,
                context.operation_id,
                AiProgressStage(
                    stage="answer_generation",
                    status="completed",
                    model=getattr(strong_model, "id", ""),
                    tier="strong",
                    message="Answer ready",
                    duration_ms=int((time.time() - t_answer_start) * 1000),
                ),
            )

        # -----------------------------------------------------------------
        # 4. Build source citations and confidence
        # -----------------------------------------------------------------
        sources = self._build_sources(raw_notes, top_notes, server_name)
        confidence = self._estimate_confidence(top_notes, raw_notes)

        scope_display = f"@{server_name}"
        if channel_name:
            scope_display += f" #{channel_name}"

        # Build structured response
        response_lines = [
            f"🔍 **知识库查询** — {scope_display}",
            "",
            f"**问题:** {question}",
            "",
            "---",
            "",
            answer,
            "",
            "---",
            "",
            f"**📊 置信度: {confidence:.0%}** | 检索到 {len(raw_notes)} 条笔记",
        ]

        # Append source citations
        if sources:
            response_lines.append("")
            response_lines.append("**📚 参考来源:**")
            for i, src in enumerate(sources, 1):
                response_lines.append(f"{i}. [{src['channel']}] {src['excerpt']}")

        return SkillResult(
            type="output",
            content="\n".join(response_lines),
            data={
                "answer": answer,
                "sources": sources,
                "confidence": confidence,
                "server_name": server_name,
                "channel_name": channel_name,
                "total_notes_fetched": len(raw_notes),
            },
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def _retrieve_top_notes(
        self,
        model,
        question: str,
        notes: list[str],
        server_name: str,
        channel_name: str | None,
    ) -> list[str]:
        """Stage 1: Use fast model to select the Top-5 most relevant notes.

        The model is given all fetched notes labeled by index and must return
        a JSON array of indices [0, 3, 7, ...] representing the most relevant ones.
        """
        scope = f"@{server_name}"
        if channel_name:
            scope += f" #{channel_name}"

        notes_text = "\n".join(
            f"[{i}] {note}" for i, note in enumerate(notes)
        )

        notes_context = notes_text[:6000]  # safety truncation

        agent = Agent(
            model=model,
            name="Retrieval Agent",
            system_message_role="system",
            instructions=f"""You are a retrieval agent for ChatNote. Your job is to find the most relevant notes from a user's knowledge base.

## Context
The user has notes stored in {scope}. Below is a list of notes indexed by number.
Each note is formatted as "[channel_name] content".

## Your Task
1. Read the user's question carefully
2. Review ALL notes below
3. Select the Top-{MAX_SOURCE_NOTES} most RELEVANT notes to the question
4. Output ONLY a JSON array of indices: [2, 7, 3, ...]

## Notes Database
{notes_context}

## Rules
- Choose AT MOST {MAX_SOURCE_NOTES} notes
- Prioritize semantic relevance over keyword matching
- If fewer than {MAX_SOURCE_NOTES} notes are relevant, return only those
- Output ONLY the JSON array, nothing else
- Example output: [0, 3, 5]""",
        )

        try:
            response = await agent.arun(
                input=f"User question: {question}\n\nFind the Top-{MAX_SOURCE_NOTES} most relevant notes."
            )
            content = response.content if hasattr(response, "content") else str(response)
            # Parse JSON array from response
            indices = self._parse_indices(content)
            if not indices:
                # Fallback: return all notes up to MAX_SOURCE_NOTES
                return notes[:MAX_SOURCE_NOTES]
            # Collect notes by indices
            selected = []
            for idx in indices:
                if 0 <= idx < len(notes):
                    selected.append(notes[idx])
                if len(selected) >= MAX_SOURCE_NOTES:
                    break
            return selected if selected else notes[:MAX_SOURCE_NOTES]
        except Exception as exc:
            logger.warning("Retrieval agent failed: %s, using fallback", exc)
            return notes[:MAX_SOURCE_NOTES]

    async def _generate_answer(
        self,
        model,
        question: str,
        top_notes: list[str],
        server_name: str,
        channel_name: str | None,
    ) -> str:
        """Stage 2: Use strong model to generate a comprehensive answer."""
        scope = f"@{server_name}"
        if channel_name:
            scope += f" #{channel_name}"

        notes_text = "\n\n".join(top_notes)

        agent = Agent(
            model=model,
            name="Answer Agent",
            system_message_role="system",
            instructions=f"""You are an intelligent study assistant for ChatNote. Your role is to answer the user's question based on their personal notes.

## Context
The user's notes are stored in {scope}. Below are the most relevant notes found for this question.

## Guidelines
1. **Base your answer on the notes provided** — the notes represent the user's knowledge
2. **Be comprehensive but concise** — cover the key points without unnecessary verbosity
3. **Cite sources naturally** — mention which notes inform your answer (e.g., "根据你的笔记...")
4. **Identify gaps** — if the notes don't fully answer the question, mention what's missing
5. **Language matching** — respond in the same language as the question
6. **Structure clearly** — use headings, bullet points, or numbered steps when helpful

## Relevant Notes
{notes_text}

## Remember
You're helping the user understand and utilize their own knowledge. Be accurate, helpful, and respectful of what they've recorded.""",
        )

        try:
            response = await agent.arun(input=question)
            content = response.content if hasattr(response, "content") else str(response)
            return content.strip() or "无法生成回答。No answer could be generated from the notes."
        except Exception as exc:
            logger.error("Answer agent failed: %s", exc)
            return f"⚠️ 生成回答时出错: {exc}"

    def _parse_indices(self, text: str) -> list[int]:
        """Parse a JSON array of indices from model output.

        Handles various output formats:
        - "[0, 3, 5]"
        - "```json\n[0, 3, 5]\n```"
        - "[0,3,5]"
        """
        # Strip markdown code fences
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"```\s*$", "", cleaned)
        cleaned = cleaned.strip()

        # Try JSON parse
        try:
            parsed = json.loads(cleaned)
            if isinstance(parsed, list):
                return [int(i) for i in parsed]
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

        # Fallback: find any array pattern with regex
        match = re.search(r"\[([0-9,\s]+)\]", text)
        if match:
            try:
                return [int(x.strip()) for x in match.group(1).split(",") if x.strip()]
            except ValueError:
                pass

        return []

    def _build_sources(
        self,
        raw_notes: list[str],
        top_notes: list[str],
        server_name: str,
    ) -> list[dict]:
        """Build source citations from selected notes."""
        sources = []
        for note in top_notes:
            # Extract channel name from "[channel_name] content" format
            match = re.match(r"^\[([^\]]+)\]\s*(.*)", note)
            if match:
                channel = match.group(1)
                content = match.group(2)
            else:
                channel = "unknown"
                content = note

            # Truncate excerpt
            excerpt = content[:120] + "..." if len(content) > 120 else content
            sources.append({
                "channel": channel,
                "server": server_name,
                "excerpt": excerpt,
            })
        return sources

    def _estimate_confidence(
        self,
        top_notes: list[str],
        raw_notes: list[str],
    ) -> float:
        """Estimate confidence based on note coverage."""
        if not top_notes:
            return 0.0
        # Simple heuristic: more relevant notes found = higher confidence
        ratio = len(top_notes) / min(MAX_SOURCE_NOTES, max(len(raw_notes), 1))
        return round(min(ratio * 0.9 + 0.1, 1.0), 2)  # floor at 0.1
