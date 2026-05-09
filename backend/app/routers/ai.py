import json
import logging
import time
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.classification import classify_note, resolve_classification
from app.database import get_db
from app.models.models import Channel, DailySummary, InboxItem, Note, Server, User
from app.routers.auth import get_current_user
from app.schemas.ai_progress import AiProgressStage
from app.schemas.schemas import (
    ApiResponse,
    ClassifyRequest,
    ClassifyResponse,
    DailySummaryUpdate,
    NoteCreateWithClassify,
    NoteResponse,
    ScheduleImportRequest,
)
from app.services.parser import parse_input
from app.services.websocket import manager

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])


@router.post("/api/ai/classify", response_model=ApiResponse)
async def ai_classify(
    req: ClassifyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await classify_note(req.content, db, current_user.id)
    return ApiResponse(success=True, data=result)


@router.post("/api/notes/smart-create", response_model=ApiResponse, status_code=201)
async def smart_create_note(
    req: NoteCreateWithClassify,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    parsed = parse_input(req.content)

    if req.server_name:
        parsed.server_name = req.server_name
    if req.channel_name:
        parsed.channel_name = req.channel_name

    server_id = None
    channel_id = None

    # If user is inside a channel and did NOT explicitly write @Server #Channel,
    # pin the note to the current channel so it never "disappears" elsewhere.
    has_explicit_target = bool(parsed.server_name or parsed.channel_name)
    if not has_explicit_target and req.channel_id:
        ch_result = await db.execute(
            select(Channel).where(Channel.id == req.channel_id)
        )
        channel = ch_result.scalar_one_or_none()
        if channel:
            channel_id = channel.id
            server_id = channel.server_id

    if not channel_id and (parsed.server_name or parsed.channel_name):
        if parsed.server_name:
            srv_result = await db.execute(
                select(Server).where(
                    Server.name == parsed.server_name,
                    Server.user_id == current_user.id,
                )
            )
            server = srv_result.scalar_one_or_none()
            if not server:
                server = Server(user_id=current_user.id, name=parsed.server_name)
                db.add(server)
                await db.flush()
                await db.refresh(server)
            server_id = server.id
        else:
            srv_result = await db.execute(
                select(Server)
                .where(Server.user_id == current_user.id)
                .order_by(Server.sort_order)
                .limit(1)
            )
            server = srv_result.scalar_one_or_none()
            if server:
                server_id = server.id

        if parsed.channel_name and server_id:
            ch_result = await db.execute(
                select(Channel).where(
                    Channel.server_id == server_id,
                    Channel.name == parsed.channel_name,
                )
            )
            channel = ch_result.scalar_one_or_none()
            if not channel:
                channel = Channel(server_id=server_id, name=parsed.channel_name)
                db.add(channel)
                await db.flush()
                await db.refresh(channel)
            channel_id = channel.id
        elif server_id:
            ch_result = await db.execute(
                select(Channel)
                .where(Channel.server_id == server_id)
                .order_by(Channel.sort_order)
                .limit(1)
            )
            channel = ch_result.scalar_one_or_none()
            if channel:
                channel_id = channel.id
    elif not channel_id and req.auto_classify:
        classification = await classify_note(
            parsed.content, db, current_user.id,
        )
        classification = await resolve_classification(classification, db, current_user.id)
        server_id = classification.get("server_id")
        channel_id = classification.get("channel_id")
    elif not channel_id:
        srv_result = await db.execute(
            select(Server)
            .where(Server.user_id == current_user.id)
            .order_by(Server.sort_order)
            .limit(1)
        )
        server = srv_result.scalar_one_or_none()
        if server:
            server_id = server.id
            ch_result = await db.execute(
                select(Channel)
                .where(Channel.server_id == server.id)
                .order_by(Channel.sort_order)
                .limit(1)
            )
            channel = ch_result.scalar_one_or_none()
            if channel:
                channel_id = channel.id

    if not channel_id:
        if not server_id:
            server = Server(user_id=current_user.id, name="General")
            db.add(server)
            await db.flush()
            await db.refresh(server)
            server_id = server.id
        channel = Channel(server_id=server_id, name="General")
        db.add(channel)
        await db.flush()
        await db.refresh(channel)
        channel_id = channel.id

    note = Note(
        channel_id=channel_id,
        user_id=current_user.id,
        content=parsed.content,
        content_type="markdown",
        raw_input=parsed.raw_input or req.content,
    )
    db.add(note)
    await db.flush()
    await db.refresh(note)
    await db.refresh(note, ["attachments"])

    return ApiResponse(
        success=True,
        data={
            "note": NoteResponse.model_validate(note).model_dump(),
            "server_id": server_id,
            "channel_id": channel_id,
        },
        message="Note created",
    )


@router.get("/api/stats", response_model=ApiResponse)
async def get_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from datetime import date, datetime, timedelta

    server_count = await db.execute(
        select(func.count()).select_from(Server).where(Server.user_id == current_user.id)
    )
    channel_count = await db.execute(
        select(func.count())
        .select_from(Channel)
        .join(Server, Channel.server_id == Server.id)
        .where(Server.user_id == current_user.id)
    )
    note_count = await db.execute(
        select(func.count()).select_from(Note).where(Note.user_id == current_user.id)
    )
    from sqlalchemy.orm import joinedload, selectinload
    recent_result = await db.execute(
        select(Note)
        .options(joinedload(Note.channel), selectinload(Note.attachments))
        .where(Note.user_id == current_user.id)
        .order_by(Note.created_at.desc())
        .limit(10)
    )
    recent_notes = recent_result.scalars().all()

    # --- study streak ---
    streak = 0
    streak_result = await db.execute(
        select(func.date(Note.created_at))
        .where(Note.user_id == current_user.id)
        .group_by(func.date(Note.created_at))
        .order_by(func.date(Note.created_at).desc())
    )
    note_date_strs = [d[0] for d in streak_result.all()]
    note_dates = []
    for ds in note_date_strs:
        try:
            note_dates.append(datetime.strptime(str(ds), "%Y-%m-%d").date())
        except Exception:
            pass
    if note_dates:
        today = date.today()
        # Start from today or yesterday (either counts as active)
        check_date = today
        if note_dates[0] < today - timedelta(days=1):
            check_date = today - timedelta(days=1)
        for d in note_dates:
            if d == check_date:
                streak += 1
                check_date -= timedelta(days=1)
            elif d < check_date:
                break

    # --- weekly trend (last 7 days) ---
    weekly_trend = []
    for i in range(6, -1, -1):
        d = date.today() - timedelta(days=i)
        count_result = await db.execute(
            select(func.count())
            .select_from(Note)
            .where(
                Note.user_id == current_user.id,
                func.date(Note.created_at) == d,
            )
        )
        weekly_trend.append({
            "date": d.isoformat(),
            "count": count_result.scalar() or 0,
        })

    # --- server distribution ---
    server_dist_result = await db.execute(
        select(Server.name, func.count(Note.id))
        .join(Channel, Channel.server_id == Server.id)
        .join(Note, Note.channel_id == Channel.id)
        .where(Server.user_id == current_user.id)
        .group_by(Server.id, Server.name)
        .order_by(func.count(Note.id).desc())
    )
    server_distribution = [
        {"server_name": name, "note_count": cnt}
        for name, cnt in server_dist_result.all()
    ]

    # --- top tags ---
    top_tags = []
    tags_result = await db.execute(
        select(Note.ai_tags)
        .where(Note.user_id == current_user.id, Note.ai_tags.isnot(None))
    )
    tag_counts: dict[str, int] = {}
    for (tags_json,) in tags_result.all():
        if not tags_json:
            continue
        try:
            tags = json.loads(tags_json)
            if isinstance(tags, list):
                for t in tags:
                    tag_counts[str(t)] = tag_counts.get(str(t), 0) + 1
        except Exception:
            continue
    top_tags = [
        {"tag": tag, "count": cnt}
        for tag, cnt in sorted(tag_counts.items(), key=lambda x: -x[1])[:10]
    ]

    # --- yesterday notes ---
    yesterday = date.today() - timedelta(days=1)
    yest_result = await db.execute(
        select(Note)
        .options(selectinload(Note.attachments))
        .where(
            Note.user_id == current_user.id,
            func.date(Note.created_at) == yesterday,
        )
        .order_by(Note.created_at.desc())
    )
    yesterday_notes = yest_result.scalars().all()

    # --- inbox pending count ---
    inbox_result = await db.execute(
        select(func.count())
        .select_from(InboxItem)
        .where(InboxItem.user_id == current_user.id, InboxItem.status == "pending")
    )
    inbox_pending_count = inbox_result.scalar() or 0

    return ApiResponse(
        success=True,
        data={
            "total_servers": server_count.scalar() or 0,
            "total_channels": channel_count.scalar() or 0,
            "total_notes": note_count.scalar() or 0,
            "study_streak": streak,
            "weekly_trend": weekly_trend,
            "server_distribution": server_distribution,
            "top_tags": top_tags,
            "yesterday_notes": [
                NoteResponse.model_validate(n).model_dump() for n in yesterday_notes
            ],
            "inbox_pending_count": inbox_pending_count,
            "recent_notes": [
                {
                    **NoteResponse.model_validate(n).model_dump(),
                    "channel_name": n.channel.name if n.channel else "Unknown",
                    "server_id": n.channel.server_id if n.channel else 0,

                }
                for n in recent_notes
            ],
        },
    )


@router.post("/api/ai/import-schedule", response_model=ApiResponse)
async def import_schedule(
    req: ScheduleImportRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Parse course syllabus / schedule text (and optionally image) into structured suggestions.

    When the user uploads an image but their default provider lacks real vision
    capability (e.g., deepseek), the endpoint automatically switches to Kimi k2.5
    (via Agno, or raw SDK as fallback).
    """
    from app.ai.models import get_model_for_user, has_real_vision, get_kimi_vision_model, get_kimi_vision_model_sdk, _infer_provider_from_model
    from app.ai.schedule import _call_kimi_vision_sdk, parse_schedule_import

    has_image = bool(req.image_url)
    model = await get_model_for_user(current_user.id, db, use_vision=has_image)

    # ── Auto-switch/fallback for image imports ─
    if has_image:
        provider = _infer_provider_from_model(model) or current_user.preferred_llm or "deepseek"

        # Determine if we need Kimi fallback
        need_kimi = (model is None) or (not has_real_vision(provider))

        if need_kimi:
            logger.info(
                "Image import: model=%s provider=%s real_vision=%s → trying Kimi k2.5",
                "None" if model is None else model.id,
                provider,
                has_real_vision(provider),
            )
            # Emit provider_switch progress event
            op_id = f"import_schedule_{current_user.id}_{int(time.time())}"
            await manager.broadcast_ai_progress(
                user_id=current_user.id,
                operation_id=op_id,
                stage_data=AiProgressStage(
                    stage="provider_switch",
                    status="fallback",
                    model="kimi",
                    tier="fallback",
                    message="Switching to Kimi for image import",
                    metadata={"original_provider": provider, "reason": "no_real_vision" if model and not has_real_vision(provider) else "no_model_configured"},
                ),
            )
            # Prefer raw SDK path — Kimi doesn't support Agno's structured_outputs (JSON schema)
            kimi_client = get_kimi_vision_model_sdk()
            if kimi_client:
                logger.info("Using raw SDK path for Kimi k2.5 vision")
                result = await _call_kimi_vision_sdk(req.text, req.image_url, kimi_client)
                return ApiResponse(success=True, data=result)

            # Raw SDK unavailable — fall back to Agno path
            kimi_model = get_kimi_vision_model()
            if kimi_model:
                result = await parse_schedule_import(req.text, req.image_url, kimi_model)
                return ApiResponse(success=True, data=result)

            # No MOONSHOT_API_KEY configured
            return ApiResponse(
                success=False,
                data={
                    "servers": [],
                    "schedules": [],
                    "suggestions": [
                        {
                            "type": "error",
                            "target_server": None,
                            "message": "图片识别需要 Kimi 视觉模型支持。请在服务器 .env 配置 MOONSHOT_API_KEY，或使用支持视觉识别的模型（如 GPT-4o、智谱 GLM-4V、通义千问 VL）。",
                        }
                    ],
                },
                message="图片识别不可用",
            )

    result = await parse_schedule_import(req.text, req.image_url, model)
    return ApiResponse(success=True, data=result)


@router.get("/api/daily-summary", response_model=ApiResponse)
async def daily_summary(
    date: str | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Generate a daily learning summary for the given date (default: yesterday)."""
    from datetime import date as dt_date, timedelta
    from app.ai.daily_summary import generate_daily_summary_pipeline

    target_date: dt_date | None = None
    if date:
        try:
            target_date = dt_date.fromisoformat(date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    effective_date = target_date or (dt_date.today() - timedelta(days=1))

    # CHECK DB CACHE FIRST — return immediately if cached version exists
    # BUT skip cache if the cached entry is a fallback (non-AI result)
    # so the user always gets a fresh AI generation attempt
    stmt = select(DailySummary).where(
        DailySummary.user_id == current_user.id,
        DailySummary.date == effective_date,
    )
    cached = (await db.execute(stmt)).scalar_one_or_none()
    if cached and cached.summary and not cached.summary.startswith("⚠️") and not cached.summary.startswith("You recorded") and not cached.summary.startswith("No notes recorded"):
        import json as _json
        keywords = _json.loads(cached.keywords) if cached.keywords else []
        stages = _json.loads(cached.stages) if cached.stages else []
        return ApiResponse(success=True, data={
            "summary": cached.summary,
            "keywords": keywords,
            "total_notes": cached.total_notes,
            "highlight_note_id": cached.highlight_note_id,
            "stages": stages,
            "is_edited": cached.is_edited,
            "created_at": cached.created_at.isoformat() if cached.created_at else None,
            "updated_at": cached.updated_at.isoformat() if cached.updated_at else None,
        })

    # If cached entry is a fallback, delete it so pipeline can create a fresh one
    if cached:
        logger.info("Deleting stale fallback cache for user %d date %s", current_user.id, effective_date)
        await db.delete(cached)
        await db.commit()

    # NO CACHE — run pipeline and save result
    operation_id = f"daily_summary_{current_user.id}_{effective_date}"
    result = await generate_daily_summary_pipeline(
        current_user.id, db, target_date, operation_id
    )

    # Persist ONLY non-fallback results to database
    is_fallback = result.get("is_fallback", False)
    if result.get("total_notes", 0) > 0 and not is_fallback:
        stmt2 = select(DailySummary).where(
            DailySummary.user_id == current_user.id,
            DailySummary.date == effective_date,
        )
        existing = (await db.execute(stmt2)).scalar_one_or_none()
        keywords_json = json.dumps(result.get("keywords", []), ensure_ascii=False)
        stages_json = json.dumps(result.get("stages", []), ensure_ascii=False)

        if existing:
            existing.summary = result.get("summary", "")
            existing.keywords = keywords_json
            existing.total_notes = result.get("total_notes", 0)
            existing.highlight_note_id = result.get("highlight_note_id")
            existing.stages = stages_json
            existing.is_edited = False
        else:
            ds = DailySummary(
                user_id=current_user.id,
                date=effective_date,
                summary=result.get("summary", ""),
                keywords=keywords_json,
                total_notes=result.get("total_notes", 0),
                highlight_note_id=result.get("highlight_note_id"),
                stages=stages_json,
            )
            db.add(ds)
        await db.commit()
    elif is_fallback:
        logger.info("Skipping DB persist for fallback result (user %d, date %s)", current_user.id, effective_date)

    return ApiResponse(success=True, data=result)


@router.post("/api/daily-summary/regenerate", response_model=ApiResponse)
async def daily_summary_regenerate(
    date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Regenerate the daily summary for a given date (overwrites existing)."""
    from datetime import date as dt_date
    from app.ai.daily_summary import generate_daily_summary_pipeline

    try:
        target_date = dt_date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if target_date > dt_date.today():
        raise HTTPException(status_code=400, detail="Cannot regenerate for future dates")

    # Check if there are notes for this date
    from app.models.models import DailySummary, Note

    note_count_stmt = select(func.count()).select_from(Note).where(
        Note.user_id == current_user.id,
        func.date(Note.created_at) == target_date,
    )
    count_result = await db.execute(note_count_stmt)
    note_count = count_result.scalar()

    if note_count == 0:
        return ApiResponse(success=True, data={"message": "No notes found for this date", "summary": None})

    operation_id = f"daily_summary_regenerate_{current_user.id}_{target_date}"
    result = await generate_daily_summary_pipeline(current_user.id, db, target_date, operation_id)

    # Upsert result to DB — only persist non-fallback (genuine AI) results
    is_fallback = result.get("is_fallback", False)
    if not is_fallback:
        import json

        stmt = select(DailySummary).where(
            DailySummary.user_id == current_user.id,
            DailySummary.date == target_date,
        )
        existing = (await db.execute(stmt)).scalar_one_or_none()

        if existing:
            existing.summary = result.get("summary", "")
            existing.keywords = json.dumps(result.get("keywords", []), ensure_ascii=False)
            existing.total_notes = result.get("total_notes", 0)
            existing.highlight_note_id = result.get("highlight_note_id")
            existing.stages = json.dumps(result.get("stages", []), ensure_ascii=False)
            existing.is_edited = False
        else:
            ds = DailySummary(
                user_id=current_user.id,
                date=target_date,
                summary=result.get("summary", ""),
                keywords=json.dumps(result.get("keywords", []), ensure_ascii=False),
                total_notes=result.get("total_notes", 0),
                highlight_note_id=result.get("highlight_note_id"),
                stages=json.dumps(result.get("stages", []), ensure_ascii=False),
            )
            db.add(ds)
        await db.commit()
    else:
        logger.info("Regenerate: skipping DB persist for fallback result (user %d, date %s)", current_user.id, target_date)

    return ApiResponse(success=True, data=result)


@router.put("/api/daily-summary", response_model=ApiResponse)
async def daily_summary_edit(
    date: str,
    body: DailySummaryUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Edit the summary text for a given date."""
    from datetime import date as dt_date

    try:
        target_date = dt_date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if target_date > dt_date.today():
        raise HTTPException(status_code=400, detail="Cannot edit future dates")

    from app.models.models import DailySummary

    stmt = select(DailySummary).where(
        DailySummary.user_id == current_user.id,
        DailySummary.date == target_date,
    )
    result = await db.execute(stmt)
    ds = result.scalar_one_or_none()

    if not ds:
        raise HTTPException(status_code=404, detail="No summary found for this date")

    ds.summary = body.summary
    ds.is_edited = True
    await db.commit()
    await db.refresh(ds)

    return ApiResponse(success=True, data={
        "id": ds.id,
        "date": ds.date.isoformat(),
        "summary": ds.summary,
        "total_notes": ds.total_notes,
        "is_edited": ds.is_edited,
        "created_at": ds.created_at.isoformat() if ds.created_at else None,
        "updated_at": ds.updated_at.isoformat() if ds.updated_at else None,
    })


@router.get("/api/daily-summary/history", response_model=ApiResponse)
async def daily_summary_history(
    from_date: str,
    to_date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List daily summaries in a date range (lightweight, no full summary text)."""
    from datetime import date as dt_date

    try:
        f = dt_date.fromisoformat(from_date)
        t = dt_date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if f > t:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")

    if t > dt_date.today():
        raise HTTPException(status_code=400, detail="Cannot query future dates")

    from app.models.models import DailySummary

    stmt = (
        select(DailySummary)
        .where(DailySummary.user_id == current_user.id)
        .where(DailySummary.date >= f)
        .where(DailySummary.date <= t)
        .order_by(DailySummary.date.desc())
    )
    result = await db.execute(stmt)
    summaries = result.scalars().all()

    data = [
        {
            "date": s.date.isoformat(),
            "total_notes": s.total_notes,
            "is_edited": s.is_edited,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in summaries
    ]
    return ApiResponse(success=True, data=data)


@router.get("/api/daily-summary/export/pdf")
async def daily_summary_export_pdf(
    date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a daily summary as a PDF file."""
    from datetime import date as dt_date
    from io import BytesIO
    from fpdf import FPDF

    try:
        target_date = dt_date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if target_date > dt_date.today():
        raise HTTPException(status_code=400, detail="Cannot export future dates")

    from app.models.models import DailySummary
    import json

    stmt = select(DailySummary).where(
        DailySummary.user_id == current_user.id,
        DailySummary.date == target_date,
    )
    result = await db.execute(stmt)
    ds = result.scalar_one_or_none()

    if not ds:
        raise HTTPException(status_code=404, detail="No summary found for this date")

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)

    # Title
    pdf.set_font("Helvetica", "B", 16)
    title = f"Daily Summary - {target_date.isoformat()}"
    pdf.cell(0, 10, title, ln=True, align="C")
    pdf.ln(10)

    # Summary content
    pdf.set_font("Helvetica", "", 11)
    summary_text = (ds.summary or "")[:3000]
    pdf.multi_cell(0, 6, summary_text)
    pdf.ln(5)

    # Metadata
    pdf.set_font("Helvetica", "I", 9)
    keywords = json.loads(ds.keywords) if ds.keywords else []
    if isinstance(keywords, list):
        keyword_text = ", ".join(
            k.get("keyword", k) if isinstance(k, dict) else str(k) for k in keywords
        )
    else:
        keyword_text = str(keywords)
    pdf.cell(0, 6, f"Keywords: {keyword_text or 'None'}", ln=True)
    pdf.cell(0, 6, f"Notes: {ds.total_notes}", ln=True)
    pdf.cell(0, 6, f"Generated: {ds.created_at.isoformat() if ds.created_at else 'N/A'}", ln=True)
    pdf.cell(0, 6, f"Edited: {'Yes' if ds.is_edited else 'No'}", ln=True)

    pdf_output = pdf.output()
    buffer = BytesIO(pdf_output)
    filename = f"daily-summary-{target_date.isoformat()}.pdf"

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/api/daily-summary/export/markdown")
async def daily_summary_export_markdown(
    date: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export a daily summary as a Markdown file."""
    from datetime import date as dt_date
    import json

    try:
        target_date = dt_date.fromisoformat(date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    if target_date > dt_date.today():
        raise HTTPException(status_code=400, detail="Cannot export future dates")

    from app.models.models import DailySummary

    stmt = select(DailySummary).where(
        DailySummary.user_id == current_user.id,
        DailySummary.date == target_date,
    )
    result = await db.execute(stmt)
    ds = result.scalar_one_or_none()

    if not ds:
        raise HTTPException(status_code=404, detail="No summary found for this date")

    # Build markdown content
    keywords = json.loads(ds.keywords) if ds.keywords else []
    keyword_text = ", ".join(
        k.get("keyword", k) if isinstance(k, dict) else str(k)
        for k in keywords
    ) if keywords else "None"

    md_content = f"""# 每日总结 - {target_date.isoformat()}

{ds.summary}

---

**关键词**: {keyword_text}
**笔记数量**: {ds.total_notes}
**生成时间**: {ds.created_at.isoformat() if ds.created_at else 'N/A'}
**已编辑**: {'是' if ds.is_edited else '否'}
"""

    buffer = BytesIO(md_content.encode("utf-8"))
    filename = f"每日总结-{target_date.isoformat()}.md"

    return StreamingResponse(
        buffer,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
