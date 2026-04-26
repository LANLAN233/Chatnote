from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.ai.skills.registry import skill_registry

# Import built-in skills to trigger registration
from app.ai.skills.builtin.ask import AskSkill
from app.ai.skills.builtin.summarize import SummarizeSkill
from app.ai.skills.builtin.math import MathSkill
from app.ai.skills.builtin.todo_skill import TodoSkill, ScheduleSkill

skill_registry.register(AskSkill())
skill_registry.register(SummarizeSkill())
skill_registry.register(MathSkill())
skill_registry.register(TodoSkill())
skill_registry.register(ScheduleSkill())

__all__ = ["skill_registry", "SkillContext", "SkillResult", "BaseSkill"]
