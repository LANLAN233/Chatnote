"""Session Title Generator — auto-generates concise titles for new console sessions.

Uses fast-tier LLM to produce a 3-6 word title from the first user message.
Falls back to first 20 characters of the message on failure.
"""

import asyncio
import logging

from agno.agent import Agent
from agno.models.openai import OpenAIChat

logger = logging.getLogger(__name__)

TITLE_PROMPT = (
    "Generate a concise 3-6 word title for this conversation. "
    "Output ONLY the title, nothing else."
)

MAX_TITLE_LENGTH = 50
FALLBACK_CHAR_LIMIT = 20
TITLE_TIMEOUT = 15.0


async def generate_session_title(
    user_message: str,
    model: OpenAIChat,
) -> str:
    """Generate a concise session title using a fast-tier LLM.

    Args:
        user_message: The first user message in the session.
        model: An Agno OpenAIChat instance (fast tier).

    Returns:
        A 3-6 word title string, or first 20 chars of user_message on failure.
    """
    try:
        agent = Agent(
            model=model,
            name="Session Titler",
            description="Generate concise session titles",
        )
        response = await asyncio.wait_for(
            agent.arun(input=f"{TITLE_PROMPT}\n\nConversation starts with: {user_message[:500]}"),
            timeout=TITLE_TIMEOUT,
        )
        title = response.content.strip()

        # Clean up quotes and limit length
        title = title.strip('"').strip("'").strip()
        if len(title) > MAX_TITLE_LENGTH:
            title = title[:MAX_TITLE_LENGTH]

        return title if title else user_message[:FALLBACK_CHAR_LIMIT]
    except Exception as e:
        logger.warning("Session title generation failed: %s", e)
        fallback = user_message[:FALLBACK_CHAR_LIMIT].strip()
        return fallback if fallback else "New Session"
