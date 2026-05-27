# Backend Scripts

## Quick Start with Docker

1. **Start PostgreSQL**:
   ```bash
   docker compose -f ../docker-compose.yml up -d
   ```

2. **Verify services are healthy**:
   ```bash
   docker compose -f ../docker-compose.yml ps
   ```
   PostgreSQL should show `healthy`.

3. **Configure environment**:
   ```bash
   cp ../.env.example ../.env
   # Edit .env with your OPENAI_API_KEY
   ```

4. **Run database migrations**:
   ```bash
   cd .. && alembic upgrade head
   ```

5. **Backfill embeddings**:
   ```bash
   python -m app.scripts.backfill_embeddings
   ```

6. **Start the backend**:
   ```bash
   uvicorn app.main:app --reload
   ```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://chatnote:changeme@localhost:5432/chatnote` | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | `changeme` | PostgreSQL password |
| `OPENAI_API_KEY` | (required) | OpenAI API key for embeddings |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model name |
| `EMBEDDING_DIMENSIONS` | `768` | Embedding vector dimensions |
| `MOONSHOT_API_KEY` | (optional) | Moonshot AI API key |

---

## Data Migration (Historical)

The one-time SQLite → PostgreSQL migration scripts (`migrate_sqlite_to_pg.py`, `verify_migration.py`) have been archived to `_archive/migration-scripts/`. The project now runs exclusively on PostgreSQL.

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
