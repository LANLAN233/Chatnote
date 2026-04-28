import json
import logging
from datetime import date
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
        response = await agent.arun(
            input=f"Date: {target_date.isoformat()}\n\nUser's notes:\n{notes_text}"
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
