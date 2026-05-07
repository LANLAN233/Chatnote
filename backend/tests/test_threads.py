import os
import sqlite3
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import pytest

from app.models.models import Channel, Note, Server, Thread


def _run_alembic(command: str, revision: str, database_url: str) -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    subprocess.run(
        [sys.executable, "-m", "alembic", command, revision],
        cwd=backend_dir,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _table_columns(db_path: Path, table_name: str) -> list[str]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(f"PRAGMA table_info({table_name})").fetchall()
    return [row[1] for row in rows]


def _foreign_keys(db_path: Path, table_name: str) -> list[tuple[str, str, str]]:
    with sqlite3.connect(db_path) as conn:
        rows = conn.execute(f"PRAGMA foreign_key_list({table_name})").fetchall()
    return [(row[3], row[2], row[6]) for row in rows]


def test_threads_migration_upgrade_and_downgrade(tmp_path: Path) -> None:
    db_path = tmp_path / "threads.db"
    database_url = f"sqlite+aiosqlite:///{db_path.as_posix()}"

    _run_alembic("upgrade", "head", database_url)

    with sqlite3.connect(db_path) as conn:
        tables = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        }

    assert "threads" in tables
    assert "thread_id" in _table_columns(db_path, "notes")
    assert _table_columns(db_path, "threads") == [
        "id",
        "channel_id",
        "parent_note_id",
        "title",
        "created_by",
        "created_at",
        "updated_at",
    ]
    assert ("channel_id", "channels", "CASCADE") in _foreign_keys(db_path, "threads")
    assert ("parent_note_id", "notes", "CASCADE") in _foreign_keys(db_path, "threads")
    assert ("created_by", "users", "CASCADE") in _foreign_keys(db_path, "threads")
    assert ("thread_id", "threads", "CASCADE") in _foreign_keys(db_path, "notes")

    _run_alembic("downgrade", "-1", database_url)

    with sqlite3.connect(db_path) as conn:
        tables_after = {
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        }

    assert "threads" not in tables_after
    assert "thread_id" not in _table_columns(db_path, "notes")


@pytest.mark.asyncio
async def test_list_notes_excludes_thread_messages(client, auth_headers, db_session):
    """Channel note list should exclude messages that belong to a thread."""
    # 1. Create server + channel
    server_resp = await client.post("/api/servers", json={"name": "Srv"}, headers=auth_headers)
    server_id = server_resp.json()["data"]["id"]
    ch_resp = await client.post(
        f"/api/servers/{server_id}/channels", json={"name": "Ch"}, headers=auth_headers
    )
    channel_id = ch_resp.json()["data"]["id"]

    # 2. Create 3 regular notes via API
    for i in range(3):
        await client.post(
            "/api/notes",
            json={"channel_id": channel_id, "content": f"Regular note {i}"},
            headers=auth_headers,
        )

    # 3. Fetch one note to use as parent for thread
    list_resp = await client.get(f"/api/channels/{channel_id}/notes", headers=auth_headers)
    notes = list_resp.json()["data"]["items"]
    parent_note_id = notes[0]["id"]
    user_id = notes[0]["user_id"]

    # 4. Create a Thread directly via DB (no thread API yet)
    thread = Thread(
        channel_id=channel_id,
        parent_note_id=parent_note_id,
        title="Test Thread",
        created_by=user_id,
    )
    db_session.add(thread)
    await db_session.flush()

    # 5. Create 2 threaded messages directly via DB
    for i in range(2):
        threaded_note = Note(
            channel_id=channel_id,
            user_id=user_id,
            content=f"Thread reply {i}",
            thread_id=thread.id,
        )
        db_session.add(threaded_note)
    await db_session.flush()

    # 6. GET channel notes — must exclude thread messages
    response = await client.get(f"/api/channels/{channel_id}/notes", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["total"] == 3, f"Expected 3 notes (excluding thread messages), got {data['data']['total']}"

    # Verify all returned notes have no thread_id
    for item in data["data"]["items"]:
        assert item.get("thread_id") is None, f"Note {item['id']} has thread_id={item.get('thread_id')}"
