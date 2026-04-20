import re
from dataclasses import dataclass, field


@dataclass
class ParsedInput:
    server_name: str | None = None
    channel_name: str | None = None
    content: str = ""
    raw_input: str = ""
    is_command: bool = False
    command: str | None = None
    command_args: str = ""


def parse_input(text: str) -> ParsedInput:
    text = text.strip()
    if not text:
        return ParsedInput()

    if text.startswith("/"):
        return _parse_command(text)

    return _parse_note(text)


def _parse_command(text: str) -> ParsedInput:
    match = re.match(r"^/(\w+)\s*(.*)", text, re.DOTALL)
    if not match:
        return ParsedInput(content=text, raw_input=text)

    command = match.group(1).lower()
    args = match.group(2).strip()

    return ParsedInput(
        content=text,
        raw_input=text,
        is_command=True,
        command=command,
        command_args=args,
    )


def _parse_note(text: str) -> ParsedInput:
    server_name = None
    channel_name = None
    remaining = text

    server_match = re.match(r"^@([^\s#]+)\s*", remaining)
    if server_match:
        server_name = server_match.group(1)
        remaining = remaining[server_match.end():]

    channel_match = re.match(r"^#([^\s]+)\s*", remaining)
    if channel_match:
        channel_name = channel_match.group(1)
        remaining = remaining[channel_match.end():]

    content = remaining.strip()

    return ParsedInput(
        server_name=server_name,
        channel_name=channel_name,
        content=content or text,
        raw_input=text,
    )
