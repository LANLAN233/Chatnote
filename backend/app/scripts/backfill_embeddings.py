"""
Backfill embeddings for all existing notes in PostgreSQL.

Usage:
    python -m app.scripts.backfill_embeddings --batch-size 50
    python -m app.scripts.backfill_embeddings --dry-run
    python -m app.scripts.backfill_embeddings --resume
    python -m app.scripts.backfill_embeddings --model text-embedding-3-small

This script processes notes that lack an embedding record in note_embeddings,
generates embeddings via OpenAI, and stores the results.
"""

import argparse
import asyncio
import json
import logging
import sys
import traceback
from pathlib import Path

from sqlalchemy import select, exists, or_

from app.config import settings
from app.database import async_session, init_db
from app.models.models import Note
from app.models.note_embedding import NoteEmbedding
from app.services.embedding import EmbeddingService

logger = logging.getLogger(__name__)

CHECKPOINT_FILE = Path(".backfill_state.json")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Backfill embeddings for all existing notes"
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=50,
        help="Number of notes to process per batch (default: 50)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Count notes needing embeddings without generating any",
    )
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume from last checkpoint in .backfill_state.json",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Override embedding model (default: text-embedding-3-small)",
    )
    return parser.parse_args()


def _get_notes_needing_embeddings(offset: int = 0, limit: int = 50):
    """Return a query selecting notes that lack an embedding record."""
    subq = select(NoteEmbedding.note_id).where(
        NoteEmbedding.note_id == Note.id
    )
    stmt = (
        select(Note.id, Note.content)
        .where(~exists(subq))
        .where(Note.content.isnot(None))
        .where(Note.content != "")
        .order_by(Note.id)
        .offset(offset)
        .limit(limit)
    )
    return stmt


async def _count_notes_needing_embeddings(session) -> int:
    """Count how many notes lack an embedding record."""
    subq = select(NoteEmbedding.note_id).where(
        NoteEmbedding.note_id == Note.id
    )
    stmt = (
        select(Note.id)
        .where(~exists(subq))
        .where(Note.content.isnot(None))
        .where(Note.content != "")
    )
    result = await session.execute(stmt)
    rows = result.scalars().all()
    return len(rows)


async def _store_embeddings(session, note_ids: list[int], embeddings: list[list[float] | None], model: str) -> tuple[int, list[int]]:
    """Insert NoteEmbedding records. Returns (stored_count, failed_ids)."""
    stored = 0
    failed = []

    for note_id, emb in zip(note_ids, embeddings):
        if emb is None:
            failed.append(note_id)
            continue
        try:
            record = NoteEmbedding(
                note_id=note_id,
                embedding=emb,
                embedding_model=model,
            )
            session.add(record)
            stored += 1
        except Exception as e:
            logger.error(f"Failed to store embedding for note {note_id}: {e}")
            failed.append(note_id)

    try:
        await session.commit()
    except Exception as e:
        logger.error(f"Commit failed: {e}")
        await session.rollback()
        # All notes in this batch are considered failed on commit error
        failed = list(note_ids)
        stored = 0

    return stored, failed


def _load_checkpoint() -> dict | None:
    """Load checkpoint from .backfill_state.json if it exists."""
    if not CHECKPOINT_FILE.exists():
        return None
    try:
        return json.loads(CHECKPOINT_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Could not read checkpoint file: {e}")
        return None


def _save_checkpoint(last_processed_id: int, failed_ids: list[int], total_processed: int, model: str):
    """Save progress to .backfill_state.json."""
    state = {
        "last_processed_id": last_processed_id,
        "failed_ids": failed_ids,
        "total_processed": total_processed,
        "model": model,
    }
    CHECKPOINT_FILE.write_text(json.dumps(state, indent=2), encoding="utf-8")


def _clear_checkpoint():
    """Remove checkpoint file on successful completion."""
    try:
        CHECKPOINT_FILE.unlink(missing_ok=True)
    except OSError:
        pass


async def main_async() -> None:
    args = parse_args()

    # Validate arguments
    if args.batch_size < 1:
        print("Error: --batch-size must be >= 1", file=sys.stderr)
        sys.exit(1)

    # Override model if specified
    model = args.model or settings.EMBEDDING_MODEL
    if args.model:
        EmbeddingService._model = args.model

    # Check OpenAI API key
    if not settings.OPENAI_API_KEY:
        if args.dry_run:
            # Dry run doesn't need API key — just counts
            pass
        else:
            print("OPENAI_API_KEY not set. Embeddings cannot be generated.")
            print("Set it in .env or environment variable, then re-run.")
            sys.exit(0)

    # Initialize DB (creates pgvector extension + tables if needed)
    try:
        await init_db()
    except Exception as e:
        print(f"Error: Cannot connect to PostgreSQL: {e}", file=sys.stderr)
        print("Hint: Is Docker running? Try: docker compose up -d", file=sys.stderr)
        sys.exit(1)

    async with async_session() as session:
        # Count total notes needing embeddings
        total = await _count_notes_needing_embeddings(session)

        if args.dry_run:
            print(f"Dry run: {total} notes need embeddings")
            print(f"Model: {model}")
            print(f"Batch size: {args.batch_size}")
            batches = (total + args.batch_size - 1) // args.batch_size if total > 0 else 0
            print(f"Estimated batches: {batches}")
            return

        if total == 0:
            print("All notes already have embeddings. Nothing to do.")
            _clear_checkpoint()
            return

        print(f"Found {total} notes needing embeddings")
        print(f"Model: {model}, Batch size: {args.batch_size}")

        # Load checkpoint if resuming
        checkpoint = _load_checkpoint() if args.resume else None
        all_failed_ids: list[int] = []
        total_processed = 0
        last_processed_id = 0

        if checkpoint:
            last_processed_id = checkpoint.get("last_processed_id", 0)
            all_failed_ids = checkpoint.get("failed_ids", [])
            total_processed = checkpoint.get("total_processed", 0)
            print(f"Resuming from checkpoint: last_processed_id={last_processed_id}, "
                  f"already processed={total_processed}")

        # Process in batches
        offset = 0
        batch_num = 0
        total_batches = (total + args.batch_size - 1) // args.batch_size

        while offset < total:
            batch_num += 1

            # Fetch batch of notes
            stmt = _get_notes_needing_embeddings(offset=offset, limit=args.batch_size)

            # If resuming, skip already-processed notes but retry failed ones
            if checkpoint and last_processed_id:
                conditions = [Note.id > last_processed_id]
                if all_failed_ids:
                    conditions.append(Note.id.in_(all_failed_ids))
                stmt = stmt.where(or_(*conditions))

            result = await session.execute(stmt)
            rows = result.all()  # list of (id, content) tuples

            if not rows:
                break

            note_ids = [row[0] for row in rows]
            contents = [row[1] for row in rows]

            batch_start_idx = offset + 1
            batch_end_idx = offset + len(rows)

            print(f"Processing batch {batch_num}/{total_batches} — "
                  f"notes {batch_start_idx}-{batch_end_idx} of {total} total")

            try:
                # Generate embeddings
                embeddings = await EmbeddingService.generate_embeddings_batch(
                    contents, batch_size=min(100, len(contents))
                )

                # Store results
                stored, failed = await _store_embeddings(
                    session, note_ids, embeddings, model
                )
                total_processed += stored

                # Remove successfully-retried notes from failed_ids
                retried_ids = set(note_ids) & set(all_failed_ids)
                retried_success = retried_ids - set(failed)
                if retried_success:
                    all_failed_ids = [fid for fid in all_failed_ids if fid not in retried_success]

                all_failed_ids.extend(failed)

                # Update last processed ID
                last_processed_id = note_ids[-1]

                # Save checkpoint
                _save_checkpoint(last_processed_id, all_failed_ids, total_processed, model)

                if failed:
                    logger.warning(f"Batch {batch_num}: {stored} stored, {len(failed)} failed — "
                                   f"failed note IDs: {failed}")

            except Exception as e:
                logger.error(f"Batch {batch_num} failed with error: {e}")
                all_failed_ids.extend(note_ids)
                _save_checkpoint(
                    last_processed_id, all_failed_ids, total_processed, model
                )
                print(f"Error processing batch {batch_num}: {e}")
                print("Checkpoint saved. Re-run with --resume to continue.")
                traceback.print_exc()

            offset += args.batch_size

            # Rate limiting between batches (0.5s)
            if offset < total:
                await asyncio.sleep(0.5)

        # Summary
        print()
        print("=" * 50)
        print("BACKFILL COMPLETE")
        print("=" * 50)
        print(f"  Embeddings created: {total_processed}")
        print(f"  Failed:              {len(all_failed_ids)}")
        if all_failed_ids:
            print(f"  Failed note IDs:     {all_failed_ids}")
        print(f"  Skipped (no content): {total - total_processed - len(all_failed_ids)}")
        print(f"  Model used:          {model}")

        if all_failed_ids:
            print()
            print("Some notes failed. Re-run with --resume to retry.")
        else:
            _clear_checkpoint()


def main():
    """Entry point for CLI."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    asyncio.run(main_async())


if __name__ == "__main__":
    main()
