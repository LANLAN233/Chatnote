"""Intent Router — analyzes user input to determine the best action/skill to dispatch.

When a user types natural language in the console, the intent router uses AI
to classify the intent and automatically route to the appropriate skill or handler.
This removes the need for users to manually prefix inputs with $skill.
"""

import logging
from typing import Any

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class IntentResult(BaseModel):
    intent: str = Field(description="Detected intent: ask, todo, schedule, summarize, search, note_create, unknown")
    skill_name: str | None = Field(description="Best matching skill name, if any", default=None)
    args: str = Field(description="Extracted arguments for the skill/action", default="")
    confidence: float = Field(description="Confidence 0-1", ge=0, le=1, default=0.0)
    reasoning: str = Field(description="Brief reasoning for the classification", default="")


INTENT_ANALYSIS_PROMPT = """You are an Intent Analysis Engine for ChatNote, a Discord-style study notes app.

Your job is to analyze the user's console input and determine the best action to take.

## Available Skills & Commands

1. **ask** — General questions, explanations, problem solving, concept clarification
   - Examples: "什么是梯度下降？", "Explain React hooks", "帮我解这道数学题"
   - Skill: $ask

2. **todo** — Task creation, reminders, action items, deadlines
   - Examples: "明天要交高数作业", "记得复习第三章", "I need to finish the report"
   - Skill: $todo

3. **schedule** — Calendar events, class times, recurring schedules
   - Examples: "明天下午2点高数课", "每周一三五晚上7点健身", "next Wednesday meeting at 3pm"
   - Skill: $schedule

4. **summarize** — Summarization requests, review requests
   - Examples: "总结一下最近的笔记", "给我最近学习内容的摘要", "summarize my recent notes"
   - Skill: $summarize

5. **search** — Searching existing notes
   - Examples: "搜索矩阵相关的笔记", "find my notes about React", "/search 极限"
   - This is handled by /search command, not a skill

6. **note_create** — General note capture without specific intent
   - Examples: "今天学了特征值和特征向量", "React useEffect 的用法", random study notes
   - Default action: save as a note via smart classification

7. **unknown** — Unclear or ambiguous input
   - Examples: "嗯", "???", irrelevant input

## Classification Rules

- If the input contains explicit temporal references (time, date, recurring patterns) AND describes an event/activity → **schedule**
- If the input describes a task, deadline, or something the user needs to do → **todo**
- If the input asks a question, requests explanation, or asks for help → **ask**
- If the input requests summary or review → **summarize**
- If the input starts with / → it is a **command**, route accordingly
- If the input starts with $ → it is an explicit **skill** invocation, respect it
- Otherwise, if it looks like study content → **note_create**

## Output Format
Respond with a JSON object containing:
- intent: the primary intent
- skill_name: the matching skill name (null if not applicable)
- args: the extracted content/arguments for the action
- confidence: 0.0-1.0 confidence score
- reasoning: brief explanation of your decision

## Examples

Input: "明天下午2点要去上高等数学课"
→ {{"intent": "schedule", "skill_name": "schedule", "args": "明天下午2点要去上高等数学课", "confidence": 0.95, "reasoning": "Contains explicit time (下午2点) and describes a class event"}}

Input: "帮我解释一下什么是闭包"
→ {{"intent": "ask", "skill_name": "ask", "args": "帮我解释一下什么是闭包", "confidence": 0.92, "reasoning": "Asks for conceptual explanation"}}

Input: "记得明天交线性代数作业"
→ {{"intent": "todo", "skill_name": "todo", "args": "记得明天交线性代数作业", "confidence": 0.88, "reasoning": "Describes a deadline/task to complete"}}

Input: "总结一下我最近的笔记"
→ {{"intent": "summarize", "skill_name": "summarize", "args": "总结一下我最近的笔记", "confidence": 0.9, "reasoning": "Explicitly requests summarization"}}

Input: "今天学了矩阵的特征值和特征向量"
→ {{"intent": "note_create", "skill_name": null, "args": "今天学了矩阵的特征值和特征向量", "confidence": 0.85, "reasoning": "Study content without specific action intent"}}"""


_skill_registry_cache: list[dict[str, str]] | None = None


def _build_prompt(available_skills: list[dict[str, str]]) -> str:
    skills_text = "\n".join(
        f"- {s['name']}: {s['description']}" for s in available_skills
    )
    return f"{INTENT_ANALYSIS_PROMPT}\n\n## Currently Registered Skills\n{skills_text}"


def create_intent_agent(model: OpenAIChat, available_skills: list[dict[str, str]]) -> Agent:
    return Agent(
        model=model,
        name="Intent Analyzer",
        description="Analyze user input intent and route to appropriate skill",
        system_message_role="system",
        instructions=_build_prompt(available_skills),
        output_schema=IntentResult,
        structured_outputs=True,
    )


async def analyze_intent(
    text: str,
    model: OpenAIChat,
    available_skills: list[dict[str, str]],
    threshold: float = 0.7,
) -> IntentResult:
    """Analyze user input and return the best matching intent.

    If confidence is below threshold, returns 'unknown' intent.
    """
    try:
        agent = create_intent_agent(model, available_skills)
        response = await agent.arun(input=f"Analyze this input:\n{text}")
        result = response.content
        if not isinstance(result, IntentResult):
            result = IntentResult.model_validate(result)

        if result.confidence < threshold:
            result.intent = "unknown"
            result.skill_name = None

        logger.info(
            "Intent analyzed: intent=%s skill=%s confidence=%.2f",
            result.intent, result.skill_name, result.confidence,
        )
        return result
    except Exception as e:
        logger.warning("Intent analysis failed: %s, returning unknown", e)
        return IntentResult(
            intent="unknown",
            skill_name=None,
            args=text,
            confidence=0.0,
            reasoning=f"Analysis failed: {e}",
        )
