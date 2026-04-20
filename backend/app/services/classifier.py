import json
import logging
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Channel, Server
from app.services.llm import get_llm_provider

logger = logging.getLogger(__name__)

CLASSIFICATION_SYSTEM_PROMPT = """你是一个笔记分类助手。用户会给你一段笔记内容，你需要：
1. 分析笔记所属的学科/主题领域
2. 建议归入的伺服器(Server)名称和频道(Channel)名称
3. 提取关键词标签(不超过5个)
4. 生成简短摘要(不超过50字)

用户已有的伺服器和频道：
{existing_structure}

请严格按以下JSON格式返回，不要包含任何其他文字：
{{
    "suggested_server": "伺服器名称",
    "suggested_channel": "频道名称",
    "confidence": 0.0到1.0的置信度,
    "tags": ["标签1", "标签2"],
    "summary": "简短摘要",
    "is_new_server": true或false,
    "is_new_channel": true或false
}}"""


async def _get_existing_structure(db: AsyncSession, user_id: int) -> str:
    result = await db.execute(
        select(Server).where(Server.user_id == user_id).order_by(Server.sort_order)
    )
    servers = result.scalars().all()
    if not servers:
        return "（暂无伺服器和频道）"

    lines = []
    for s in servers:
        ch_result = await db.execute(select(Channel).where(Channel.server_id == s.id).order_by(Channel.sort_order))
        channels = ch_result.scalars().all()
        ch_names = ", ".join(c.name for c in channels) if channels else "（无频道）"
        lines.append(f"- 伺服器「{s.name}」: 频道 [{ch_names}]")
    return "\n".join(lines)


def _parse_json_response(text: str) -> dict:
    json_match = re.search(r"\{[\s\S]*\}", text)
    if json_match:
        try:
            return json.loads(json_match.group())
        except json.JSONDecodeError:
            pass

    return {
        "suggested_server": "General",
        "suggested_channel": "Notes",
        "confidence": 0.3,
        "tags": [],
        "summary": "",
        "is_new_server": True,
        "is_new_channel": True,
    }


async def classify_note(
    content: str,
    db: AsyncSession,
    user_id: int,
    llm_provider: str | None = None,
    api_key: str | None = None,
) -> dict:
    structure = await _get_existing_structure(db, user_id)
    system_prompt = CLASSIFICATION_SYSTEM_PROMPT.format(existing_structure=structure)

    provider = get_llm_provider(llm_provider, api_key)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"请分类以下笔记：\n\n{content}"},
    ]

    try:
        response = await provider.chat(messages)
        result = _parse_json_response(response)
    except Exception as e:
        logger.warning(f"LLM classification failed: {e}, using fallback")
        result = {
            "suggested_server": "General",
            "suggested_channel": "Notes",
            "confidence": 0.3,
            "tags": [],
            "summary": content[:50],
            "is_new_server": True,
            "is_new_channel": True,
        }

    return result


async def resolve_classification(
    classification: dict,
    db: AsyncSession,
    user_id: int,
) -> dict:
    server_name = classification.get("suggested_server", "General")
    channel_name = classification.get("suggested_channel", "Notes")

    result = await db.execute(select(Server).where(Server.name == server_name, Server.user_id == user_id))
    server = result.scalar_one_or_none()

    if not server:
        server = Server(user_id=user_id, name=server_name)
        db.add(server)
        await db.flush()
        await db.refresh(server)
        classification["is_new_server"] = True

    ch_result = await db.execute(select(Channel).where(Channel.server_id == server.id, Channel.name == channel_name))
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
