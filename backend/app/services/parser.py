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
    # Skill and file reference support
    is_skill: bool = False
    skill_name: str | None = None
    skill_args: str = ""
    file_refs: list[str] = field(default_factory=list)


def parse_input(text: str) -> ParsedInput:
    text = text.strip()
    if not text:
        return ParsedInput()

    # $skill detection (before /command)
    if text.startswith("$"):
        return _parse_skill(text)

    if text.startswith("/"):
        return _parse_command(text)

    return _parse_note(text)


def _parse_skill(text: str) -> ParsedInput:
    match = re.match(r"^\$(\w+)\s*(.*)", text, re.DOTALL)
    if not match:
        return ParsedInput(content=text, raw_input=text)

    skill_name = match.group(1).lower()
    args = match.group(2).strip()

    # Extract @file: references from skill args
    file_refs = _extract_file_refs(text)

    return ParsedInput(
        content=text,
        raw_input=text,
        is_skill=True,
        skill_name=skill_name,
        skill_args=args,
        file_refs=file_refs,
    )


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

    # Extract @file: references
    file_refs = _extract_file_refs(text)

    return ParsedInput(
        server_name=server_name,
        channel_name=channel_name,
        content=content or text,
        raw_input=text,
        file_refs=file_refs,
    )


def _extract_file_refs(text: str) -> list[str]:
    """Extract @file:filename references from text."""
    matches = re.findall(r"@file:(\S+)", text, re.IGNORECASE)
    return list(dict.fromkeys(matches))  # deduplicate, preserve order
