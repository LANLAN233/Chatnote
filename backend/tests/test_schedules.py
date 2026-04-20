import pytest
from datetime import date, time, timedelta

from app.models.models import Schedule


@pytest.fixture
async def test_server(client, auth_headers):
    """创建一个测试伺服器"""
    response = await client.post(
        "/api/servers",
        json={"name": "Test Server", "description": "Test Description"},
        headers=auth_headers,
    )
    return response.json()["data"]


@pytest.fixture
async def test_channel(client, auth_headers, test_server):
    """创建一个测试频道"""
    response = await client.post(
        f"/api/servers/{test_server['id']}/channels",
        json={"name": "Test Channel", "description": "Test Description"},
        headers=auth_headers,
    )
    return response.json()["data"]


@pytest.fixture
async def schedule(client, auth_headers, test_server, test_channel):
    """创建一个测试日程"""
    data = {
        "title": "测试日程",
        "description": "这是一个测试日程",
        "start_time": "14:00:00",
        "end_time": "16:00:00",
        "date": date.today().isoformat(),
        "reminder_minutes": 15,
        "color": "#5865f2",
        "is_all_day": False,
        "server_id": test_server["id"],
        "channel_id": test_channel["id"],
    }
    response = await client.post("/api/schedules", json=data, headers=auth_headers)
    return response.json()


@pytest.mark.asyncio
async def test_create_schedule(client, auth_headers, test_server, test_channel):
    """测试创建日程"""
    data = {
        "title": "高数课",
        "description": "第三章极限",
        "start_time": "14:00:00",
        "end_time": "16:00:00",
        "date": date.today().isoformat(),
        "reminder_minutes": 15,
        "color": "#5865f2",
        "server_id": test_server["id"],
        "channel_id": test_channel["id"],
    }
    response = await client.post("/api/schedules", json=data, headers=auth_headers)
    assert response.status_code == 201
    result = response.json()
    assert result["title"] == "高数课"
    assert result["start_time"] == "14:00:00"


@pytest.mark.asyncio
async def test_create_schedule_without_optional_fields(client, auth_headers):
    """测试创建最小化日程"""
    data = {
        "title": "简单日程",
        "start_time": "09:00:00",
    }
    response = await client.post("/api/schedules", json=data, headers=auth_headers)
    assert response.status_code == 201
    result = response.json()
    assert result["title"] == "简单日程"


@pytest.mark.asyncio
async def test_create_recurring_schedule(client, auth_headers):
    """测试创建重复日程"""
    data = {
        "title": "每周健身",
        "start_time": "19:00:00",
        "end_time": "20:00:00",
        "day_of_week": 1,
        "repeat_rule": '{"type": "weekly"}',
    }
    response = await client.post("/api/schedules", json=data, headers=auth_headers)
    assert response.status_code == 201
    result = response.json()
    assert result["day_of_week"] == 1
    assert result["repeat_rule"] == '{"type": "weekly"}'


@pytest.mark.asyncio
async def test_create_all_day_schedule(client, auth_headers):
    """测试创建全天日程"""
    data = {
        "title": "假期",
        "start_time": "00:00:00",
        "is_all_day": True,
        "date": date.today().isoformat(),
    }
    response = await client.post("/api/schedules", json=data, headers=auth_headers)
    assert response.status_code == 201
    result = response.json()
    assert result["is_all_day"] is True


@pytest.mark.asyncio
async def test_get_schedules(client, auth_headers, schedule):
    """测试获取日程列表"""
    response = await client.get("/api/schedules", headers=auth_headers)
    assert response.status_code == 200
    result = response.json()
    assert len(result) >= 1
    assert any(s["id"] == schedule["id"] for s in result)


@pytest.mark.asyncio
async def test_get_schedules_with_date_range(client, auth_headers, schedule):
    """测试按日期范围获取日程"""
    today = date.today()
    start = (today - timedelta(days=1)).isoformat()
    end = (today + timedelta(days=1)).isoformat()
    response = await client.get(
        f"/api/schedules?start_date={start}&end_date={end}",
        headers=auth_headers
    )
    assert response.status_code == 200
    result = response.json()
    assert any(s["id"] == schedule["id"] for s in result)


@pytest.mark.asyncio
async def test_get_schedule_detail(client, auth_headers, schedule):
    """测试获取单个日程详情"""
    response = await client.get(f"/api/schedules/{schedule['id']}", headers=auth_headers)
    assert response.status_code == 200
    result = response.json()
    assert result["id"] == schedule["id"]
    assert result["title"] == schedule["title"]


@pytest.mark.asyncio
async def test_get_nonexistent_schedule(client, auth_headers):
    """测试获取不存在的日程"""
    response = await client.get("/api/schedules/99999", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_schedule(client, auth_headers, schedule):
    """测试更新日程"""
    data = {"title": "更新后的日程", "color": "#eb459e"}
    response = await client.put(
        f"/api/schedules/{schedule['id']}",
        json=data,
        headers=auth_headers
    )
    assert response.status_code == 200
    result = response.json()
    assert result["title"] == "更新后的日程"
    assert result["color"] == "#eb459e"


@pytest.mark.asyncio
async def test_delete_schedule(client, auth_headers, schedule):
    """测试删除日程"""
    response = await client.delete(
        f"/api/schedules/{schedule['id']}",
        headers=auth_headers
    )
    assert response.status_code == 204

    # 确认已删除
    response = await client.get(f"/api/schedules/{schedule['id']}", headers=auth_headers)
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_today_schedules(client, auth_headers):
    """测试获取今日日程"""
    # 创建今日日程
    data = {
        "title": "今日日程",
        "start_time": "10:00:00",
        "date": date.today().isoformat(),
        "reminder_minutes": 15,
        "color": "#5865f2",
        "is_all_day": False,
    }
    await client.post("/api/schedules", json=data, headers=auth_headers)

    response = await client.get("/api/schedules/today", headers=auth_headers)
    assert response.status_code == 200
    result = response.json()
    assert any(s["title"] == "今日日程" for s in result)


@pytest.mark.asyncio
async def test_get_upcoming_schedules(client, auth_headers):
    """测试获取即将到来的日程"""
    response = await client.get("/api/schedules/upcoming?days=7", headers=auth_headers)
    assert response.status_code == 200
    result = response.json()
    assert isinstance(result, list)


@pytest.mark.asyncio
async def test_unauthorized_access(client):
    """测试未授权访问"""
    response = await client.get("/api/schedules")
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_parse_natural_language_tomorrow(client, auth_headers):
    """测试解析明天"""
    response = await client.post(
        "/api/schedules/parse",
        json={"text": "明天下午2点高数课"},
        headers=auth_headers
    )
    assert response.status_code == 200
    result = response.json()
    assert "title" in result
    assert result["confidence"] > 0


@pytest.mark.asyncio
async def test_parse_natural_language_weekly(client, auth_headers):
    """测试解析每周重复"""
    response = await client.post(
        "/api/schedules/parse",
        json={"text": "每周一三五晚上7点健身"},
        headers=auth_headers
    )
    assert response.status_code == 200
    result = response.json()
    assert "title" in result


@pytest.mark.asyncio
async def test_parse_natural_language_all_day(client, auth_headers):
    """测试解析全天日程"""
    response = await client.post(
        "/api/schedules/parse",
        json={"text": "下周三全天开会"},
        headers=auth_headers
    )
    assert response.status_code == 200
    result = response.json()
    assert "title" in result
