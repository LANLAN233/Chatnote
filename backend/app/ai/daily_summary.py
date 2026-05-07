import asyncio
import json
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
    """Stage 2 output: a polished daily learning summary."""

    summary: str = Field(description="A concise, insightful summary of the day's learning (max 300 chars)")
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
        name="Daily Summary Agent",
        description="Generate a daily learning summary from a user's notes",
        system_message_role="system",
        instructions="""You are a learning coach that helps students review their daily study progress.

Your task is to analyze the user's notes from a single day and generate:
1. A concise, insightful summary highlighting the key learning themes
2. 3-7 important keywords/concepts, each linked to the most relevant note IDs

## Rules
- Summary should be engaging and motivational, like a coach's feedback
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
        }

    # Build context for the agent
    note_entries = []
    for n in notes:
        note_entries.append(f"[Note #{n.id}] {n.content[:300]}")
    notes_text = "\n\n".join(note_entries)

    if model is None:
        model = await get_model_for_user(user_id, db)

    if model is None:
        # Fallback without LLM
        return {
            "summary": f"You recorded {len(notes)} notes on {target_date.isoformat()}. Keep up the good work!",
            "keywords": [],
            "total_notes": len(notes),
            "highlight_note_id": notes[0].id if notes else None,
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
        if not isinstance(result, DailySummaryResult):
            result = DailySummaryResult.model_validate(result)

        return {
            "summary": result.summary,
            "keywords": [k.model_dump() for k in result.keywords],
            "total_notes": result.total_notes,
            "highlight_note_id": result.highlight_note_id,
        }
    except Exception as e:
        logger.warning("Daily summary generation failed: %s, using fallback", e)
        return {
            "summary": f"You recorded {len(notes)} notes on {target_date.isoformat()}. Keep up the good work!",
            "keywords": [],
            "total_notes": len(notes),
            "highlight_note_id": notes[0].id if notes else None,
        }


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
- Respond in the same language as the notes""",
        output_schema=ExtractedKnowledge,
        structured_outputs=True,
    )


def _create_pipeline_summary_agent(model: OpenAIChat) -> Agent:
    """Stage 2: generate a polished summary from extracted knowledge (strong model)."""
    return Agent(
        model=model,
        name="Pipeline Summary Agent",
        description="Generate a polished daily learning summary based on extracted knowledge",
        system_message_role="system",
        instructions="""You are a learning coach that helps students review their daily study progress.

You will receive the extracted knowledge points from Stage 1 of the pipeline. Your task is to:
1. Synthesize the knowledge points into a concise, insightful daily summary (max 300 chars)
2. Pick the single most important note ID as the highlight

## Rules
- Summary should be engaging and motivational, like a coach's feedback
- Highlight the most impactful note — the one that represents the core learning of the day
- If the extracted knowledge is sparse or unclear, still produce a helpful summary
- Respond in the same language as the notes
- If no extracted knowledge is provided, indicate that clearly""",
        output_schema=StructuredSummary,
        structured_outputs=True,
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
- Respond in the same language as the notes""",
        output_schema=KeywordMapping,
        structured_outputs=True,
    )


# ── Three-stage pipeline ────────────────────────────────────────────────────


async def generate_daily_summary_pipeline(
    user_id: int,
    db: AsyncSession,
    target_date: date | None = None,
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
        }

    # Build note context for agents
    note_entries = []
    for n in notes:
        note_entries.append(f"[Note #{n.id}] {n.content[:300]}")
    notes_text = "\n\n".join(note_entries)

    stages: list[dict[str, Any]] = []
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

            agent1 = _create_extraction_agent(fast_model)
            response1 = await asyncio.wait_for(
                agent1.arun(
                    input=f"Date: {target_date.isoformat()}\n\nUser's notes:\n{notes_text}"
                ),
                timeout=60.0,
            )
            raw1 = response1.content
            if not isinstance(raw1, ExtractedKnowledge):
                raw1 = ExtractedKnowledge.model_validate(raw1)
            extracted = raw1
            stages.append({
                "name": "extraction",
                "status": "completed",
                "duration_ms": int((time.time() - t0) * 1000),
            })
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
            raw2 = response2.content
            if not isinstance(raw2, StructuredSummary):
                raw2 = StructuredSummary.model_validate(raw2)
            summary_result = raw2
            stages.append({
                "name": "summary",
                "status": "completed",
                "duration_ms": int((time.time() - t1) * 1000),
            })
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
            raw3 = response3.content
            if not isinstance(raw3, KeywordMapping):
                raw3 = KeywordMapping.model_validate(raw3)
            keyword_mapping = raw3
            stages.append({
                "name": "keywords",
                "status": "completed",
                "duration_ms": int((time.time() - t2) * 1000),
            })
        except Exception as stage_err:
            logger.warning("Pipeline Stage 3 (keywords) failed: %s", stage_err)
            stages.append({
                "name": "keywords",
                "status": "failed",
                "duration_ms": int((time.time() - t2) * 1000),
                "error": str(stage_err),
            })
            raise

        return {
            "summary": summary_result.summary if summary_result else "",
            "keywords": [k.model_dump() for k in keyword_mapping.keywords] if keyword_mapping else [],
            "total_notes": len(notes),
            "highlight_note_id": summary_result.highlight_note_id if summary_result else None,
            "stages": stages,
        }

    except Exception:
        # Fallback to single-model generate_daily_summary
        logger.info("Pipeline failed, falling back to single-model daily summary")
        fallback = await generate_daily_summary(target_date, user_id, db)  # type: ignore[arg-type]
        fallback["stages"] = stages
        return fallback
