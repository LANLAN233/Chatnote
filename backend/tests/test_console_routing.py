"""Tests for the @Server #Channel query routing pipeline in console.py.

Covers _route_query_skill() and the console_execute() endpoint routing,
verifying that existing backend behavior is correct.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient

from app.models.models import Channel, Server
from app.routers.console import _route_query_skill
from app.services.parser import ParsedInput


# ===========================================================================
# Fixtures
# ===========================================================================

@pytest_asyncio.fixture
async def math_server(db_session):
    """Create a MathClass server with a 极限 channel."""
    server = Server(user_id=1, name="MathClass")
    db_session.add(server)
    await db_session.flush()

    channel = Channel(server_id=server.id, name="极限")
    db_session.add(channel)
    await db_session.flush()

    return server, channel


# ===========================================================================
# _route_query_skill() direct tests
# ===========================================================================


@pytest.mark.asyncio
async def test_route_query_skill_valid_server_channel_question(
    math_server, db_session
):
    """_route_query_skill with valid server+channel+question dispatches to query skill.

    Mock _dispatch_skill to avoid needing a real AI model.
    """
    server, channel = math_server

    parsed = ParsedInput(
        server_name="MathClass",
        channel_name="极限",
        content="What is a limit?",
        raw_input="@MathClass #极限 What is a limit?",
    )

    with patch(
        "app.routers.console._dispatch_skill", new_callable=AsyncMock
    ) as mock_dispatch:
        mock_dispatch.return_value = {
            "type": "output",
            "content": "A limit is a fundamental concept in calculus.",
            "data": {"answer": "A limit describes the value a function approaches."},
        }

        result = await _route_query_skill(parsed, user_id=1, db=db_session)

    assert result is not None, "Should return a result dict, not None"
    assert result["type"] == "output"
    assert "limit" in result["content"].lower()
    assert result.get("data") is not None

    # Verify _dispatch_skill was called with correct skill name and server_context
    mock_dispatch.assert_called_once()
    call_args = mock_dispatch.call_args
    assert call_args[0][0] == "query"  # skill_name
    assert call_args[0][1] == "What is a limit?"  # question
    ctx = call_args[1]["server_context"]
    assert ctx["server_id"] == server.id
    assert ctx["server_name"] == "MathClass"
    assert ctx["channel_id"] == channel.id
    assert ctx["channel_name"] == "极限"


@pytest.mark.asyncio
async def test_route_query_skill_nonexistent_server(db_session):
    """_route_query_skill with a server name that doesn't exist returns None.

    Should fall through without crashing — no server matches the name.
    """
    parsed = ParsedInput(
        server_name="NonExistentServer",
        channel_name="general",
        content="Some question?",
        raw_input="@NonExistentServer #general Some question?",
    )

    result = await _route_query_skill(parsed, user_id=1, db=db_session)
    assert result is None, "Nonexistent server should return None (fall through)"


@pytest.mark.asyncio
async def test_route_query_skill_empty_question(math_server, db_session):
    """_route_query_skill with whitespace-only content returns None.

    Valid server/channel but no actual question → should not dispatch.
    """
    parsed = ParsedInput(
        server_name="MathClass",
        channel_name="极限",
        content="   ",
        raw_input="@MathClass #极限   ",
    )

    result = await _route_query_skill(parsed, user_id=1, db=db_session)
    assert result is None, "Empty question should return None (fall through)"


@pytest.mark.asyncio
async def test_route_query_skill_server_only_no_question(db_session):
    """_route_query_skill with only @Server and no content returns None.

    Even with a valid server, no question means no dispatch.
    """
    server = Server(user_id=1, name="OnlyServer")
    db_session.add(server)
    await db_session.flush()

    parsed = ParsedInput(
        server_name="OnlyServer",
        channel_name=None,
        content="",
        raw_input="@OnlyServer",
    )

    result = await _route_query_skill(parsed, user_id=1, db=db_session)
    assert result is None, "No question content should return None"


# ===========================================================================
# console_execute() endpoint tests
# ===========================================================================


@pytest.mark.asyncio
async def test_console_execute_at_server_channel_routes_to_query(
    client: AsyncClient, auth_headers: dict, math_server
):
    """POST with @Server #Channel question + ai_enabled=true → routed_skill: 'query'.

    Even without a configured AI model, the routing layer resolves server/channel
    and dispatches to the query skill (which returns an error about no model).
    The key assertion is that the response contains routed_skill: "query",
    confirming the routing logic fired correctly.
    """
    response = await client.post(
        "/api/console/execute",
        json={"input": "@MathClass #极限 What is the definition of a limit?", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "routed_skill" in data["data"], (
        f"Expected routed_skill in response data, got keys: {list(data['data'].keys())}"
    )
    assert data["data"]["routed_skill"] == "query", (
        f"Expected routed_skill='query', got '{data['data'].get('routed_skill')}'"
    )


@pytest.mark.asyncio
async def test_console_execute_dollar_ask_at_server_not_query_routing(
    client: AsyncClient, auth_headers: dict, math_server
):
    """$ask @Server #Channel question routes to $ask skill, NOT query routing.

    The $ prefix makes the parser treat this as a skill invocation.
    The backend correctly dispatches to $ask (not the @# query routing).
    This test verifies that the broken frontend path ($ask @#) is handled
    as a skill, not as query routing.
    """
    response = await client.post(
        "/api/console/execute",
        json={"input": "$ask @MathClass #极限 explain limits", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True

    # Must NOT have routed_skill = "query" — it's a $ask skill call
    routed = data["data"].get("routed_skill")
    assert routed != "query", (
        f"$ask should NOT be routed as query skill, got routed_skill={routed!r}"
    )

    # Since no AI model is configured, $ask dispatch returns an error.
    # This is expected — the routing itself is correct.
    assert data["data"]["type"] == "error" or "No AI model" in data["data"].get("content", "")


@pytest.mark.asyncio
async def test_console_execute_plain_text_falls_through_to_note(
    client: AsyncClient, auth_headers: dict
):
    """Plain text without @# /$ falls through to note creation — no crash.

    Regression test: console_execute must handle plain text gracefully
    by creating a note, not crashing.
    """
    response = await client.post(
        "/api/console/execute",
        json={"input": "regular note about linear algebra", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "note" in data["data"], (
        f"Plain text should create a note, got keys: {list(data['data'].keys())}"
    )
    assert "routed_skill" not in data["data"], (
        "Plain text should NOT trigger query routing"
    )


@pytest.mark.asyncio
async def test_console_execute_at_server_no_channel_routes_to_query(
    client: AsyncClient, auth_headers: dict, db_session
):
    """@ServerName with question (no #Channel) still routes to query skill.

    Only needs server_name and non-empty content — channel is optional.
    """
    server = Server(user_id=1, name="Physics")
    db_session.add(server)
    await db_session.flush()

    response = await client.post(
        "/api/console/execute",
        json={"input": "@Physics What is Newton's second law?", "ai_enabled": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"].get("routed_skill") == "query", (
        "@Server with question should route to query, even without #Channel"
    )
