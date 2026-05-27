import os
import subprocess
import sys
from pathlib import Path

import pytest
import sqlalchemy as sa

from app.config import settings
from app.models.models import Note, Thread


# ── Migration test (PostgreSQL only) ────────────────────────────────

def _build_migration_db_url() -> str:
    """Build a dedicated test database URL for migration tests."""
    env_url = os.environ.get("TEST_DATABASE_URL") or settings.DATABASE_URL
    base, _, db_name = env_url.rpartition("/")
    return f"{base}/{db_name}_migration"


def _run_alembic(command: str, revision: str, database_url: str) -> None:
    """Execute an alembic command against the given database URL."""
    backend_dir = Path(__file__).resolve().parents[1]
    env = os.environ.copy()
    env["DATABASE_URL"] = database_url
    result = subprocess.run(
        [sys.executable, "-m", "alembic", command, revision],
        cwd=backend_dir,
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"alembic {command} {revision} failed:\n{result.stderr}")


@pytest.fixture(scope="module")
def migration_db_url():
    """Create a temporary PostgreSQL database for migration testing.

    Automatically skipped if PostgreSQL is not reachable.
    """
    db_url = _build_migration_db_url()
    # Replace asyncpg with psycopg2 for admin connection
    admin_url = (
        db_url.replace("+asyncpg", "+psycopg2")
        .rsplit("/", 1)[0]
        + "/postgres"
    )
    db_name = db_url.rsplit("/", 1)[-1]

    try:
        sync_engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with sync_engine.connect() as conn:
            conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{db_name}"'))
            conn.execute(sa.text(f'CREATE DATABASE "{db_name}"'))
        sync_engine.dispose()
    except Exception as e:
        pytest.skip(f"Cannot create migration test database: {e}")

    yield db_url

    # Cleanup: drop the temp database
    try:
        sync_engine = sa.create_engine(admin_url, isolation_level="AUTOCOMMIT")
        with sync_engine.connect() as conn:
            conn.execute(sa.text(f'DROP DATABASE IF EXISTS "{db_name}"'))
        sync_engine.dispose()
    except Exception:
        pass


def test_threads_migration_upgrade_and_downgrade(migration_db_url):
    """alembic upgrade head and downgrade -1 must both succeed.

    Verifies that the full migration chain works without errors against
    a fresh PostgreSQL database.
    """
    _run_alembic("upgrade", "head", migration_db_url)
    _run_alembic("downgrade", "-1", migration_db_url)


# ── Async API tests (use conftest PostgreSQL fixtures) ──────────────

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
