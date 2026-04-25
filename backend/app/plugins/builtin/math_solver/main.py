"""Math Solver plugin - automatically detects and calculates math expressions."""

from __future__ import annotations

import math
import re
from typing import Any

from app.plugins.base import BasePlugin


class MathSolverPlugin(BasePlugin):
    """Plugin that detects and solves mathematical expressions."""

    name = "Math Solver"
    version = "1.0.0"
    description = "自动检测并计算数学表达式，支持基本运算、函数和常量"
    author = "ChatNote"

    # Pattern to detect math expressions
    # Simple pattern to match basic arithmetic expressions
    MATH_PATTERN = re.compile(
        r"\d+\.?\d*(?:\s*[+\-*/]\s*\d+\.?\d*)+"
    )

    def on_message(self, content: str, context: dict[str, Any] | None = None) -> str | None:
        """Detect and solve math expressions in message."""
        # Look for explicit math query
        if self._is_math_query(content):
            expression = self._extract_expression(content)
            if expression:
                result = self._evaluate(expression)
                if result is not None:
                    return f"**计算结果**: {expression} = **{result}**"

        # Look for embedded math expressions
        matches = self.MATH_PATTERN.findall(content)
        if matches and len(matches) >= 1:
            # Try to evaluate the first match
            for match in matches:
                if match and not isinstance(match, str):
                    match = match[0] if match else ""
                if match and len(match) > 2:
                    result = self._evaluate(match)
                    if result is not None:
                        return f"检测到数学表达式: {match} = **{result}**"

        return None

    def on_command(self, command: str, args: list[str], context: dict[str, Any] | None = None) -> str | None:
        """Handle /calc command."""
        if command == "calc" or command == "calculate":
            if not args:
                return "用法: /calc <数学表达式>  例如: /calc 2 + 2 * 3"

            expression = " ".join(args)
            result = self._evaluate(expression)
            if result is not None:
                return f"{expression} = **{result}**"
            else:
                return f"无法计算表达式: {expression}"

        return None

    def _is_math_query(self, content: str) -> bool:
        """Check if content is a math query."""
        math_keywords = [
            "计算", "等于", "=", "是多少", "结果",
            "calculate", "compute", "equals", "result of"
        ]
        content_lower = content.lower()
        return any(kw in content_lower for kw in math_keywords)

    def _extract_expression(self, content: str) -> str | None:
        """Extract math expression from content."""
        # Remove common prefixes
        prefixes = ["计算", "calculate", "compute", "result of", "等于", "是多少"]
        expr = content
        for prefix in prefixes:
            if prefix in expr.lower():
                expr = expr.lower().split(prefix, 1)[-1]

        # Clean up
        expr = expr.strip().strip("=?").strip()

        # Replace special chars
        expr = expr.replace("^", "**")
        expr = expr.replace("×", "*")
        expr = expr.replace("÷", "/")

        return expr if expr else None

    def _evaluate(self, expression: str) -> float | int | None:
        """Safely evaluate a mathematical expression."""
        try:
            # Replace math functions
            expr = expression.lower()
            expr = expr.replace("pi", str(math.pi))
            expr = expr.replace("e", str(math.e))

            # Replace function names with math module calls
            for func in ["sin", "cos", "tan", "sqrt", "log", "ln", "abs", "round", "floor", "ceil"]:
                if func in expr:
                    if func == "ln":
                        expr = expr.replace("ln", "math.log")
                    else:
                        expr = expr.replace(func, f"math.{func}")

            # Only allow safe characters
            allowed_chars = set("0123456789+-*/.() **mathcosintaqrulbgf")
            if not all(c in allowed_chars for c in expr):
                return None

            # Evaluate
            result = eval(expr, {"__builtins__": {}}, {"math": math})

            # Format result
            if isinstance(result, float):
                if result.is_integer():
                    return int(result)
                return round(result, 6)
            return result

        except Exception:
            return None

    def get_config_schema(self) -> list[dict[str, Any]]:
        """Return configuration schema."""
        return [
            {
                "name": "auto_detect",
                "type": "boolean",
                "title": "自动检测",
                "description": "自动检测消息中的数学表达式",
                "default": True,
            },
            {
                "name": "show_steps",
                "type": "boolean",
                "title": "显示步骤",
                "description": "显示计算步骤",
                "default": False,
            },
        ]
