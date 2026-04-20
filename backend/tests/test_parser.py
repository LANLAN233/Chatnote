import pytest
from app.services.parser import parse_input, ParsedInput


def test_parse_empty():
    result = parse_input("")
    assert result.content == ""
    assert result.is_command is False


def test_parse_plain_note():
    result = parse_input("Hello world this is a note")
    assert result.content == "Hello world this is a note"
    assert result.server_name is None
    assert result.channel_name is None
    assert result.is_command is False


def test_parse_server_channel():
    result = parse_input("@高等数学 #第三章极限 今天学了ε-δ定义")
    assert result.server_name == "高等数学"
    assert result.channel_name == "第三章极限"
    assert result.content == "今天学了ε-δ定义"
    assert result.raw_input == "@高等数学 #第三章极限 今天学了ε-δ定义"


def test_parse_server_only():
    result = parse_input("@Python FastAPI is great")
    assert result.server_name == "Python"
    assert result.channel_name is None
    assert result.content == "FastAPI is great"


def test_parse_channel_only():
    result = parse_input("#general some note content")
    assert result.server_name is None
    assert result.channel_name == "general"
    assert result.content == "some note content"


def test_parse_command():
    result = parse_input("/help")
    assert result.is_command is True
    assert result.command == "help"
    assert result.command_args == ""


def test_parse_command_with_args():
    result = parse_input("/search limit derivative")
    assert result.is_command is True
    assert result.command == "search"
    assert result.command_args == "limit derivative"


def test_parse_todo_command():
    result = parse_input("/todo finish homework")
    assert result.is_command is True
    assert result.command == "todo"
    assert result.command_args == "finish homework"


def test_parse_slash_not_command():
    result = parse_input("use /help to see commands")
    assert result.is_command is False
    assert "use /help" in result.content
