from datetime import date, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.database import get_db
from app.models.models import Channel, Schedule, Server, User
from app.schemas.schemas import (
    ScheduleCreate,
    ScheduleParseRequest,
    ScheduleParseResponse,
    ScheduleResponse,
    ScheduleUpdate,
)
from app.routers.auth import get_current_user
from app.ai.models import get_model_for_user
from app.ai.schedule import parse_natural_language_schedule

router = APIRouter(prefix="/api/schedules", tags=["schedules"])


@router.get("", response_model=list[ScheduleResponse])
async def get_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    start_date: date | None = None,
    end_date: date | None = None,
    server_id: int | None = None,
):
    """获取日程列表，支持日期范围和伺服器过滤"""
    query = select(Schedule).where(Schedule.user_id == current_user.id)

    if start_date:
        query = query.where(
            or_(
                Schedule.date >= start_date,
                Schedule.repeat_rule.isnot(None)
            )
        )
    if end_date:
        query = query.where(
            or_(
                Schedule.date <= end_date,
                Schedule.repeat_rule.isnot(None)
            )
        )
    if server_id:
        query = query.where(Schedule.server_id == server_id)

    query = query.order_by(Schedule.start_time)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=ScheduleResponse, status_code=201)
async def create_schedule(
    schedule_data: ScheduleCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """创建日程"""
    # 验证 server_id 和 channel_id
    if schedule_data.server_id:
        server = await db.get(Server, schedule_data.server_id)
        if not server or server.user_id != current_user.id:
            raise HTTPException(status_code=404, detail="Server not found")

    if schedule_data.channel_id:
        channel = await db.get(Channel, schedule_data.channel_id)
        if not channel:
            raise HTTPException(status_code=404, detail="Channel not found")

    schedule = Schedule(
        user_id=current_user.id,
        **schedule_data.model_dump(exclude_unset=True)
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.get("/today", response_model=list[ScheduleResponse])
async def get_today_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """获取今日日程"""
    today = date.today()
    today_weekday = today.weekday()

    # 获取单次日程（今天的）或重复日程（今天星期几对应的）
    query = select(Schedule).where(
        Schedule.user_id == current_user.id,
        or_(
            # 今天的单次日程
            Schedule.date == today,
            # 每周重复的日程
            and_(
                Schedule.day_of_week == today_weekday,
                Schedule.repeat_rule.isnot(None)
            )
        )
    ).order_by(Schedule.start_time)

    result = await db.execute(query)
    schedules = result.scalars().all()

    # 处理重复日程的日期展开
    expanded_schedules = []
    for schedule in schedules:
        if schedule.repeat_rule and schedule.day_of_week is not None:
            # 对于重复日程，检查今天是否匹配
            if schedule.day_of_week == today_weekday:
                expanded_schedules.append(schedule)
        elif schedule.date == today:
            expanded_schedules.append(schedule)

    return expanded_schedules


@router.get("/upcoming", response_model=list[ScheduleResponse])
async def get_upcoming_schedules(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    days: int = Query(default=7, ge=1, le=30),
):
    """获取即将到来的日程"""
    today = date.today()
    end_date = today + timedelta(days=days)

    query = select(Schedule).where(
        Schedule.user_id == current_user.id,
        or_(
            Schedule.date.between(today, end_date),
            Schedule.repeat_rule.isnot(None)
        )
    ).order_by(Schedule.start_time)

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{schedule_id}", response_model=ScheduleResponse)
async def get_schedule(
    schedule_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """获取单个日程详情"""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule or schedule.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return schedule


@router.put("/{schedule_id}", response_model=ScheduleResponse)
async def update_schedule(
    schedule_id: int,
    schedule_data: ScheduleUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """更新日程"""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule or schedule.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    # 验证 server_id 和 channel_id
    if schedule_data.server_id is not None:
        if schedule_data.server_id == 0:
            schedule.server_id = None
        else:
            server = await db.get(Server, schedule_data.server_id)
            if not server or server.user_id != current_user.id:
                raise HTTPException(status_code=404, detail="Server not found")
            schedule.server_id = schedule_data.server_id

    if schedule_data.channel_id is not None:
        if schedule_data.channel_id == 0:
            schedule.channel_id = None
        else:
            channel = await db.get(Channel, schedule_data.channel_id)
            if not channel:
                raise HTTPException(status_code=404, detail="Channel not found")
            schedule.channel_id = schedule_data.channel_id

    # 更新其他字段
    for field, value in schedule_data.model_dump(exclude_unset=True, exclude={"server_id", "channel_id"}).items():
        setattr(schedule, field, value)

    await db.commit()
    await db.refresh(schedule)
    return schedule


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """删除日程"""
    schedule = await db.get(Schedule, schedule_id)
    if not schedule or schedule.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Schedule not found")

    await db.delete(schedule)
    await db.commit()
    return None


@router.post("/parse", response_model=ScheduleParseResponse)
async def parse_schedule_text(
    request: ScheduleParseRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: AsyncSession = Depends(get_db),
):
    """使用 AI 解析自然语言日程描述"""
    import json as _json
    from datetime import time as _time

    model = await get_model_for_user(current_user.id, db)
    result = await parse_natural_language_schedule(request.text, model)

    # Convert types to match ScheduleParseResponse schema
    start_time = result.get("start_time")
    if isinstance(start_time, str):
        try:
            parts = start_time.split(":")
            start_time = _time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            start_time = _time(9, 0)

    end_time = result.get("end_time")
    if isinstance(end_time, str):
        try:
            parts = end_time.split(":")
            end_time = _time(int(parts[0]), int(parts[1]))
        except (ValueError, IndexError):
            end_time = None

    date_val = result.get("date")
    if isinstance(date_val, str):
        try:
            date_val = date.fromisoformat(date_val)
        except (ValueError, TypeError):
            date_val = None

    repeat_rule = result.get("repeat_rule")
    if isinstance(repeat_rule, str):
        try:
            repeat_rule = _json.loads(repeat_rule)
        except (_json.JSONDecodeError, TypeError):
            repeat_rule = None

    return {
        "title": result.get("title", request.text[:50]),
        "description": result.get("description"),
        "start_time": start_time or _time(9, 0),
        "end_time": end_time,
        "date": date_val,
        "day_of_week": result.get("day_of_week"),
        "repeat_rule": repeat_rule,
        "is_all_day": result.get("is_all_day", False),
        "confidence": result.get("confidence", 0.3),
    }
