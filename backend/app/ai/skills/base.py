from dataclasses import dataclass, field
from typing import Any

from agno.models.openai import OpenAIChat
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class SkillContext:
    user_id: int
    db: AsyncSession
    model: OpenAIChat
    server_context: dict[str, Any] | None = None
    file_refs: list[str] = field(default_factory=list)
    loaded_notes: list[str] | None = None


@dataclass
class SkillResult:
    type: str  # "output" | "error" | "plugin_response"
    content: str
    data: dict[str, Any] | None = None


class BaseSkill:
    name: str = ""
    description: str = ""

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        raise NotImplementedError
