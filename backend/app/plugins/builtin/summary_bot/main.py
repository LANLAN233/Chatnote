"""Summary Bot plugin - generates summaries for long notes."""

from __future__ import annotations

import re
from typing import Any

from app.plugins.base import BasePlugin


class SummaryBotPlugin(BasePlugin):
    """Plugin that automatically summarizes long text content."""

    name = "Summary Bot"
    version = "1.0.0"
    description = "自动为长文本生成摘要，提取关键信息"
    author = "ChatNote"

    # Minimum length to trigger auto-summary
    MIN_LENGTH = 100
    # Default summary length
    SUMMARY_LENGTH = 3

    def on_message(self, content: str, context: dict[str, Any] | None = None) -> str | None:
        """Auto-summarize long messages."""
        if not self.config.get("auto_summarize", True):
            return None

        if len(content) < self.MIN_LENGTH:
            return None

        # Check if it's a note/summary request
        if self._is_summary_request(content):
            summary = self._generate_summary(content)
            if summary:
                return f"**摘要**:\n{summary}"

        # Auto-summarize very long content
        if len(content) > 500 and self.config.get("auto_summarize_long", True):
            summary = self._generate_summary(content)
            if summary:
                return f"**自动摘要** ({len(content)} 字):\n{summary}"

        return None

    def on_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> str | None:
        """Handle /summarize command."""
        if command in ["summarize", "summary", "摘要"]:
            if not args:
                return "用法: /summarize <文本内容>  或回复一条消息使用 /summarize"

            text = " ".join(args)
            summary = self._generate_summary(text)
            if summary:
                return f"**摘要**:\n{summary}"
            else:
                return "无法生成摘要，请提供更长一些的文本。"

        return None

    def _is_summary_request(self, content: str) -> bool:
        """Check if content is requesting a summary."""
        summary_keywords = [
            "总结一下", "摘要", "概括", "总结",
            "summarize", "summary", "tl;dr", "tldr"
        ]
        content_lower = content.lower()
        return any(kw in content_lower for kw in summary_keywords)

    def _generate_summary(self, text: str) -> str | None:
        """Generate a simple extractive summary."""
        if len(text) < 50:
            return None

        # Clean text
        text = re.sub(r'\s+', ' ', text).strip()

        # Split into sentences
        sentences = re.split(r'[。！？.!?]', text)
        sentences = [s.strip() for s in sentences if len(s.strip()) > 10]

        if len(sentences) <= 1:
            return None

        # Score sentences
        scores = []
        for i, sent in enumerate(sentences):
            score = self._score_sentence(sent, i, sentences)
            scores.append((score, sent))

        # Get top sentences
        scores.sort(reverse=True)
        top_count = min(self.SUMMARY_LENGTH, len(sentences) // 3 + 1)
        top_sentences = [s for _, s in scores[:top_count]]

        # Maintain original order
        summary_sentences = []
        for sent in sentences:
            if sent in top_sentences:
                summary_sentences.append(sent)

        summary = "。".join(summary_sentences)
        if summary and not summary.endswith("。"):
            summary += "。"

        return summary

    def _score_sentence(self, sentence: str, index: int, all_sentences: list[str]) -> float:
        """Score a sentence for importance."""
        score = 0.0

        # Position score (earlier sentences often more important)
        if index == 0:
            score += 3
        elif index < len(all_sentences) * 0.2:
            score += 2

        # Length score (not too short, not too long)
        length = len(sentence)
        if 20 <= length <= 100:
            score += 2
        elif length > 100:
            score += 1

        # Keyword score
        keywords = ["重要", "关键", "主要", "核心", "总结", "结论", "因此", "所以", "总之"]
        for kw in keywords:
            if kw in sentence:
                score += 1

        # Number score (sentences with numbers often contain facts)
        if re.search(r'\d+', sentence):
            score += 1

        return score

    def get_config_schema(self) -> list[dict[str, Any]]:
        """Return configuration schema."""
        return [
            {
                "name": "auto_summarize",
                "type": "boolean",
                "title": "自动摘要",
                "description": "自动为长消息生成摘要",
                "default": True,
            },
            {
                "name": "auto_summarize_long",
                "type": "boolean",
                "title": "长文本自动摘要",
                "description": "自动为超过500字的长文本生成摘要",
                "default": True,
            },
            {
                "name": "summary_length",
                "type": "number",
                "title": "摘要长度",
                "description": "摘要包含的句子数量",
                "default": 3,
                "minimum": 1,
                "maximum": 10,
            },
        ]
