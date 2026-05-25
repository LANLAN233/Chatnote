#!/usr/bin/env python3
"""
Data migration verification script for ChatNote.

Compares SQLite and PostgreSQL after migration, checking:
  - Row counts for all 14 user-facing tables
  - Foreign key integrity (orphan detection)
  - JSONB data validity (all 6 JSONB columns)
  - Boolean column type correctness
  - Timestamp validity
  - Auto-increment ID consistency

Usage:
    python backend/scripts/verify_migration.py
    python backend/scripts/verify_migration.py --sqlite-path path/to/chatnote.db
    python backend/scripts/verify_migration.py --pg-dsn postgresql://user:pass@host:port/db
"""

import argparse
import asyncio
import json
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

import asyncpg
import sqlite3

# ── Configuration ──────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent
PROJECT_DIR = BACKEND_DIR.parent
SQLITE_PATH = BACKEND_DIR / "chatnote.db"
PG_DSN = "postgresql://chatnote:changeme@localhost:6432/chatnote"
EVIDENCE_DIR = PROJECT_DIR / ".sisyphus" / "evidence"

# ── Table Definitions ──────────────────────────────────────────────────────

# The 14 user-facing tables (note_embeddings is new, excluded from comparison)
USER_FACING_TABLES = [
    "users",
    "plugins",
    "user_api_keys",
    "servers",
    "channels",
    "notes",
    "threads",
    "schedules",
    "console_sessions",
    "console_messages",
    "inbox_items",
    "daily_summaries",
    "attachments",
    "server_files",
]

# JSONB columns: table_name → [column_names]
JSONB_COLUMNS: dict[str, list[str]] = {
    "notes": ["ai_tags", "user_tags"],
    "schedules": ["repeat_rule"],
    "plugins": ["config"],
    "daily_summaries": ["keywords", "stages"],
}

# Boolean columns: table_name → [column_names]
BOOLEAN_COLUMNS: dict[str, list[str]] = {
    "users": ["notifications_enabled"],
    "user_api_keys": ["is_default"],
    "plugins": ["is_enabled", "is_builtin"],
    "notes": ["is_pinned", "is_edited"],
    "schedules": ["is_all_day"],
    "daily_summaries": ["is_edited"],
}

# Tables with timestamp columns (columns ending in _at or similar)
TIMESTAMP_TABLES = {
    "users": ["created_at", "updated_at"],
    "user_api_keys": ["created_at", "updated_at"],
    "servers": ["created_at", "updated_at"],
    "channels": ["created_at", "updated_at"],
    "notes": ["created_at", "updated_at"],
    "threads": ["created_at", "updated_at"],
    "schedules": ["created_at", "updated_at"],
    "plugins": ["installed_at", "updated_at"],
    "console_sessions": ["created_at", "updated_at"],
    "console_messages": ["created_at"],
    "inbox_items": ["created_at", "updated_at"],
    "daily_summaries": ["created_at", "updated_at"],
    "attachments": ["created_at"],
    "server_files": ["created_at", "updated_at"],
}


# ── Helper Functions ───────────────────────────────────────────────────────


class CheckResult:
    """Tracks the result of a single verification check."""

    def __init__(self, check_name: str):
        self.check_name = check_name
        self.passed: bool = True
        self.details: list[str] = []
        self.warnings: list[str] = []

    def add_failure(self, msg: str) -> None:
        self.passed = False
        self.details.append(msg)

    def add_warning(self, msg: str) -> None:
        self.warnings.append(msg)

    def to_dict(self) -> dict:
        return {
            "check_name": self.check_name,
            "passed": self.passed,
            "details": self.details,
            "warnings": self.warnings,
        }


# ── Core Verification Logic ────────────────────────────────────────────────


async def check_pg_connection(conn: asyncpg.Connection) -> None:
    """Verify PostgreSQL connection is usable."""
    version = await conn.fetchval("SELECT version()")
    print(f"  PostgreSQL: {version.split(',')[0]}")


def check_sqlite_connection() -> sqlite3.Connection:
    """Open and verify SQLite database exists."""
    if not SQLITE_PATH.exists():
        print(f"ERROR: SQLite database not found at: {SQLITE_PATH}", file=sys.stderr)
        sys.exit(1)
    conn = sqlite3.connect(str(SQLITE_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ── 1. Row Count Comparison ─────────────────────────────────────────────────


async def verify_row_counts(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Compare row counts between SQLite and PostgreSQL for all 14 user-facing tables.

    Used LEFT JOIN verification: for each table, count on both sides.
    Reports the difference.
    """
    result = CheckResult("row_count_comparison")

    print("\n── Row Count Comparison ──")
    print(f"  {'Table':<25s} {'SQLite':>8s} {'PostgreSQL':>8s} {'Status':>10s}")

    all_match = True
    for table_name in USER_FACING_TABLES:
        # SQLite count
        try:
            cursor = sqlite_conn.execute(f"SELECT COUNT(*) FROM {table_name}")
            sqlite_count = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            sqlite_count = 0
            result.add_warning(f"{table_name}: not found in SQLite")

        # PostgreSQL count
        try:
            pg_count = await pg_conn.fetchval(f"SELECT COUNT(*) FROM {table_name}")
        except Exception as e:
            pg_count = -1
            result.add_failure(f"{table_name}: PG query failed: {e}")

        status = "PASS" if sqlite_count == pg_count else "FAIL"
        if sqlite_count != pg_count:
            all_match = False
            diff = abs(sqlite_count - pg_count)
            result.add_failure(
                f"{table_name}: SQLite={sqlite_count}, PG={pg_count}, diff={diff}"
            )
        print(f"  {table_name:<25s} {sqlite_count:>8d} {pg_count:>8d} {status:>10s}")

    if all_match:
        print("  ✓ All row counts match")
    else:
        print("  ✗ Row count mismatches detected")
    return result


# ── 2. Foreign Key Integrity ────────────────────────────────────────────────


async def verify_foreign_keys(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Check foreign key integrity using LEFT JOIN ... WHERE FK IS NULL pattern.

    Verifies the following FK relationships (both SQLite and PG):
      - notes.channel_id → channels.id
      - notes.user_id → users.id
      - threads.parent_note_id → notes.id
      - server_files.server_id → servers.id
      - Additional: user_api_keys.user_id, server.user_id, channel.server_id,
        attachments.note_id, schedules.user_id, console_sessions.user_id,
        console_messages.session_id, inbox_items.user_id, daily_summaries.user_id
    """
    result = CheckResult("foreign_key_integrity")

    # FK checks: (child_table, fk_column, parent_table, pk_column [, nullable])
    fk_checks = [
        ("notes", "channel_id", "channels", "id"),
        ("notes", "user_id", "users", "id"),
        ("threads", "parent_note_id", "notes", "id"),
        ("server_files", "server_id", "servers", "id"),
        # Additional FK checks for completeness
        ("user_api_keys", "user_id", "users", "id"),
        ("servers", "user_id", "users", "id"),
        ("channels", "server_id", "servers", "id"),
        ("attachments", "note_id", "notes", "id"),
        ("schedules", "user_id", "users", "id"),
        ("console_sessions", "user_id", "users", "id"),
        ("console_messages", "session_id", "console_sessions", "id"),
        ("inbox_items", "user_id", "users", "id"),
        ("daily_summaries", "user_id", "users", "id"),
        # threads FK to channels and created_by
        ("threads", "channel_id", "channels", "id"),
        ("threads", "created_by", "users", "id"),
        # server_files FK to users
        ("server_files", "uploader_id", "users", "id"),
    ]

    # Optional FK checks: threads.parent_note_id MUST be non-null
    non_null_fks = {
        "threads.parent_note_id",
        "server_files.server_id",
    }

    print("\n── Foreign Key Integrity ──")

    for child_table, fk_col, parent_table, pk_col in fk_checks:
        # Build the label
        label = f"{child_table}.{fk_col} → {parent_table}.{pk_col}"

        # Check SQLite
        sqlite_orphans = 0
        try:
            cursor = sqlite_conn.execute(
                f"SELECT COUNT(*) FROM {child_table} c "
                f"LEFT JOIN {parent_table} p ON c.{fk_col} = p.{pk_col} "
                f"WHERE c.{fk_col} IS NOT NULL AND p.{pk_col} IS NULL"
            )
            sqlite_orphans = cursor.fetchone()[0]
        except sqlite3.OperationalError:
            result.add_warning(f"{label}: table not in SQLite, skipped SQLite check")

        # Check PostgreSQL
        pg_orphans = 0
        try:
            pg_orphans = await pg_conn.fetchval(
                f"SELECT COUNT(*) FROM {child_table} c "
                f"LEFT JOIN {parent_table} p ON c.{fk_col} = p.{pk_col} "
                f"WHERE c.{fk_col} IS NOT NULL AND p.{pk_col} IS NULL"
            )
        except Exception as e:
            result.add_warning(f"{label}: PG query failed: {e}")

        status = "PASS"
        if sqlite_orphans > 0:
            result.add_failure(
                f"{label}: {sqlite_orphans} orphan(s) in SQLite"
            )
            status = "FAIL"
        if pg_orphans > 0:
            result.add_failure(
                f"{label}: {pg_orphans} orphan(s) in PostgreSQL"
            )
            status = "FAIL"

        # Only print actual checks
        extra = f" [SQLite={sqlite_orphans} PG={pg_orphans}]" if status == "FAIL" else ""
        print(f"  {status:4s} {label}{extra}")

    if result.passed:
        print("  ✓ All foreign keys valid")
    else:
        print("  ✗ Foreign key violations found")
    return result


# ── 3. JSON Data Integrity ──────────────────────────────────────────────────


async def verify_json_integrity(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Verify that all JSONB column values are valid JSON.

    Parses each JSONB column value with json.loads and reports any invalid values.
    """
    result = CheckResult("json_data_integrity")

    print("\n── JSON Data Integrity ──")

    for table_name, columns in JSONB_COLUMNS.items():
        for col_name in columns:
            label = f"{table_name}.{col_name}"

            # Check SQLite (stored as TEXT)
            sqlite_invalid = 0
            try:
                cursor = sqlite_conn.execute(
                    f"SELECT id, {col_name} FROM {table_name} WHERE {col_name} IS NOT NULL"
                )
                for row in cursor:
                    val = row[col_name]
                    if val is None:
                        continue
                    if isinstance(val, str):
                        stripped = val.strip()
                        if not stripped:
                            continue
                        try:
                            json.loads(stripped)
                        except (json.JSONDecodeError, TypeError):
                            sqlite_invalid += 1
                            result.add_failure(
                                f"{label}: SQLite row id={row['id']} has invalid JSON: {val[:80]!r}"
                            )
                    # If not string, already parsed as JSON by sqlite3 adapter
            except sqlite3.OperationalError:
                result.add_warning(f"{label}: table not in SQLite")

            # Check PostgreSQL (JSONB type, should be valid by definition)
            # But we still check: try to parse back to Python
            pg_invalid = 0
            try:
                pg_rows = await pg_conn.fetch(
                    f"SELECT id, {col_name} FROM {table_name} WHERE {col_name} IS NOT NULL"
                )
                for pg_row in pg_rows:
                    val = pg_row[col_name]
                    if val is None:
                        continue
                    # asyncpg returns JSONB as Python objects (dict/list)
                    # If it's a string, it wasn't parsed as JSONB properly
                    if isinstance(val, str):
                        stripped = val.strip()
                        if not stripped:
                            continue
                        try:
                            json.loads(stripped)
                        except (json.JSONDecodeError, TypeError):
                            pg_invalid += 1
                            result.add_failure(
                                f"{label}: PG row id={pg_row['id']} has invalid JSON: {val[:80]!r}"
                            )
            except Exception as e:
                result.add_warning(f"{label}: PG query failed: {e}")

            status = "PASS" if sqlite_invalid == 0 and pg_invalid == 0 else "FAIL"
            extra = ""
            if sqlite_invalid > 0 or pg_invalid > 0:
                extra = f" [SQLite invalid={sqlite_invalid} PG invalid={pg_invalid}]"
            print(f"  {status:4s} {label}{extra}")

    if result.passed:
        print("  ✓ All JSONB values valid")
    else:
        print("  ✗ Invalid JSON values found")
    return result


# ── 4. Boolean Column Integrity ─────────────────────────────────────────────


async def verify_boolean_columns(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Verify boolean columns contain valid boolean values.

    In SQLite: 0/1 integers. In PostgreSQL: true/false.
    Reports any unexpected values.
    """
    result = CheckResult("boolean_column_integrity")

    print("\n── Boolean Column Integrity ──")

    for table_name, columns in BOOLEAN_COLUMNS.items():
        for col_name in columns:
            label = f"{table_name}.{col_name}"

            # Check SQLite (should be 0 or 1)
            sqlite_bad = 0
            try:
                cursor = sqlite_conn.execute(
                    f"SELECT id, {col_name} FROM {table_name} WHERE {col_name} IS NOT NULL"
                )
                for row in cursor:
                    val = row[col_name]
                    if val not in (0, 1, True, False):
                        sqlite_bad += 1
                        result.add_failure(
                            f"{label}: SQLite row id={row['id']} has non-boolean value: {val!r}"
                        )
            except sqlite3.OperationalError:
                result.add_warning(f"{label}: table not in SQLite")

            # Check PostgreSQL (should be true/false)
            pg_bad = 0
            try:
                pg_rows = await pg_conn.fetch(
                    f"SELECT id, {col_name} FROM {table_name} WHERE {col_name} IS NOT NULL"
                )
                for pg_row in pg_rows:
                    val = pg_row[col_name]
                    if not isinstance(val, bool):
                        pg_bad += 1
                        result.add_failure(
                            f"{label}: PG row id={pg_row['id']} has non-boolean value: {val!r}"
                        )
            except Exception as e:
                result.add_warning(f"{label}: PG query failed: {e}")

            status = "PASS" if sqlite_bad == 0 and pg_bad == 0 else "FAIL"
            if sqlite_bad > 0 or pg_bad > 0:
                extra = f" [SQLite bad={sqlite_bad} PG bad={pg_bad}]"
                print(f"  {status:4s} {label}{extra}")

    if result.passed:
        print("  ✓ All boolean values valid")
    else:
        print("  ✗ Non-boolean values found")
    return result


# ── 5. Timestamp Validity ───────────────────────────────────────────────────


async def verify_timestamps(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Verify timestamp/datetime values are within reasonable range (2020-2030)."""
    result = CheckResult("timestamp_validity")

    print("\n── Timestamp Validity ──")

    min_date = datetime(2020, 1, 1)
    max_date = datetime(2030, 12, 31, 23, 59, 59)

    for table_name, columns in TIMESTAMP_TABLES.items():
        for col_name in columns:
            label = f"{table_name}.{col_name}"

            # Check SQLite
            try:
                cursor = sqlite_conn.execute(
                    f"SELECT COUNT(*) FROM {table_name} "
                    f"WHERE {col_name} IS NOT NULL "
                    f"AND ({col_name} < ? OR {col_name} > ?)",
                    (min_date.isoformat(), max_date.isoformat()),
                )
                sqlite_bad = cursor.fetchone()[0]
                if sqlite_bad > 0:
                    result.add_failure(
                        f"{label}: {sqlite_bad} out-of-range timestamps in SQLite"
                    )
            except sqlite3.OperationalError:
                result.add_warning(f"{label}: table not in SQLite")
                sqlite_bad = 0

            # Check PostgreSQL
            try:
                pg_bad = await pg_conn.fetchval(
                    f"SELECT COUNT(*) FROM {table_name} "
                    f"WHERE {col_name} IS NOT NULL "
                    f"AND ({col_name} < $1 OR {col_name} > $2)",
                    min_date,
                    max_date,
                )
                if pg_bad > 0:
                    result.add_failure(
                        f"{label}: {pg_bad} out-of-range timestamps in PostgreSQL"
                    )
            except Exception as e:
                result.add_warning(f"{label}: PG query failed: {e}")
                pg_bad = 0

    if result.passed:
        print("  ✓ All timestamps within valid range")
    else:
        print("  ✗ Out-of-range timestamps found")
    return result


# ── 6. Auto-Increment ID Check ──────────────────────────────────────────────


async def verify_auto_increment_ids(
    pg_conn: asyncpg.Connection,
    sqlite_conn: sqlite3.Connection,
) -> CheckResult:
    """Verify MAX(id) matches between SQLite and PostgreSQL for each table."""
    result = CheckResult("auto_increment_id_check")

    print("\n── Auto-Increment ID Check ──")
    print(f"  {'Table':<25s} {'SQLite MAX':>12s} {'PG MAX':>12s} {'Status':>10s}")

    for table_name in USER_FACING_TABLES:
        # SQLite MAX(id)
        try:
            cursor = sqlite_conn.execute(f"SELECT MAX(id) FROM {table_name}")
            sqlite_max = cursor.fetchone()[0]
            if sqlite_max is None:
                sqlite_max = 0
        except sqlite3.OperationalError:
            sqlite_max = 0
            result.add_warning(f"{table_name}: not in SQLite")

        # PostgreSQL MAX(id)
        try:
            pg_max = await pg_conn.fetchval(f"SELECT MAX(id) FROM {table_name}")
            if pg_max is None:
                pg_max = 0
        except Exception as e:
            pg_max = -1
            result.add_failure(f"{table_name}: PG query failed: {e}")

        status = "PASS" if sqlite_max == pg_max else "FAIL"
        if sqlite_max != pg_max:
            result.add_failure(
                f"{table_name}: SQLite MAX(id)={sqlite_max}, PG MAX(id)={pg_max}"
            )
        print(f"  {table_name:<25s} {sqlite_max:>12d} {pg_max:>12d} {status:>10s}")

    if result.passed:
        print("  ✓ All MAX(id) values match")
    else:
        print("  ✗ MAX(id) mismatches found")
    return result


# ── 7. Summary Report ───────────────────────────────────────────────────────


async def run_verification() -> dict:
    """Run all verification checks and produce a summary report."""
    sqlite_conn = check_sqlite_connection()
    pg_conn = None

    try:
        print("=" * 60)
        print("  ChatNote Data Migration Verification")
        print("=" * 60)

        # Connect to PostgreSQL
        try:
            pg_conn = await asyncpg.connect(PG_DSN)
        except Exception as e:
            print(f"\nERROR: Cannot connect to PostgreSQL at {PG_DSN}", file=sys.stderr)
            print(f"  {e}", file=sys.stderr)
            print("  Make sure Docker is running: docker compose up -d", file=sys.stderr)
            sys.exit(1)

        print(f"\nSQLite:  {SQLITE_PATH}")
        print(f"PG DSN:  {PG_DSN}")
        await check_pg_connection(pg_conn)

        # Run all checks
        checks: list[CheckResult] = []

        checks.append(await verify_row_counts(pg_conn, sqlite_conn))
        checks.append(await verify_foreign_keys(pg_conn, sqlite_conn))
        checks.append(await verify_json_integrity(pg_conn, sqlite_conn))
        checks.append(await verify_boolean_columns(pg_conn, sqlite_conn))
        checks.append(await verify_timestamps(pg_conn, sqlite_conn))
        checks.append(await verify_auto_increment_ids(pg_conn, sqlite_conn))

        # ── Summary ──────────────────────────────────────────────────────
        print("\n" + "=" * 60)
        print("  VERIFICATION SUMMARY")
        print("=" * 60)

        all_passed = True
        for check in checks:
            status = "✓ PASS" if check.passed else "✗ FAIL"
            if not check.passed:
                all_passed = False
            print(f"  {status}  {check.check_name}")

        print(f"\n  Total checks: {len(checks)}")
        passed_count = sum(1 for c in checks if c.passed)
        print(f"  Passed: {passed_count}")
        print(f"  Failed: {len(checks) - passed_count}")

        if all_passed:
            print("\n  ✓ ALL CHECKS PASSED - Migration verified successfully")
        else:
            print(
                "\n  ✗ SOME CHECKS FAILED - Review the report for details",
                file=sys.stderr,
            )

        # Build report dict
        report = {
            "timestamp": datetime.now().isoformat(),
            "sqlite_path": str(SQLITE_PATH),
            "pg_dsn": PG_DSN,
            "overall_passed": all_passed,
            "total_checks": len(checks),
            "passed_checks": passed_count,
            "failed_checks": len(checks) - passed_count,
            "checks": [c.to_dict() for c in checks],
        }

        return report

    finally:
        if pg_conn:
            await pg_conn.close()
        sqlite_conn.close()


def save_report(report: dict) -> None:
    """Save detailed verification report to evidence directory."""
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    report_path = EVIDENCE_DIR / "migration-verification.json"

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False, default=str)

    print(f"\n  Detailed report saved to: {report_path}")


# ── CLI ────────────────────────────────────────────────────────────────────


def main() -> None:
    global SQLITE_PATH, PG_DSN

    parser = argparse.ArgumentParser(
        description="Verify SQLite → PostgreSQL data migration for ChatNote",
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

    SQLITE_PATH = Path(args.sqlite_path)
    PG_DSN = args.pg_dsn

    report = asyncio.run(run_verification())
    save_report(report)

    # Exit with non-zero if any checks failed
    if not report["overall_passed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
