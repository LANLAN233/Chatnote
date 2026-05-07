"""$web Skill — URL fetching and web search via agno tools.

Two input modes:
- URL mode: $web https://example.com → fetch and extract content
  Uses WebsiteTools (read_url) + TrafilaturaTools (extract_text)
- Search mode: $web 搜索关键词 → search web for results
  Uses DuckDuckGoTools (duckduckgo_search)

If tool-calling is not supported by the model, returns an error message
prompting the user to use a model that supports tools.
"""

from __future__ import annotations

import logging
import re

from agno.agent import Agent
from agno.tools.duckduckgo import DuckDuckGoTools
from agno.tools.trafilatura import TrafilaturaTools
from agno.tools.website import WebsiteTools

from app.ai.skills.base import BaseSkill, SkillContext, SkillResult
from app.ai.skills.builtin.ask import _is_tool_call_error

logger = logging.getLogger(__name__)

_URL_PATTERN = re.compile(r"^https?://", re.IGNORECASE)

_URL_AGENT_INSTRUCTIONS = """You are a web content extractor for ChatNote. Your job is to fetch and extract the main content from a given URL.

## Your Task
1. Use the `read_url` tool to fetch the webpage
2. Use the `extract_text` tool to clean the HTML and extract readable content
3. Return the result in this JSON format:
```json
{"title": "Page Title", "content": "Cleaned extracted text...", "url": "the_url"}
```

## Rules
- Fetch ONLY the requested URL (do not crawl additional pages)
- Extract the MAIN content (article body, not navigation/sidebars/ads)
- Keep the content concise but informative — aim for 2-5 paragraphs
- Strip boilerplate (menus, footers, cookie notices, etc.)
- Output ONLY valid JSON, no extra commentary"""

_SEARCH_AGENT_INSTRUCTIONS = """You are a web search assistant for ChatNote. Your job is to search the web and provide key results.

## Your Task
1. Use the `duckduckgo_search` tool to search for the query
2. Summarize the top results
3. Return the result in this JSON format:
```json
{
  "title": "Search: query",
  "content": "Summary of key results with source links",
  "url": "",
  "metadata": {"results": [{"title": "...", "url": "...", "snippet": "..."}]}
}
```

## Rules
- Search for the EXACT query provided by the user
- Summarize the top 3-5 most relevant results
- Include source URLs when available
- Be concise — focus on the key findings
- Output ONLY valid JSON, no extra commentary"""


class WebSkill(BaseSkill):
    name = "web"
    description = "网页抓取与搜索 — $web <URL> 抓取网页内容, $web <关键词> 搜索网络"

    async def execute(self, args: str, context: SkillContext) -> SkillResult:
        query = args.strip()
        if not query:
            return SkillResult(
                type="error",
                content="$web: Please provide a URL or search query.\n"
                "Usage: $web https://example.com  OR  $web your search query",
            )

        is_url = bool(_URL_PATTERN.match(query))

        try:
            if is_url:
                return await self._fetch_url(query, context)
            else:
                return await self._search_web(query, context)
        except Exception as exc:
            logger.error("WebSkill failed for '%s': %s", query[:100], exc)
            mode = "URL fetch" if is_url else "web search"
            return SkillResult(
                type="error",
                content=f"$web: {mode} failed — {exc}",
            )

    async def _fetch_url(self, url: str, context: SkillContext) -> SkillResult:
        """Fetch and extract content from a URL."""
        agent = Agent(
            model=context.model,
            name="Web Fetcher",
            tools=[WebsiteTools(), TrafilaturaTools()],
            instructions=_URL_AGENT_INSTRUCTIONS,
        )

        try:
            response = await agent.arun(
                input=f"Fetch and extract content from: {url}"
            )
        except Exception as exc:
            logger.error("Web fetch failed: %s", exc)
            return SkillResult(
                type="error",
                content=f"$web: URL fetch failed — {exc}",
            )

        content = (
            response.content if hasattr(response, "content") else str(response)
        )

        if _is_tool_call_error(content):
            return SkillResult(
                type="error",
                content="$web: Your current AI model does not support tool calling (required for web fetching). "
                "Try using a model that supports tools (e.g. deepseek-chat, gpt-4o), or switch to a compatible provider.",
            )

        parsed = self._parse_json_response(content, url, mode="fetch")
        if parsed is None:
            return SkillResult(
                type="error",
                content=f"$web: Failed to parse fetched content from {url}",
            )

        return SkillResult(
            type="web_result",
            content=f"🌐 **{parsed['title']}**\n\n{parsed['content']}",
            data={
                "title": parsed["title"],
                "content": parsed["content"],
                "url": parsed.get("url", url),
                "metadata": {"mode": "fetch"},
            },
        )

    async def _search_web(self, query: str, context: SkillContext) -> SkillResult:
        """Search the web and return results."""
        agent = Agent(
            model=context.model,
            name="Web Searcher",
            tools=[DuckDuckGoTools()],
            instructions=_SEARCH_AGENT_INSTRUCTIONS,
        )

        try:
            response = await agent.arun(
                input=f"Search query: {query}"
            )
        except Exception as exc:
            logger.error("Web search failed: %s", exc)
            return SkillResult(
                type="error",
                content=f"$web: Search failed — {exc}",
            )

        content = (
            response.content if hasattr(response, "content") else str(response)
        )

        if _is_tool_call_error(content):
            return SkillResult(
                type="error",
                content="$web: Your current AI model does not support tool calling (required for web search). "
                "Try using a model that supports tools (e.g. deepseek-chat, gpt-4o), or switch to a compatible provider.",
            )

        parsed = self._parse_json_response(content, query, mode="search")
        if parsed is None:
            # Fallback: return raw response if JSON parsing fails
            return SkillResult(
                type="web_result",
                content=f"🔍 **搜索: {query}**\n\n{content[:2000]}",
                data={
                    "title": f"Search: {query}",
                    "content": content[:2000],
                    "url": "",
                    "metadata": {"mode": "search", "raw": True},
                },
            )

        return SkillResult(
            type="web_result",
            content=f"🔍 **{parsed.get('title', f'搜索: {query}')}**\n\n{parsed.get('content', '')}",
            data={
                "title": parsed.get("title", f"Search: {query}"),
                "content": parsed.get("content", ""),
                "url": parsed.get("url", ""),
                "metadata": {
                    "mode": "search",
                    "results": parsed.get("metadata", {}).get("results", []),
                },
            },
        )

    def _parse_json_response(
        self, text: str, fallback_url: str, mode: str
    ) -> dict | None:
        """Parse JSON from agent response, handling markdown code fences."""
        import json as _json

        cleaned = text.strip()

        # Strip markdown code fences
        if cleaned.startswith("```"):
            cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
            cleaned = re.sub(r"```\s*$", "", cleaned)
        cleaned = cleaned.strip()

        # Find the outermost JSON object
        first_brace = cleaned.find("{")
        last_brace = cleaned.rfind("}")
        if first_brace != -1 and last_brace > first_brace:
            cleaned = cleaned[first_brace : last_brace + 1]

        try:
            data = _json.loads(cleaned)
            if isinstance(data, dict):
                # Ensure required fields
                data.setdefault("title", f"Web page: {fallback_url[:60]}")
                data.setdefault("content", "")
                data.setdefault("url", fallback_url)
                data.setdefault("metadata", {"mode": mode})
                return data
        except (_json.JSONDecodeError, TypeError, ValueError) as exc:
            logger.debug("Failed to parse JSON from agent response: %s", exc)

        return None
