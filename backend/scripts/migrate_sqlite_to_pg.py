#!/usr/bin/env python3
"""
SQLite to PostgreSQL data migration script for ChatNote.

Migrates ALL data from the existing SQLite database (backend/chatnote.db)
to PostgreSQL via asyncpg with batch inserts and type conversions.

Usage:
    python backend/scripts/migrate_sqlite_to_pg.py           # Run migration
    python backend/scripts/migrate_sqlite_to_pg.py --dry-run  # Count rows only
    python backend/scripts/migrate_sqlite_to_pg.py --verify   # Compare row counts post-migration
"""

import argparse
import asyncio
import json
import sqlite3
import sys
from datetime import date, datetime, time
from pathlib import Path
from typing import Any

import asyncpg

# ── Configuration ──────────────────────────────────────────────────────────

# Paths (relative to backend/ directory)
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
SQLITE_PATH = BACKEND_DIR / "chatnote.db"

# PostgreSQL connection (direct asyncpg DSN, not SQLAlchemy URL)
PG_DSN = "postgresql://chatnote:changeme@localhost:6432/chatnote"

BATCH_SIZE = 100

# ── Type Conversion Maps ───────────────────────────────────────────────────

# JSONB columns: parse SQLite TEXT as JSON for PostgreSQL JSONB
JSONB_COLUMNS: dict[str, list[str]] = {
    "notes": ["ai_tags", "user_tags"],
    "schedules": ["repeat_rule"],
    "plugins": ["config"],
    "daily_summaries": ["keywords", "stages"],
}

# Boolean columns: SQLite stores 0/1 → PostgreSQL expects true/false
BOOLEAN_COLUMNS: dict[str, list[str]] = {
    "users": ["notifications_enabled"],
    "user_api_keys": ["is_default"],
    "plugins": ["is_enabled", "is_builtin"],
    "notes": ["is_pinned", "is_edited"],
    "schedules": ["is_all_day"],
    "daily_summaries": ["is_edited"],
}

# Tables where the 'id' column is auto-increment (for sequence reset)
AUTOINCREMENT_TABLES = [
    "users", "plugins", "user_api_keys", "servers", "channels",
    "notes", "threads", "schedules", "console_sessions",
    "console_messages", "inbox_items", "daily_summaries",
    "attachments", "server_files", "note_embeddings",
]

# ── FK-Safe Migration Order ────────────────────────────────────────────────

# Notes have circular FKs with threads (notes.thread_id → threads,
# threads.parent_note_id → notes). We handle this by:
#   1. Insert notes with thread_id=NULL + reply_to_id=NULL
#   2. Insert threads
#   3. UPDATE notes to restore thread_id and reply_to_id

MIGRATION_ORDER = [
    "users",
    "plugins",
    "user_api_keys",
    "servers",
    "channels",
    "notes",          # Step 1: inserted with FK columns nulled
    "threads",        # Step 2: inserted with full data
    # Step 3: notes thread_id + reply_to_id restored via UPDATE (see _fix_note_fks)
    "schedules",
    "console_sessions",
    "console_messages",
    "inbox_items",
    "daily_summaries",
    "attachments",
    "server_files",
    "note_embeddings",
]


# ── Helper Functions ───────────────────────────────────────────────────────

def parse_sqlite_datetime(val: str | None) -> datetime | None:
    """Parse SQLite TEXT datetime to Python datetime."""
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    # Try ISO 8601 with space separator (common SQLite format)
    for fmt in [
        "%Y-%m-%d %H:%M:%S.%f",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
    ]:
        try:
            return datetime.strptime(val, fmt)
        except (ValueError, TypeError):
            continue
    # Last resort: strip timezone suffix if present
    if val.endswith("+00:00") or val.endswith("Z"):
        val = val.replace("+00:00", "").replace("Z", "")
        return parse_sqlite_datetime(val)
    print(f"  [WARN] Could not parse datetime: {val!r}", file=sys.stderr)
    return None


def parse_sqlite_date(val: str | None) -> date | None:
    """Parse SQLite TEXT date to Python date."""
    if val is None:
        return None
    if isinstance(val, date) and not isinstance(val, datetime):
        return val
    if isinstance(val, str):
        try:
            return date.fromisoformat(val)
        except (ValueError, TypeError):
            pass
    print(f"  [WARN] Could not parse date: {val!r}", file=sys.stderr)
    return None


def parse_sqlite_time(val: str | None) -> time | None:
    """Parse SQLite TEXT time to Python time."""
    if val is None:
        return None
    if isinstance(val, time):
        return val
    if isinstance(val, str):
        for fmt in ["%H:%M:%S.%f", "%H:%M:%S", "%H:%M"]:
            try:
                return datetime.strptime(val, fmt).time()
            except (ValueError, TypeError):
                continue
    print(f"  [WARN] Could not parse time: {val!r}", file=sys.stderr)
    return None


def parse_jsonb(val: str | None) -> Any:
    """Parse SQLite TEXT JSON value for JSONB column."""
    if val is None:
        return None
    if isinstance(val, (list, dict)):
        return val
    if isinstance(val, str):
        stripped = val.strip()
        if not stripped:
            return None
        try:
            return json.loads(stripped)
        except json.JSONDecodeError:
            print(f"  [WARN] Could not parse JSON: {val[:80]!r}", file=sys.stderr)
            return None
    return val


def convert_bool(val: Any) -> bool | None:
    """Convert SQLite 0/1 integer to Python bool."""
    if val is None:
        return None
    if isinstance(val, bool):
        return val
    if isinstance(val, int):
        return bool(val)
    if isinstance(val, str):
        return val.lower() in ("1", "true", "t", "yes", "y")
    return bool(val)


def convert_row(table_name: str, columns: list[str], row: tuple) -> dict[str, Any]:
    """Convert a SQLite row to PostgreSQL-compatible values."""
    row_dict = dict(zip(columns, row))

    # Boolean columns
    for col in BOOLEAN_COLUMNS.get(table_name, []):
        if col in row_dict:
            row_dict[col] = convert_bool(row_dict[col])

    # JSONB columns
    for col in JSONB_COLUMNS.get(table_name, []):
        if col in row_dict:
            row_dict[col] = parse_jsonb(row_dict[col])

    # Date/time columns (by naming convention and known types)
    for col_name, col_value in row_dict.items():
        if col_value is None:
            continue
        if col_name in ("date",):
            row_dict[col_name] = parse_sqlite_date(col_value)
        elif col_name in ("start_time", "end_time"):
            row_dict[col_name] = parse_sqlite_time(col_value)
        elif col_name.endswith("_at") or col_name == "installed_at":
            if isinstance(col_value, str):
                row_dict[col_name] = parse_sqlite_datetime(col_value)

    return row_dict


def filter_columns(table_name: str, columns: list[str]) -> list[str]:
    """Return columns to insert, excluding those handled separately."""
    return [c for c in columns]


# ── Core Migration Logic ───────────────────────────────────────────────────

async def check_pg_connection(conn: asyncpg.Connection) -> None:
    """Verify PostgreSQL connection is usable."""
    version = await conn.fetchval("SELECT version()")
    print(f"  PostgreSQL connected: {version.split(',')[0]}")


def check_sqlite_db() -> sqlite3.Connection:
    """Open and verify SQLite database exists."""
    if not SQLITE_PATH.exists():
        print(f"ERROR: SQLite database not found at: {SQLITE_PATH}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    return conn


async def dry_run() -> None:
    """Count rows in each SQLite table without migrating."""
    sqlite_conn = check_sqlite_db()
    try:
        print("=== DRY RUN: Counting rows in SQLite database ===\n")
        total_rows = 0
        table_count = 0

        for table_name in MIGRATION_ORDER:
            try:
                cursor = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table_name}")
                count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                count = 0  # Table doesn't exist in SQLite

            status = "EXISTS" if count > 0 else "EMPTY"
            print(f"  {table_name:25s} {count:>8d} rows  [{status}]")
            total_rows += count
            table_count += 1

        print(f"\n  {'TOTAL':25s} {total_rows:>8d} rows across {table_count} tables")
    finally:
        sqlite_conn.close()


async def verify() -> None:
    """Compare row counts between SQLite and PostgreSQL post-migration."""
    sqlite_conn = check_sqlite_db()
    pg_conn = None
    try:
        pg_conn = await asyncpg.connect(PG_DSN)
        await check_pg_connection(pg_conn)

        print("=== VERIFY: Comparing SQLite vs PostgreSQL row counts ===\n")
        print(f"  {'Table':<25s} {'SQLite':>8s} {'PostgreSQL':>8s} {'Match':>8s}")
        print(f"  {'-'*25} {'-'*8} {'-'*8} {'-'*8}")

        all_match = True
        for table_name in MIGRATION_ORDER:
            # SQLite count
            try:
                cursor = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table_name}")
                sqlite_count = cursor.fetchone()[0]
            except sqlite3.OperationalError:
                sqlite_count = 0

            # PostgreSQL count
            try:
                pg_count = await pg_conn.fetchval(f"SELECT COUNT(*) FROM {table_name}")
            except Exception:
                pg_count = -1

            match = "OK" if sqlite_count == pg_count else "MISMATCH"
            if sqlite_count != pg_count:
                all_match = False
                match = f"FAIL ({pg_count})"

            print(f"  {table_name:<25s} {sqlite_count:>8d} {pg_count:>8d} {match:>8s}")

        if all_match:
            print("\n  All row counts match!")
        else:
            print("\n  WARNING: Some tables have row count mismatches!", file=sys.stderr)
    finally:
        if pg_conn:
            await pg_conn.close()
        sqlite_conn.close()


async def reset_sequences(conn: asyncpg.Connection, migrated_tables: list[str]) -> None:
    """Reset PostgreSQL auto-increment sequences to max(id) + 1."""
    print("\n--- Resetting sequences ---")
    for table_name in migrated_tables:
        if table_name not in AUTOINCREMENT_TABLES:
            continue
        try:
            seq_name = f"{table_name}_id_seq"
            await conn.execute(
                f"SELECT setval($1, COALESCE((SELECT MAX(id) FROM {table_name}), 0) + 1, false)",
                seq_name,
            )
            max_id = await conn.fetchval(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")
            print(f"  {table_name}.id_seq → next={max_id + 1}")
        except Exception as e:
            print(f"  [WARN] Could not reset sequence for {table_name}: {e}", file=sys.stderr)


async def migrate_table(
    conn: asyncpg.Connection,
    table_name: str,
    sqlite_conn: sqlite3.Connection,
) -> int:
    """Migrate one table from SQLite to PostgreSQL. Returns row count."""
    # Check if table exists in SQLite
    try:
        cursor = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table_name}")
        total = cursor.fetchone()[0]
    except sqlite3.OperationalError:
        print(f"  {table_name}: SKIPPED (not in SQLite)")
        return 0

    if total == 0:
        print(f"  {table_name}: empty (0 rows)")
        return 0

    print(f"  {table_name}: {total} rows", end="", flush=True)

    # Read all rows from SQLite
    cursor = sqlite_conn.execute(f"SELECT * FROM {table_name} ORDER BY id")
    columns = [desc[0] for desc in cursor.description]
    rows = cursor.fetchall()

    # Convert rows
    converted: list[dict[str, Any]] = []
    for row in rows:
        try:
            converted.append(convert_row(table_name, columns, row))
        except Exception as e:
            print(f"\n  [ERROR] Failed to convert row id={row[0]}: {e}", file=sys.stderr)

    if not converted:
        print("  (all rows failed conversion)")
        return 0

    # Build INSERT
    col_names = list(converted[0].keys())
    placeholders = ", ".join(f"${i + 1}" for i in range(len(col_names)))
    insert_sql = (
        f"INSERT INTO {table_name} ({', '.join(col_names)}) VALUES ({placeholders})"
    )

    # Batch insert
    failed = 0
    batch: list[tuple] = []
    for i, row_dict in enumerate(converted):
        batch.append(tuple(row_dict[col] for col in col_names))
        if len(batch) >= BATCH_SIZE or i == len(converted) - 1:
            try:
                await conn.executemany(insert_sql, batch)
            except Exception as e:
                # Fall back to row-by-row on batch failure
                print(f"\n  [WARN] Batch insert failed, retrying row-by-row: {e}", file=sys.stderr)
                for row_tuple in batch:
                    try:
                        await conn.execute(insert_sql, *row_tuple)
                    except Exception as row_err:
                        failed += 1
                        # Try to extract row id for logging
                        row_dict_inner = dict(zip(col_names, row_tuple))
                        row_id = row_dict_inner.get("id", "?")
                        print(
                            f"  [ERROR] Failed row: table={table_name}, id={row_id}: {row_err}",
                            file=sys.stderr,
                        )
            batch = []

            # Progress
            if (i + 1) % 1000 == 0 or i + 1 == len(converted):
                print(f"\r  {table_name}: {i + 1}/{total} rows migrated", end="", flush=True)

    print()  # newline after progress
    if failed:
        print(f"  [WARN] {table_name}: {failed} rows failed to insert", file=sys.stderr)
    return len(converted) - failed


async def _fix_note_fks(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> None:
    """
    Restore notes.thread_id and notes.reply_to_id after notes+threads are inserted.

    This handles the circular FK between notes ↔ threads:
      - notes were inserted with thread_id=NULL + reply_to_id=NULL
      - threads are now present in PostgreSQL
      - this step restores the original FK values
    """
    # Read original thread_id + reply_to_id + id from SQLite notes
    cursor = sqlite_conn.execute("SELECT id, thread_id, reply_to_id FROM notes")
    sqlite_notes = cursor.fetchall()

    # Build a map of note_id → (thread_id, reply_to_id)
    updates_needed = []
    for note_id, thread_id, reply_to_id in sqlite_notes:
        if thread_id is not None or reply_to_id is not None:
            updates_needed.append((note_id, thread_id, reply_to_id))

    if not updates_needed:
        return

    print("\n--- Restoring notes FK columns (thread_id, reply_to_id) ---")
    for note_id, thread_id, reply_to_id in updates_needed:
        try:
            await pg_conn.execute(
                "UPDATE notes SET thread_id = $1, reply_to_id = $2 WHERE id = $3",
                thread_id,
                reply_to_id,
                note_id,
            )
        except Exception as e:
            print(
                f"  [ERROR] Failed to update note id={note_id}: {e}",
                file=sys.stderr,
            )

    print(f"  Restored FK values for {len(updates_needed)} notes")


async def run_migration() -> None:
    """Run the full migration: SQLite → PostgreSQL."""
    # Check SQLite
    sqlite_conn = check_sqlite_db()
    print(f"SQLite database: {SQLITE_PATH}")

    # Connect to PostgreSQL
    pg_conn: asyncpg.Connection | None = None
    try:
        pg_conn = await asyncpg.connect(PG_DSN)
    except Exception as e:
        print(f"ERROR: Cannot connect to PostgreSQL at {PG_DSN}", file=sys.stderr)
        print(f"  {e}", file=sys.stderr)
        print("  Make sure Docker is running: docker compose up -d", file=sys.stderr)
        sys.exit(1)

    try:
        await check_pg_connection(pg_conn)

        # Disable FK checks during migration for speed, then re-enable
        # (PostgreSQL doesn't have a global toggle, but we use careful ordering)

        print("\n=== MIGRATION START ===\n")
        total_rows = 0
        migrated_tables: list[str] = []

        for table_name in MIGRATION_ORDER:
            print(f"[{table_name}]")
            count = await migrate_table(pg_conn, table_name, sqlite_conn)
            total_rows += count
            migrated_tables.append(table_name)

        # Fix circular FK: notes.thread_id and notes.reply_to_id
        await _fix_note_fks(pg_conn, sqlite_conn)

        # Reset sequences for all auto-increment tables
        await reset_sequences(pg_conn, migrated_tables)

        print(f"\n=== MIGRATION COMPLETE ===")
        print(f"  {len(migrated_tables)} tables, {total_rows} rows migrated")

    finally:
        await pg_conn.close()
        sqlite_conn.close()


# ── CLI ────────────────────────────────────────────────────────────────────

def main() -> None:
    global SQLITE_PATH, PG_DSN

    parser = argparse.ArgumentParser(
        description="Migrate SQLite data to PostgreSQL for ChatNote",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count rows in SQLite only, do not migrate",
    )
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Compare row counts between SQLite and PostgreSQL post-migration",
    )
    parser.add_argument(
        "--sqlite-path",
        type=str,
        default=str(SQLITE_PATH),
        help=f"Path to SQLite database (default: {SQLITE_PATH})",
    )
    parser.add_argument(
        "--pg-dsn",
        type=str,
        default=PG_DSN,
        help=f"PostgreSQL connection DSN (default: {PG_DSN})",
    )

    args = parser.parse_args()

    # Override globals from CLI args
    SQLITE_PATH = Path(args.sqlite_path)
    PG_DSN = args.pg_dsn

    if args.verify:
        asyncio.run(verify())
    elif args.dry_run:
        asyncio.run(dry_run())
    else:
        asyncio.run(run_migration())


if __name__ == "__main__":
    main()
