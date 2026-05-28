import logging
import time
from typing import Any

from agno.agent import Agent
from agno.models.deepseek import DeepSeek
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Server

logger = logging.getLogger(__name__)


class ClassificationResult(BaseModel):
    suggested_server: str = Field(description="Suggested server name")
    suggested_channel: str = Field(description="Suggested channel name")
    confidence: float = Field(description="Confidence score 0-1", ge=0, le=1)
    tags: list[str] = Field(description="Keyword tags (3-5 items)", default_factory=list)
    summary: str = Field(description="Brief summary, max 100 chars")
    is_new_server: bool = Field(description="Whether a new server should be created")
    is_new_channel: bool = Field(description="Whether a new channel should be created")


class EnsembleResult(BaseModel):
    """Extended classification result with ensemble metadata.

    Used by the two-stage classification pipeline (fast → strong models).
    """
    suggested_server: str
    suggested_channel: str
    confidence: float
    tags: list[str] = Field(default_factory=list)
    summary: str
    is_new_server: bool
    is_new_channel: bool
    ai_reviewed: bool = Field(default=False, description="Whether strong model reviewed this")
    ensemble_consistency: str | None = Field(
        default=None, description="一致/不一致/None"
    )
    fast_confidence: float = Field(default=0.0, description="Fast model confidence")
    strong_confidence: float | None = Field(
        default=None, description="Strong model confidence"
    )


async def _get_existing_structure(db: AsyncSession, user_id: int) -> str:
    result = await db.execute(
        select(Server).where(Server.user_id == user_id).order_by(Server.sort_order)
    )
    servers = result.scalars().all()
    if not servers:
        return "(No servers or channels yet)"

    lines = []
    for s in servers:
        ch_result = await db.execute(
            select(Channel).where(Channel.server_id == s.id).order_by(Channel.sort_order)
        )
        channels = ch_result.scalars().all()
        ch_names = ", ".join(c.name for c in channels) if channels else "(no channels)"
        lines.append(f"- Server [{s.name}]: channels [{ch_names}]")
    return "\n".join(lines)


def create_classifier_agent(model: OpenAIChat | DeepSeek) -> Agent:
    return Agent(
        model=model,
        name="Note Classifier",
        description="Analyze note content and classify into server/channel hierarchy",
        system_message_role="system",
        instructions="""You are an expert study note librarian and knowledge organizer for ChatNote, a Discord-style study notes app.

Your task is to analyze the user's note content and intelligently classify it into the optimal Server (subject/domain) and Channel (topic/sub-topic) hierarchy.

## Classification Strategy

1. **Analyze Content Deeply**
   - Identify the core subject, key concepts, and learning context
   - Detect implicit subjects even when not explicitly stated
   - Consider academic level (undergraduate, graduate, etc.)

2. **Leverage Existing Structure**
   - ALWAYS check the user's existing servers and channels first
   - If a suitable match exists (even partial), prefer reusing it
   - Use fuzzy matching: "Linear Algebra" and "线性代数" are the same subject
   - Map related topics to existing channels when appropriate

3. **Create New Categories When Needed**
   - Create a new server only when no existing server is even loosely related
   - Create a new channel when the topic is genuinely distinct
   - Use clear, concise names (prefer Chinese for Chinese content)
   - Avoid overly broad names like "Other" or "Misc"

4. **Extract Rich Metadata**
   - Generate 3-5 specific keyword tags (mix of Chinese and English as appropriate)
   - Tags should be searchable and meaningful (e.g., "梯度下降", "反向传播", "神经网络")
   - Write a concise 1-sentence summary capturing the essence
   - Summary should help the user quickly recall the note's content

5. **Confidence Assessment**
   - High (0.8-1.0): Clear subject, explicit keywords, strong match with existing structure
   - Medium (0.6-0.8): Some ambiguity but reasonable inference possible
   - Low (0.3-0.6): Vague content, multiple plausible categories, or novel topic
   - Very Low (<0.3): Insufficient content to classify meaningfully

## Examples

Input: "今天学了矩阵的特征值和特征向量，还有对角化"
→ Server: "线性代数", Channel: "特征值与特征向量", Tags: ["特征值", "特征向量", "矩阵对角化", "eigenvalue", "eigenvector"]

Input: "React useEffect 的依赖数组什么时候要加 cleanup 函数？"
→ Server: "前端开发", Channel: "React Hooks", Tags: ["React", "useEffect", "cleanup", "依赖数组", "副作用"]

Input: "明天下午3点要交实验报告"
→ Server: "实验课程", Channel: "实验报告", Tags: ["实验", "deadline", "待办"], Confidence: 0.5

## Rules
- NEVER return empty values for any field
- Server and Channel names should be concise (2-10 characters ideally)
- When in doubt between two categories, pick the more specific one
- Consider temporal context: notes near exam periods may relate to review""",
        output_schema=ClassificationResult,
        structured_outputs=True,
    )


async def classify_note(
    content: str,
    db: AsyncSession,
    user_id: int,
    model: OpenAIChat | DeepSeek | None = None,
) -> dict[str, Any]:
    """Classify a note using an Agno Agent with structured output.

    Falls back to a safe default on any failure or when no model is available.
    """
    structure = await _get_existing_structure(db, user_id)

    # If no model provided, try to get one from DB
    if model is None:
        from app.ai.models import get_model_for_user
        model = await get_model_for_user(user_id, db)

    # No model available → deterministic fallback
    if model is None:
        return {
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.3,
            "tags": [],
            "summary": content[:100],
            "is_new_server": True,
            "is_new_channel": True,
        }

    try:
        agent = create_classifier_agent(model)
        response = await agent.arun(
            input=f"User's existing servers and channels:\n{structure}\n\nClassify this note:\n{content}"
        )

        result = response.content
        if not isinstance(result, ClassificationResult):
            result = ClassificationResult.model_validate(result)

        return result.model_dump()
    except Exception as e:
        logger.warning("Classification failed: %s, using fallback", e)
        return {
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.3,
            "tags": [],
            "summary": content[:100],
            "is_new_server": True,
            "is_new_channel": True,
        }


async def classify_note_ensemble(
    content: str,
    db: AsyncSession,
    user_id: int,
    operation_id: str | None = None,
) -> dict[str, Any]:
    """Two-stage classification pipeline using fast/strong model tiers.

    Stage 1 (fast model): runs first-tier classification.
    - If confidence >= 0.85, returns immediately with ai_reviewed=False.
    - If confidence < 0.85, proceeds to Stage 2.

    Stage 2 (strong model): runs second-tier classification.
    - Compares fast vs strong results for server+channel match.
    - 一致: bumps confidence, returns with consensus.
    - 不一致: uses strong model result, appends "建议人工确认" to summary.

    Falls back to single-model classify_note() when ANY agent fails
    (model=None or exception).

    When *operation_id* is provided, emits WebSocket progress events
    so the frontend can show real-time pipeline status.
    """
    from app.ai.models import get_model_by_tier
    from app.schemas.ai_progress import AiProgressStage
    from app.services.websocket import manager as ws_manager

    _emit = operation_id is not None

    # --- Stage 1: Fast model ---
    t_fast_start = time.time()

    try:
        fast_model = await get_model_by_tier(user_id, db, "fast")
    except Exception as exc:
        logger.warning(
            "Failed to get fast model: %s, falling back to single-model", exc
        )
        return await classify_note(content, db, user_id)

    if fast_model is None:
        return await classify_note(content, db, user_id)

    fast_model_id = getattr(fast_model, "id", "unknown")

    if _emit:
        await ws_manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,  # type: ignore[arg-type]
            stage_data=AiProgressStage(
                stage="fast_classification",
                status="in_progress",
                model=fast_model_id,
                tier="fast",
                message="Classifying with fast model...",
            ),
        )

    try:
        fast_agent = create_classifier_agent(fast_model)
        structure = await _get_existing_structure(db, user_id)
        fast_response = await fast_agent.arun(
            input=f"User's existing servers and channels:\n{structure}\n\n"
            f"Classify this note:\n{content}"
        )
        fast_result = fast_response.content
        if not isinstance(fast_result, ClassificationResult):
            fast_result = ClassificationResult.model_validate(fast_result)
        fast_dict = fast_result.model_dump()
    except Exception as exc:
        logger.warning(
            "Fast classification failed: %s, falling back to single-model", exc
        )
        if _emit:
            await ws_manager.broadcast_ai_progress(
                user_id=user_id,
                operation_id=operation_id,  # type: ignore[arg-type]
                stage_data=AiProgressStage(
                    stage="fast_classification",
                    status="failed",
                    model=fast_model_id,
                    tier="fast",
                    message=f"Fast classification failed: {exc}",
                    duration_ms=int((time.time() - t_fast_start) * 1000),
                ),
            )
        return await classify_note(content, db, user_id)

    fast_duration_ms = int((time.time() - t_fast_start) * 1000)
    fast_confidence = float(fast_dict.get("confidence", 0.0))

    if _emit:
        await ws_manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,  # type: ignore[arg-type]
            stage_data=AiProgressStage(
                stage="fast_classification",
                status="completed",
                model=fast_model_id,
                tier="fast",
                message="Fast classification complete",
                metadata={
                    "confidence": fast_confidence,
                    "server": str(fast_dict.get("suggested_server", "")),
                    "channel": str(fast_dict.get("suggested_channel", "")),
                },
                duration_ms=fast_duration_ms,
            ),
        )

    # High confidence → return immediately
    if fast_confidence >= 0.85:
        if _emit:
            await ws_manager.broadcast_ai_progress(
                user_id=user_id,
                operation_id=operation_id,  # type: ignore[arg-type]
                stage_data=AiProgressStage(
                    stage="classification_complete",
                    status="completed",
                    model=fast_model_id,
                    tier="fast",
                    message="Classification complete",
                ),
            )
        return {
            **fast_dict,
            "ai_reviewed": False,
            "ensemble_consistency": None,
            "fast_confidence": fast_confidence,
            "strong_confidence": None,
        }

    # --- Stage 2: Strong model ---
    t_strong_start = time.time()

    try:
        strong_model = await get_model_by_tier(user_id, db, "strong")
    except Exception as exc:
        logger.warning(
            "Failed to get strong model: %s, using fast result", exc
        )
        return {
            **fast_dict,
            "ai_reviewed": True,
            "ensemble_consistency": None,
            "fast_confidence": fast_confidence,
            "strong_confidence": None,
        }

    if strong_model is None:
        return {
            **fast_dict,
            "ai_reviewed": True,
            "ensemble_consistency": None,
            "fast_confidence": fast_confidence,
            "strong_confidence": None,
        }

    strong_model_id = getattr(strong_model, "id", "unknown")

    if _emit:
        await ws_manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,  # type: ignore[arg-type]
            stage_data=AiProgressStage(
                stage="strong_review",
                status="in_progress",
                model=strong_model_id,
                tier="strong",
                message="Low confidence, reviewing with strong model...",
            ),
        )

    try:
        strong_agent = create_classifier_agent(strong_model)
        strong_response = await strong_agent.arun(
            input=f"User's existing servers and channels:\n{structure}\n\n"
            f"Classify this note:\n{content}"
        )
        strong_result = strong_response.content
        if not isinstance(strong_result, ClassificationResult):
            strong_result = ClassificationResult.model_validate(strong_result)
        strong_dict = strong_result.model_dump()
    except Exception as exc:
        logger.warning(
            "Strong classification failed: %s, using fast result", exc
        )
        if _emit:
            await ws_manager.broadcast_ai_progress(
                user_id=user_id,
                operation_id=operation_id,  # type: ignore[arg-type]
                stage_data=AiProgressStage(
                    stage="strong_review",
                    status="failed",
                    model=strong_model_id,
                    tier="strong",
                    message=f"Strong review failed: {exc}",
                    duration_ms=int((time.time() - t_strong_start) * 1000),
                ),
            )
        return {
            **fast_dict,
            "ai_reviewed": True,
            "ensemble_consistency": None,
            "fast_confidence": fast_confidence,
            "strong_confidence": None,
        }

    strong_duration_ms = int((time.time() - t_strong_start) * 1000)
    strong_confidence = float(strong_dict.get("confidence", 0.0))

    # Compare fast vs strong
    fast_server = str(fast_dict.get("suggested_server", ""))
    fast_channel = str(fast_dict.get("suggested_channel", ""))
    strong_server = str(strong_dict.get("suggested_server", ""))
    strong_channel = str(strong_dict.get("suggested_channel", ""))

    if fast_server == strong_server and fast_channel == strong_channel:
        # Consensus
        final = dict(strong_dict)
        final["confidence"] = max(fast_confidence, strong_confidence)
        final["ensemble_consistency"] = "一致"
        final["ai_reviewed"] = True
        final["fast_confidence"] = fast_confidence
        final["strong_confidence"] = strong_confidence
    else:
        # Disagreement → trust strong model, add manual-review hint
        final = dict(strong_dict)
        final["ensemble_consistency"] = "不一致"
        final["ai_reviewed"] = True
        final["fast_confidence"] = fast_confidence
        final["strong_confidence"] = strong_confidence
        existing = str(final.get("summary", ""))
        if "建议人工确认" not in existing:
            final["summary"] = (
                f"{existing} [建议人工确认]" if existing else "建议人工确认"
            )

    if _emit:
        await ws_manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,  # type: ignore[arg-type]
            stage_data=AiProgressStage(
                stage="strong_review",
                status="completed",
                model=strong_model_id,
                tier="strong",
                message="Strong review complete",
                metadata={
                    "confidence": strong_confidence,
                    "consistency": str(final.get("ensemble_consistency", "")),
                },
                duration_ms=strong_duration_ms,
            ),
        )

    if _emit:
        await ws_manager.broadcast_ai_progress(
            user_id=user_id,
            operation_id=operation_id,  # type: ignore[arg-type]
            stage_data=AiProgressStage(
                stage="classification_complete",
                status="completed",
                model=strong_model_id,
                tier="strong",
                message="Classification complete",
            ),
        )

    return final


async def resolve_classification(
    classification: dict,
    db: AsyncSession,
    user_id: int,
) -> dict:
    """Resolve or create server/channel based on classification result."""
    server_name = classification.get("suggested_server", "General")
    channel_name = classification.get("suggested_channel", "Notes")

    result = await db.execute(
        select(Server).where(Server.name == server_name, Server.user_id == user_id)
    )
    server = result.scalar_one_or_none()

    if not server:
        server = Server(user_id=user_id, name=server_name)
        db.add(server)
        await db.flush()
        await db.refresh(server)
        classification["is_new_server"] = True

    ch_result = await db.execute(
        select(Channel).where(Channel.server_id == server.id, Channel.name == channel_name)
    )
    channel = ch_result.scalar_one_or_none()

    if not channel:
        channel = Channel(server_id=server.id, name=channel_name)
        db.add(channel)
        await db.flush()
        await db.refresh(channel)
        classification["is_new_channel"] = True

    classification["server_id"] = server.id
    classification["channel_id"] = channel.id
    return classification


async def _semantic_tag_suggestion(note_content: str, db: AsyncSession) -> list[str]:
    """Use embedding similarity to suggest tags based on existing notes.

    Optional enhancement. Currently returns an empty list — the placeholder
    is available for future integration with the two-model ensemble pipeline.
    """
    return []
