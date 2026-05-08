from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TYPE_CHECKING

from agno.models.openai import OpenAIChat
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    from app.services.websocket import ConnectionManager


@dataclass
class SkillContext:
    user_id: int
    db: AsyncSession
    model: OpenAIChat
    server_context: dict[str, Any] | None = None
    file_refs: list[str] = field(default_factory=list)
    loaded_notes: list[str] | None = None
    ws_manager: ConnectionManager | None = None
    operation_id: str | None = None


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
