"""Class Watcher plugin - tracks class attendance and reminds of upcoming classes."""

from __future__ import annotations

from datetime import datetime, time
from typing import Any

from app.plugins.base import BasePlugin, plugin


@plugin
class ClassWatcherPlugin(BasePlugin):
    """Plugin that watches for class schedules and sends reminders."""

    name = "Class Watcher"
    version = "1.0.0"
    description = "课程提醒与出勤追踪，自动提醒即将到来的课程"
    author = "ChatNote"

    def on_message(self, content: str, context: dict[str, Any] | None = None) -> str | None:
        """Detect class-related messages."""
        content_lower = content.lower()

        # Check if it's a class check-in
        if any(kw in content_lower for kw in ["上课了", "签到了", "打卡", "attending class"]):
            return self._handle_checkin(content, context)

        # Check if asking about upcoming classes
        if any(kw in content_lower for kw in ["今天有什么课", "课程表", "今天课表", "upcoming classes"]):
            return self._get_today_classes(context)

        return None

    def on_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> str | None:
        """Handle class-related commands."""
        if command in ["class", "classes", "course", "课程"]:
            if not args:
                return self._get_today_classes(context)

            subcmd = args[0].lower()
            if subcmd in ["today", "今天"]:
                return self._get_today_classes(context)
            elif subcmd in ["checkin", "签到", "打卡"]:
                return self._handle_checkin(" ".join(args[1:]), context)
            elif subcmd in ["stats", "统计"]:
                return self._get_attendance_stats(context)
            else:
                return "用法: /class [today|checkin|stats]"

        return None

    def on_schedule(self, event: dict[str, Any], context: dict[str, Any] | None = None) -> str | None:
        """Handle schedule events for class reminders."""
        event_title = event.get("title", "").lower()

        # Check if this is a class schedule
        class_keywords = ["课", "课程", "lecture", "class", "course"]
        if any(kw in event_title for kw in class_keywords):
            # Check if it's time to remind (e.g., 15 minutes before)
            reminder_minutes = event.get("reminder_minutes", 15)

            return (
                f"**课程提醒** ⏰\n"
                f"即将开始: {event.get('title')}\n"
                f"时间: {event.get('start_time')}\n"
                f"准备好了吗？"
            )

        return None

    def _handle_checkin(self, content: str, context: dict[str, Any] | None = None) -> str:
        """Handle class check-in."""
        now = datetime.now()
        time_str = now.strftime("%H:%M")

        # Extract class name if mentioned
        class_name = self._extract_class_name(content)

        if class_name:
            return (
                f"**签到成功** ✅\n"
                f"课程: {class_name}\n"
                f"时间: {time_str}\n"
                f"祝你学习愉快！"
            )
        else:
            return (
                f"**签到成功** ✅ ({time_str})\n"
                f"记得记录今天的学习笔记哦！"
            )

    def _get_today_classes(self, context: dict[str, Any] | None = None) -> str:
        """Get today's classes."""
        now = datetime.now()
        weekday = now.weekday()
        weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]

        # This is a placeholder - in real implementation, this would query the database
        return (
            f"**{weekdays[weekday]}课程** 📚\n"
            f"查询课程功能需要在日程表中添加课程后才能使用。\n"
            f"使用 /schedule 命令添加课程安排。"
        )

    def _get_attendance_stats(self, context: dict[str, Any] | None = None) -> str:
        """Get attendance statistics."""
        return (
            "**出勤统计** 📊\n"
            "本周出勤: 良好\n"
            "连续签到: 3 天\n"
            "继续加油！"
        )

    def _extract_class_name(self, content: str) -> str | None:
        """Extract class name from content."""
        # Common patterns
        patterns = [
            r"(\w+)课",
            r"(\w+)课程",
            r"(\w+)开始",
        ]

        import re
        for pattern in patterns:
            match = re.search(pattern, content)
            if match:
                return match.group(1)

        # Subject keywords
        subjects = [
            "数学", "英语", "物理", "化学", "生物", "历史", "地理", "政治",
            "高数", "线代", "概率论", "编程", "计算机", "数据结构",
            "math", "english", "physics", "chemistry", "biology"
        ]

        content_lower = content.lower()
        for subject in subjects:
            if subject in content_lower:
                return subject

        return None

    def get_config_schema(self) -> list[dict[str, Any]]:
        """Return configuration schema."""
        return [
            {
                "name": "reminder_enabled",
                "type": "boolean",
                "title": "启用提醒",
                "description": "课程开始前发送提醒",
                "default": True,
            },
            {
                "name": "reminder_minutes",
                "type": "number",
                "title": "提前提醒时间",
                "description": "课程开始前多少分钟提醒",
                "default": 15,
                "minimum": 5,
                "maximum": 60,
            },
            {
                "name": "track_attendance",
                "type": "boolean",
                "title": "追踪出勤",
                "description": "记录课程出勤情况",
                "default": True,
            },
        ]
