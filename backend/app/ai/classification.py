import logging
from typing import Any

from agno.agent import Agent
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


def create_classifier_agent(model: OpenAIChat) -> Agent:
    return Agent(
        model=model,
        name="Note Classifier",
        description="Analyze note content and classify into server/channel hierarchy",
        system_message_role="system",
        instructions="""You are a study note classification assistant. Analyze the user's note content and determine which subject (Server) and topic (Channel) it belongs to.

- If the user already has matching servers/channels, use the existing ones
- If existing categories are insufficient, suggest creating new ones
- Extract 3-5 keyword tags
- Generate a brief summary (max 100 characters)
- Mark low-confidence classifications (below 0.6) so the user can confirm
- Always provide reasonable suggestions, never return empty values""",
        output_schema=ClassificationResult,
        structured_outputs=True,
    )


async def classify_note(
    content: str,
    db: AsyncSession,
    user_id: int,
    model: OpenAIChat | None = None,
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
