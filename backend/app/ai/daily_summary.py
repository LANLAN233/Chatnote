import asyncio
import json
import re
import logging
import time
from datetime import date, timedelta
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Note
from app.schemas.ai_progress import AiProgressStage
from app.services.websocket import manager

logger = logging.getLogger(__name__)


class KeywordItem(BaseModel):
    keyword: str = Field(description="Extracted keyword")
    note_ids: list[int] = Field(description="Related note IDs", default_factory=list)


class DailySummaryResult(BaseModel):
    summary: str = Field(description="A concise, insightful summary of yesterday's learning (max 300 chars)")
    keywords: list[KeywordItem] = Field(description="Key concepts extracted, each with related note IDs", default_factory=list)
    total_notes: int = Field(description="Number of notes included in the summary")
    highlight_note_id: int | None = Field(description="Most important note ID of the day", default=None)


# ── Pipeline models ──────────────────────────────────────────────────────────


class ExtractedKnowledge(BaseModel):
    """Stage 1 output: structured knowledge points extracted from notes."""

    concepts: list[str] = Field(description="Structured knowledge points/concepts extracted from the notes (5-15 items)")
    total_notes_scanned: int = Field(description="Number of notes that were analyzed")


class StructuredSummary(BaseModel):
    """Stage 2 output: a polished summary of yesterday's learning."""
    summary: str = Field(description="A concise, insightful summary of yesterday's learning (max 300 chars)")
    highlight_note_id: int | None = Field(description="Most important note ID of the day", default=None)


class KeywordMapping(BaseModel):
    """Stage 3 output: keywords linked to specific note IDs."""

    keywords: list[KeywordItem] = Field(description="3-7 keywords, each mapped to related note IDs", default_factory=list)


class PipelineResult(BaseModel):
    """Aggregated pipeline result returned to the caller."""

    summary: str
    keywords: list[dict[str, Any]]
    total_notes: int
    highlight_note_id: int | None
    stages: list[dict[str, Any]]


def create_summary_agent(model: OpenAIChat) -> Agent:
    return Agent(
        model=model,
        name="Yesterday's Summary Agent",
        description="Generate a summary of yesterday's learning from a user's notes",
        system_message_role="system",
        instructions="""You are a learning coach that helps students review yesterday's study progress.

Your task is to analyze the user's notes from yesterday and generate:
1. A concise, insightful summary reflecting on yesterday's key learning themes
2. 3-7 important keywords/concepts, each linked to the most relevant note IDs

## Rules
- Summary should be reflective and motivational, like a coach reviewing yesterday's work
- Extract specific, meaningful keywords (not generic words like "study" or "note")
- Each keyword must reference the note IDs it appears in
- Pick the single most important note as the highlight
- If notes are sparse or generic, still do your best to find patterns
- Respond in the same language as the majority of the notes (Chinese or English)
- If there are no notes, indicate that clearly""",
        output_schema=DailySummaryResult,
        structured_outputs=True,
    )


async def generate_daily_summary(
    target_date: date,
    user_id: int,
    db: AsyncSession,
    model: OpenAIChat | None = None,
) -> dict[str, Any]:
    """Generate a daily summary for the given date."""
    from app.ai.models import get_model_for_user

    # Fetch notes for the target date
    result = await db.execute(
        select(Note)
        .where(
            Note.user_id == user_id,
            func.date(Note.created_at) == target_date,
        )
        .order_by(Note.created_at.desc())
    )
    notes = result.scalars().all()

    if not notes:
        return {
            "summary": f"No notes recorded on {target_date.isoformat()}. Take a moment to jot down something you learned today!",
            "keywords": [],
            "total_notes": 0,
            "highlight_note_id": None,
            "is_fallback": True,
        }

    # Build context for the agent
    note_entries = []
    for n in notes:
        note_entries.append(f"[Note #{n.id}] {n.content[:300]}")
    notes_text = "\n\n".join(note_entries)

    if model is None:
        model = await get_model_for_user(user_id, db)

    if model is None:
        # Fallback without LLM — no API key configured
        logger.warning(
            "No AI model available for user %d (no API key configured). "
            "Returning fallback summary for %s.",
            user_id, target_date.isoformat(),
        )
        return {
            "summary": f"⚠️ AI 总结未生成：未配置 API 密钥。\n\n你在 {target_date.isoformat()} 记录了 {len(notes)} 条笔记。请在设置中配置 API 密钥以启用 AI 每日总结。",
            "keywords": [],
            "total_notes": len(notes),
            "highlight_note_id": notes[0].id if notes else None,
            "is_fallback": True,
        }

    try:
        agent = create_summary_agent(model)
        response = await asyncio.wait_for(
            agent.arun(
                input=f"Date: {target_date.isoformat()}\n\nUser's notes:\n{notes_text}"
            ),
            timeout=90.0,
        )

        result = response.content

        # Structured output succeeded: agno returned a DailySummaryResult
        if isinstance(result, DailySummaryResult):
            return {
                "summary": result.summary,
                "keywords": [k.model_dump() for k in result.keywords],
                "total_notes": len(notes),
                "highlight_note_id": result.highlight_note_id,
                "is_fallback": False,
            }

        # Model returned a dict: try to validate
        if isinstance(result, dict):
            try:
                parsed = DailySummaryResult.model_validate(result)
                return {
                    "summary": parsed.summary,
                    "keywords": [k.model_dump() for k in parsed.keywords],
                    "total_notes": len(notes),
                    "highlight_note_id": parsed.highlight_note_id,
                    "is_fallback": False,
                }
            except Exception:
                pass

        # Model returned raw text (error or plain summary): use it directly
        raw_text = str(result) if result else ""
        if raw_text and not raw_text.startswith("Error"):
            logger.info("Model returned plain text (not structured), using raw text as summary")
            return {
                "summary": raw_text[:2000],
                "keywords": [],
                "total_notes": len(notes),
                "highlight_note_id": notes[0].id if notes else None,
                "is_fallback": True,
            }
        else:
            # Actual error from provider — raise to trigger fallback
            raise RuntimeError(f"Model returned error: {raw_text[:300]}")

    except Exception as e:
        logger.warning("Daily summary generation failed for user %d: %s, using fallback", user_id, e)
        return {
            "summary": f"⚠️ AI 总结生成失败：{str(e)[:200]}\n\n你在 {target_date.isoformat()} 记录了 {len(notes)} 条笔记。请稍后重试或检查 AI 服务状态。",
            "keywords": [],
            "total_notes": len(notes),
            "highlight_note_id": notes[0].id if notes else None,
            "is_fallback": True,
        }


# ── JSON parsing helper ─────────────────────────────────────────────────────


def _parse_model_response(content: Any, schema_cls: type) -> Any:
    """Robustly parse a model response into a Pydantic schema.

    Handles three cases:
    1. Already the correct type → return as-is
    2. A dict → validate via schema_cls
    3. A string → try to extract JSON, then validate
    """
    if isinstance(content, schema_cls):
        return content

    if isinstance(content, dict):
        return schema_cls.model_validate(content)

    if isinstance(content, str):
        # Try direct JSON parse first
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                return schema_cls.model_validate(data)
        except (json.JSONDecodeError, Exception):
            pass

        # Try to extract JSON block from markdown/text response
        # Look for ```json ... ``` or bare { ... }
        json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', content, re.DOTALL)
        if not json_match:
            json_match = re.search(r'(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})', content, re.DOTALL)

        if json_match:
            try:
                data = json.loads(json_match.group(1))
                if isinstance(data, dict):
                    return schema_cls.model_validate(data)
            except (json.JSONDecodeError, Exception):
                pass

    raise ValueError(f"Could not parse response into {schema_cls.__name__}")


# ── Pipeline agent factories ────────────────────────────────────────────────


def _create_extraction_agent(model: OpenAIChat) -> Agent:
    """Stage 1: extract structured knowledge points from notes (fast model)."""
    return Agent(
        model=model,
        name="Knowledge Extraction Agent",
        description="Extract structured knowledge points and concepts from a set of notes",
        system_message_role="system",
        instructions="""You are a knowledge extraction specialist. Your task is to scan a user's daily notes and extract structured knowledge points.

## Rules
- Extract 5-15 distinct concepts/knowledge points from the notes
- Concepts should be specific and meaningful (e.g., "牛顿第二定律 F=ma", not just "物理")
- Identify the core topics the user studied
- Report the total number of notes you scanned
- If notes are sparse, still extract whatever concepts you can find
- Respond in the same language as the notes

## Output Format
You MUST respond with a valid JSON object matching this schema:
{
  "concepts": ["concept 1", "concept 2", ...],
  "total_notes_scanned": N
}
Wrap your JSON in ```json ... ``` code block. Do not include any other text outside the code block.""",
    )


def _create_pipeline_summary_agent(model: OpenAIChat) -> Agent:
    """Stage 2: generate a polished summary from extracted knowledge (strong model)."""
    return Agent(
        model=model,
        name="Pipeline Summary Agent",
        description="Generate a polished summary of yesterday's learning based on extracted knowledge",
        system_message_role="system",
        instructions="""You are a learning coach that helps students review yesterday's study progress.

You will receive the extracted knowledge points from Stage 1 of the pipeline. Your task is to:
1. Synthesize the knowledge points into a concise, insightful summary of yesterday's learning (max 300 chars)
2. Pick the single most important note ID as the highlight

## Rules
- Summary should be reflective and motivational, like a coach reviewing yesterday's work
- Highlight the most impactful note — the one that represents the core learning of yesterday
- If the extracted knowledge is sparse or unclear, still produce a helpful summary
- Respond in the same language as the notes
- If no extracted knowledge is provided, indicate that clearly

## Output Format
You MUST respond with a valid JSON object matching this schema:
{
  "summary": "your concise summary here (max 300 chars)",
  "highlight_note_id": N or null
}
Wrap your JSON in ```json ... ``` code block. Do not include any other text.""",
    )


def _create_keyword_mapping_agent(model: OpenAIChat) -> Agent:
    """Stage 3: extract keywords linked to note IDs (fast model)."""
    return Agent(
        model=model,
        name="Keyword Mapping Agent",
        description="Extract keywords from notes and mapped knowledge, linking each to relevant note IDs",
        system_message_role="system",
        instructions="""You are a keyword extraction specialist. You will receive:
1. Extracted knowledge points from Stage 1
2. The daily summary from Stage 2
3. The original notes with their IDs

Your task:
1. Extract 3-7 important keywords/concepts
2. For each keyword, list the note IDs that contain or relate to it

## Rules
- Extract specific, meaningful keywords (not generic words like "study" or "note")
- Each keyword must reference the note IDs it appears in
- Keywords should be useful for future search and retrieval
- Respond in the same language as the notes

## Output Format
You MUST respond with a valid JSON object matching this schema:
{
  "keywords": [
    {"keyword": "keyword1", "note_ids": [1, 2]},
    {"keyword": "keyword2", "note_ids": [3]}
  ]
}
Wrap your JSON in ```json ... ``` code block. Do not include any other text.""",
    )


# ── Three-stage pipeline ────────────────────────────────────────────────────


async def generate_daily_summary_pipeline(
    user_id: int,
    db: AsyncSession,
    target_date: date | None = None,
    operation_id: str | None = None,
) -> dict[str, Any]:
    """Generate a daily learning summary using a three-stage model pipeline.

    Stage 1 (fast model): Extract structured knowledge points from notes.
    Stage 2 (strong model): Generate a polished summary from Stage 1 output.
    Stage 3 (fast model): Extract keywords linked to specific note IDs.

    If any stage fails, falls back to the single-model generate_daily_summary().
    """
    from app.ai.models import get_model_by_tier

    if target_date is None:
        target_date = date.today() - timedelta(days=1)

    # Clean up any stale WebSocket progress events for this operation
    if operation_id is not None:
        manager.cleanup_operation(operation_id)

    # Fetch notes for the target date
    result = await db.execute(
        select(Note)
        .where(
            Note.user_id == user_id,
            func.date(Note.created_at) == target_date,
        )
        .order_by(Note.created_at.desc())
    )
    notes = result.scalars().all()

    if not notes:
        return {
            "summary": f"No notes recorded on {target_date.isoformat()}. Take a moment to jot down something you learned today!",
            "keywords": [],
            "total_notes": 0,
            "highlight_note_id": None,
            "stages": [],
            "is_fallback": True,
        }

    # Build note context for agents
    note_entries = []
    for n in notes:
        note_entries.append(f"[Note #{n.id}] {n.content[:300]}")
    notes_text = "\n\n".join(note_entries)

    # ── Stage 0: Fetching Notes (completed immediately) ──
    t_fetch = time.time()
    fetching_duration_ms = int((time.time() - t_fetch) * 1000)
    stages: list[dict[str, Any]] = [{
        "name": "fetching_notes",
        "status": "completed",
        "duration_ms": fetching_duration_ms,
    }]
    if operation_id is not None:
        await manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,
            stage_data=AiProgressStage(
                stage="fetching_notes",
                status="completed",
                model="system",
                tier="system",
                message=f"Fetched {len(notes)} notes from {target_date.isoformat()}",
                metadata={"note_count": len(notes)},
                duration_ms=fetching_duration_ms,
            ),
        )

    extracted: ExtractedKnowledge | None = None
    summary_result: StructuredSummary | None = None
    keyword_mapping: KeywordMapping | None = None

    try:
        # ── Stage 1: Knowledge Extraction (fast model) ──
        t0 = time.time()
        try:
            fast_model = await get_model_by_tier(user_id, db, "fast")
            if fast_model is None:
                raise RuntimeError("No fast model available")

            # WS: emit extraction in_progress (with resolved model name)
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="extraction",
                        status="in_progress",
                        model=fast_model.id,
                        tier="fast",
                        message=f"🧠 Extracting knowledge using {fast_model.id}...",
                        metadata={"provider": getattr(fast_model, "provider", None)},
                    ),
                )
            agent1 = _create_extraction_agent(fast_model)
            response1 = await asyncio.wait_for(
                agent1.arun(
                    input=f"Date: {target_date.isoformat()}\n\nUser's notes:\n{notes_text}"
                ),
                timeout=60.0,
            )
            extracted = _parse_model_response(response1.content, ExtractedKnowledge)
            extraction_duration_ms = int((time.time() - t0) * 1000)
            stages.append({
                "name": "extraction",
                "status": "completed",
                "duration_ms": extraction_duration_ms,
            })
            # WS: emit extraction completed
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="extraction",
                        status="completed",
                        model=fast_model.id,
                        tier="fast",
                        message=f"Knowledge extraction complete — {len(extracted.concepts) if extracted else 0} concepts found",
                        duration_ms=extraction_duration_ms,
                        progress_pct=100,
                        metadata={"concepts_found": len(extracted.concepts) if extracted else 0},
                    ),
                )
        except Exception as stage_err:
            logger.warning("Pipeline Stage 1 (extraction) failed: %s", stage_err)
            stages.append({
                "name": "extraction",
                "status": "failed",
                "duration_ms": int((time.time() - t0) * 1000),
                "error": str(stage_err),
            })
            raise

        # ── Stage 2: Summary Generation (strong model) ──
        t1 = time.time()
        try:
            strong_model = await get_model_by_tier(user_id, db, "strong")
            if strong_model is None:
                raise RuntimeError("No strong model available")

            # WS: emit summary in_progress (with resolved model name)
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="summary",
                        status="in_progress",
                        model=strong_model.id,
                        tier="strong",
                        message=f"✍️ Generating summary using {strong_model.id}...",
                        metadata={"provider": getattr(strong_model, "provider", None)},
                    ),
                )

            agent2 = _create_pipeline_summary_agent(strong_model)
            concepts_text = "\n".join(f"- {c}" for c in extracted.concepts) if extracted else "(none)"
            response2 = await asyncio.wait_for(
                agent2.arun(
                    input=(
                        f"Date: {target_date.isoformat()}\n\n"
                        f"Extracted knowledge points:\n{concepts_text}\n\n"
                        f"Original notes for reference:\n{notes_text}"
                    )
                ),
                timeout=60.0,
            )
            try:
                summary_result = _parse_model_response(response2.content, StructuredSummary)
            except ValueError:
                # Parsing failed — use raw model output as summary directly
                raw_text = str(response2.content)[:2000] if response2.content else ""
                logger.warning("Pipeline Stage 2 parse failed, using raw text as summary (%d chars)", len(raw_text))
                summary_result = StructuredSummary(summary=raw_text, highlight_note_id=None)
            summary_duration_ms = int((time.time() - t1) * 1000)
            stages.append({
                "name": "summary",
                "status": "completed",
                "duration_ms": summary_duration_ms,
            })
            # WS: emit summary completed
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="summary",
                        status="completed",
                        model=strong_model.id,
                        tier="strong",
                        message=f"Daily summary generated ({len(summary_result.summary) if summary_result else 0} chars)",
                        duration_ms=summary_duration_ms,
                        progress_pct=100,
                    ),
                )
        except Exception as stage_err:
            logger.warning("Pipeline Stage 2 (summary) failed: %s", stage_err)
            stages.append({
                "name": "summary",
                "status": "failed",
                "duration_ms": int((time.time() - t1) * 1000),
                "error": str(stage_err),
            })
            raise

        # ── Stage 3: Keyword Extraction (fast model) ──
        t2 = time.time()
        try:
            fast_model2 = await get_model_by_tier(user_id, db, "fast")
            if fast_model2 is None:
                raise RuntimeError("No fast model available")

            # WS: emit keywords in_progress (with resolved model name)
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="keywords",
                        status="in_progress",
                        model=fast_model2.id,
                        tier="fast",
                        message=f"🏷️ Extracting keywords using {fast_model2.id}...",
                        metadata={"provider": getattr(fast_model2, "provider", None)},
                    ),
                )

            agent3 = _create_keyword_mapping_agent(fast_model2)
            concepts_text3 = "\n".join(f"- {c}" for c in extracted.concepts) if extracted else "(none)"
            response3 = await asyncio.wait_for(
                agent3.arun(
                    input=(
                        f"Date: {target_date.isoformat()}\n\n"
                        f"Extracted knowledge:\n{concepts_text3}\n\n"
                        f"Daily summary:\n{summary_result.summary if summary_result else '(none)'}\n\n"
                        f"Original notes with IDs:\n{notes_text}"
                    )
                ),
                timeout=60.0,
            )
            try:
                keyword_mapping = _parse_model_response(response3.content, KeywordMapping)
            except ValueError:
                # Parsing failed — continue without keywords
                logger.warning("Pipeline Stage 3 parse failed, using empty keywords")
                keyword_mapping = None
            keywords_duration_ms = int((time.time() - t2) * 1000)
            stages.append({
                "name": "keywords",
                "status": "completed" if keyword_mapping else "partial",
                "duration_ms": keywords_duration_ms,
            })
            # WS: emit keywords completed
            if operation_id is not None:
                await manager.broadcast_ai_progress(
                    user_id=user_id,
                    operation_id=operation_id,
                    stage_data=AiProgressStage(
                        stage="keywords",
                        status="completed",
                        model=fast_model2.id,
                        tier="fast",
                        message=f"Keywords extracted — {len(keyword_mapping.keywords) if keyword_mapping else 0} found",
                        duration_ms=keywords_duration_ms,
                        progress_pct=100,
                    ),
                )
        except Exception as stage_err:
            logger.warning("Pipeline Stage 3 (keywords) failed: %s", stage_err)
            stages.append({
                "name": "keywords",
                "status": "failed",
                "duration_ms": int((time.time() - t2) * 1000),
                "error": str(stage_err),
            })
            # Don't raise — keywords are optional, continue with what we have

        return {
            "summary": summary_result.summary if summary_result else "",
            "keywords": [k.model_dump() for k in keyword_mapping.keywords] if keyword_mapping else [],
            "total_notes": len(notes),
            "highlight_note_id": summary_result.highlight_note_id if summary_result else None,
            "stages": stages,
            "is_fallback": False,
        }

    except Exception as e:
        # Fallback to single-model generate_daily_summary
        logger.info("Pipeline failed for user %d, falling back to single-model daily summary. Reason: %s", user_id, e)
        fallback = await generate_daily_summary(target_date, user_id, db)  # type: ignore[arg-type]
        fallback["stages"] = stages
        return fallback
