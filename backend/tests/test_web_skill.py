"""Tests for the $web Skill — URL fetching and web search."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.skills import skill_registry
from app.ai.skills.base import SkillContext
from app.ai.skills.builtin.web import WebSkill


# ---------------------------------------------------------------------------
# Mock helpers
# ---------------------------------------------------------------------------

def _make_mock_model() -> MagicMock:
    """Create a mock OpenAIChat-compatible object."""
    return MagicMock()


def _make_mock_agent_response(content: str) -> MagicMock:
    """Create a mock Agno agent response with .content attribute."""
    resp = MagicMock()
    resp.content = content
    return resp


def _make_skill_context(db: AsyncSession) -> SkillContext:
    """Create a SkillContext for testing."""
    return SkillContext(
        user_id=1,
        db=db,
        model=_make_mock_model(),
        server_context=None,
    )


# ---------------------------------------------------------------------------
# Test: empty args → error
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_skill_empty_args(db_session: AsyncSession):
    """Returns error when no URL or query is provided."""
    skill = WebSkill()
    ctx = _make_skill_context(db_session)

    result = await skill.execute("   ", ctx)
    assert result.type == "error"
    assert "URL or search query" in result.content


# ---------------------------------------------------------------------------
# Test: URL fetch mode — mocked Agent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_skill_url_fetch_mocked(db_session: AsyncSession):
    """URL mode: fetches and extracts content, returns web_result."""
    skill = WebSkill()
    ctx = _make_skill_context(db_session)

    json_response = (
        '{"title": "Test Page",'
        ' "content": "This is the extracted content from the page.",'
        ' "url": "https://example.com"}'
    )
    agent_resp = _make_mock_agent_response(json_response)

    with patch(
        "app.ai.skills.builtin.web.Agent",
        return_value=_make_mock_agent(agent_resp),
    ):
        result = await skill.execute("https://example.com", ctx)

    assert result.type == "web_result"
    assert "Test Page" in result.content
    assert "extracted content" in result.content
    assert result.data is not None
    assert result.data["title"] == "Test Page"
    assert result.data["content"] == "This is the extracted content from the page."
    assert result.data["url"] == "https://example.com"
    assert result.data["metadata"]["mode"] == "fetch"


# ---------------------------------------------------------------------------
# Test: web search mode — mocked Agent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_skill_search_mocked(db_session: AsyncSession):
    """Search mode: searches web and returns web_result with key results."""
    skill = WebSkill()
    ctx = _make_skill_context(db_session)

    json_response = (
        '{"title": "Search: Python asyncio",'
        ' "content": "Python asyncio is a library to write concurrent code...",'
        ' "url": "",'
        ' "metadata": {"results": ['
        '   {"title": "asyncio docs", "url": "https://docs.python.org/3/library/asyncio.html", "snippet": "Official docs"},'
        '   {"title": "Real Python", "url": "https://realpython.com/async-io-python/", "snippet": "Tutorial"}'
        ' ]}}'
    )
    agent_resp = _make_mock_agent_response(json_response)

    with patch(
        "app.ai.skills.builtin.web.Agent",
        return_value=_make_mock_agent(agent_resp),
    ):
        result = await skill.execute("Python asyncio tutorial", ctx)

    assert result.type == "web_result"
    assert "Python asyncio" in result.content
    assert result.data is not None
    assert result.data["metadata"]["mode"] == "search"
    assert len(result.data["metadata"]["results"]) == 2


# ---------------------------------------------------------------------------
# Test: invalid URL — graceful error handling
# (Agent raises an exception)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_skill_agent_error(db_session: AsyncSession):
    """Error from Agent is caught and returned as error SkillResult."""
    skill = WebSkill()
    ctx = _make_skill_context(db_session)

    with patch(
        "app.ai.skills.builtin.web.Agent",
        side_effect=RuntimeError("Connection timed out"),
    ):
        result = await skill.execute("https://broken.example", ctx)

    assert result.type == "error"
    assert "URL fetch failed" in result.content.lower() or "failed" in result.content.lower()
    assert "Connection timed out" in result.content or "timed out" in result.content


# ---------------------------------------------------------------------------
# Test: registration — web skill is registered in skill_registry
# ---------------------------------------------------------------------------

def test_web_skill_registration():
    """WebSkill is registered and retrievable from skill_registry."""
    web_skill = skill_registry.get("web")
    assert web_skill is not None
    assert web_skill.name == "web"
    assert isinstance(web_skill, WebSkill)
    assert "web" in skill_registry.get_skill_names()


# ---------------------------------------------------------------------------
# Test: fetch mode with non-JSON agent response (fallback to error)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_web_skill_url_fetch_non_json_response(db_session: AsyncSession):
    """When agent returns non-JSON, falls back to error result."""
    skill = WebSkill()
    ctx = _make_skill_context(db_session)

    # Agent returns plain text, not JSON
    agent_resp = _make_mock_agent_response(
        "Here is the content of the page but not in JSON format."
    )

    with patch(
        "app.ai.skills.builtin.web.Agent",
        return_value=_make_mock_agent(agent_resp),
    ):
        result = await skill.execute("https://example.com", ctx)

    assert result.type == "error"
    assert "parse" in result.content.lower() or "example.com" in result.content


# ---------------------------------------------------------------------------
# Helper: create mock Agent
# ---------------------------------------------------------------------------

def _make_mock_agent(response: MagicMock) -> MagicMock:
    """Create a mock Agent that returns the given response on arun()."""
    agent = MagicMock()
    agent.arun = AsyncMock(return_value=response)
    return agent
