import logging
from typing import Any

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult

logger = logging.getLogger(__name__)


class SkillRegistry:
    def __init__(self):
        self._skills: dict[str, BaseSkill] = {}

    def register(self, skill: BaseSkill):
        self._skills[skill.name] = skill
        logger.info("Registered skill: $%s", skill.name)

    def get(self, name: str) -> BaseSkill | None:
        return self._skills.get(name)

    def list_skills(self) -> list[dict[str, str]]:
        return [
            {"name": s.name, "description": s.description}
            for s in self._skills.values()
        ]

    def get_skill_names(self) -> list[str]:
        return list(self._skills.keys())

    async def dispatch(
        self, name: str, args: str, context: SkillContext
    ) -> SkillResult:
        skill = self.get(name)
        if skill is None:
            return SkillResult(
                type="error",
                content=f"Unknown skill: ${name}. Try $ask, $summarize, $math, $todo, $schedule.",
            )
        try:
            return await skill.execute(args, context)
        except Exception as e:
            logger.error("Skill $%s failed: %s", name, e)
            return SkillResult(type="error", content=f"Skill ${name} failed: {str(e)}")


skill_registry = SkillRegistry()
