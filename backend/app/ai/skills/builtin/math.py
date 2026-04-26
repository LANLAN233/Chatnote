from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.plugins import plugin_manager


class MathSkill(BaseSkill):
    name = "math"
    description = "数学表达式计算"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        if not args.strip():
            return SkillResult(type="output", content="$math: Usage: $math 2 + 3 * 4")

        responses = await plugin_manager.dispatch_command(
            "calc", args.split(), {"user_id": context.user_id}
        )
        if responses:
            return SkillResult(
                type="plugin_response",
                content=responses[0].get("message", ""),
                data={"plugin_responses": responses},
            )
        return SkillResult(type="output", content=f"$math: {args} = ?")
