# Backend Scripts

## Quick Start with Docker

1. **Start PostgreSQL + PgBouncer**:
   ```bash
   docker compose -f ../docker-compose.yml up -d
   ```

2. **Verify services are healthy**:
   ```bash
   docker compose -f ../docker-compose.yml ps
   ```
   Both `postgres` and `pgbouncer` should show `healthy`.

3. **Configure environment**:
   ```bash
   cp ../.env.example ../.env
   # Edit .env with your OPENAI_API_KEY
   ```

4. **Run database migrations**:
   ```bash
   cd .. && alembic upgrade head
   ```

5. **Migrate data** (if upgrading from SQLite):
   ```bash
   python scripts/migrate_sqlite_to_pg.py
   python scripts/migrate_sqlite_to_pg.py --verify
   ```

6. **Backfill embeddings**:
   ```bash
   python -m app.scripts.backfill_embeddings
   ```

7. **Start the backend**:
   ```bash
   uvicorn app.main:app --reload
   ```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://chatnote:changeme@localhost:6432/chatnote` | PostgreSQL connection string via PgBouncer |
| `POSTGRES_PASSWORD` | `changeme` | PostgreSQL password |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model name |
| `EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimensions |
| `MOONSHOT_API_KEY` | (optional) | Moonshot AI API key |

---

## Data Migration

### `migrate_sqlite_to_pg.py`

Migrate all data from SQLite to PostgreSQL. Handles type conversion, foreign key ordering, and sequence reset.

```bash
# Dry run — count rows in both databases without migrating
python scripts/migrate_sqlite_to_pg.py --dry-run

# Run the full migration
python scripts/migrate_sqlite_to_pg.py

# Verify after migration — compare row counts
python scripts/migrate_sqlite_to_pg.py --verify
```

**Options:**

| Option | Description |
|---|---|
| `--dry-run` | Count rows in SQLite only, no migration |
| `--verify` | Compare row counts between SQLite and PostgreSQL |
| `--sqlite-path PATH` | Custom SQLite database path (default: `../chatnote.db`) |
| `--pg-dsn DSN` | Custom PostgreSQL connection string |

### `verify_migration.py`

Comprehensive data integrity checks after migration. Runs six verification passes on all 14 user-facing tables.

```bash
python scripts/verify_migration.py
```

**Checks performed:**

1. Row count comparison — SQLite vs PostgreSQL for every table
2. Foreign key integrity — orphan detection across 16 FK relationships
3. JSON data validity — parses all JSONB columns for valid JSON
4. Boolean column integrity — confirms true/false values in PostgreSQL
5. Timestamp validity — datetime values within reasonable range (2020–2030)
6. Auto-increment ID consistency — MAX(id) matches across databases

**Options:**

| Option | Description |
|---|---|
| `--sqlite-path PATH` | Custom SQLite database path |
| `--pg-dsn DSN` | Custom PostgreSQL connection string |

A detailed JSON report is saved to `.sisyphus/evidence/migration-verification.json`.

---

## Embedding Backfill

### `app/scripts/backfill_embeddings.py`

Generate embeddings for all existing notes that lack one. Processes notes in batches and saves progress via checkpoint file.

```bash
# Count how many notes need embeddings
python -m app.scripts.backfill_embeddings --dry-run

# Run backfill (50 notes per batch)
python -m app.scripts.backfill_embeddings --batch-size 50

# Resume from last checkpoint after interruption
python -m app.scripts.backfill_embeddings --resume
```

**Options:**

| Option | Description |
|---|---|
| `--batch-size N` | Notes per batch (default: 50) |
| `--dry-run` | Count notes needing embeddings without generating any |
| `--resume` | Continue from last checkpoint in `.backfill_state.json` |
| `--model MODEL` | Override embedding model (default: `text-embedding-3-small`) |

**Requires:** `OPENAI_API_KEY` set in `.env`.

After completion, checkpoints are automatically cleaned up. If any notes fail, re-run with `--resume` to retry.
