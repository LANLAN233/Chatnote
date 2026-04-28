from __future__ import annotations

import datetime
from typing import Literal

from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6)
    display_name: str | None = None


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: int
    username: str
    display_name: str | None
    avatar: str | None
    status: str
    preferred_llm: str
    theme: str
    notifications_enabled: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class UserSettingsUpdate(BaseModel):
    display_name: str | None = None
    preferred_llm: str | None = None
    api_key: str | None = None
    theme: str | None = None
    notifications_enabled: bool | None = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ServerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    icon: str | None = None
    description: str | None = None
    sort_order: int = 0


class ServerUpdate(BaseModel):
    name: str | None = None
    icon: str | None = None
    description: str | None = None
    sort_order: int | None = None


class ServerResponse(BaseModel):
    id: int
    user_id: int
    name: str
    icon: str | None
    description: str | None
    sort_order: int
    primary_channel_id: int | None = None
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class ChannelCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    type: str = "text"
    description: str | None = None
    sort_order: int = 0


class ChannelUpdate(BaseModel):
    name: str | None = None
    type: str | None = None
    description: str | None = None
    sort_order: int | None = None


class ChannelResponse(BaseModel):
    id: int
    server_id: int
    name: str
    type: str
    description: str | None
    sort_order: int
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class NoteCreate(BaseModel):
    channel_id: int
    content: str = Field(..., min_length=1)
    content_type: str = "markdown"
    raw_input: str | None = None
    ai_category: str | None = None
    ai_summary: str | None = None
    ai_confidence: float | None = None
    ai_tags: str | None = None


class NoteUpdate(BaseModel):
    content: str | None = None
    content_type: str | None = None
    ai_category: str | None = None
    ai_summary: str | None = None
    ai_confidence: float | None = None
    ai_tags: str | None = None


class NoteResponse(BaseModel):
    id: int
    channel_id: int
    user_id: int
    content: str
    content_type: str
    raw_input: str | None
    ai_category: str | None
    ai_summary: str | None
    ai_confidence: float | None
    ai_tags: str | None
    is_edited: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class NoteListResponse(BaseModel):
    items: list[NoteResponse]
    total: int
    page: int
    page_size: int


class ClassifyRequest(BaseModel):
    content: str = Field(..., min_length=1)


class ClassifyResponse(BaseModel):
    suggested_server: str
    suggested_channel: str
    confidence: float
    tags: list[str]
    summary: str
    is_new_server: bool
    is_new_channel: bool
    server_id: int | None = None
    channel_id: int | None = None


class ConsoleExecuteRequest(BaseModel):
    input: str = Field(..., min_length=1)
    ai_enabled: bool = False
    session_id: int | None = None


class ConsoleExecuteResponse(BaseModel):
    type: str
    content: str | None = None
    data: object | None = None


class ConsoleMessageResponse(BaseModel):
    id: int
    session_id: int
    role: str
    content: str
    type: str
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class ConsoleSessionCreate(BaseModel):
    title: str | None = "New Session"
    server_id: int | None = None


class ConsoleSessionUpdate(BaseModel):
    title: str | None = None


class ConsoleSessionResponse(BaseModel):
    id: int
    user_id: int
    server_id: int | None
    title: str
    created_at: datetime.datetime
    updated_at: datetime.datetime
    messages: list[ConsoleMessageResponse] | None = None

    model_config = {"from_attributes": True}


class ConsoleArchiveRequest(BaseModel):
    server_id: int = Field(..., description="Target server ID")
    channel_id: int = Field(..., description="Target channel ID")


class NoteCreateWithClassify(BaseModel):
    content: str = Field(..., min_length=1)
    server_name: str | None = None
    channel_name: str | None = None
    auto_classify: bool = True


class StatsResponse(BaseModel):
    total_servers: int
    total_channels: int
    total_notes: int
    recent_notes: list[NoteResponse]


class ApiResponse(BaseModel):
    success: bool
    data: object | None = None
    message: str | None = None


class RepeatRule(BaseModel):
    type: Literal["none", "daily", "weekly", "monthly"]
    days: list[int] | None = None
    start_date: datetime.date | None = None
    end_date: datetime.date | None = None
    interval: int = 1


class ScheduleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    start_time: datetime.time
    end_time: datetime.time | None = None
    date: datetime.date | None = None
    day_of_week: int | None = Field(None, ge=0, le=6)
    repeat_rule: str | None = None
    reminder_minutes: int = 15
    color: str = "#5865f2"
    is_all_day: bool = False
    server_id: int | None = None
    channel_id: int | None = None


class ScheduleUpdate(BaseModel):
    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    start_time: datetime.time | None = None
    end_time: datetime.time | None = None
    date: datetime.date | None = None
    day_of_week: int | None = Field(None, ge=0, le=6)
    repeat_rule: str | None = None
    reminder_minutes: int | None = None
    color: str | None = None
    is_all_day: bool | None = None
    server_id: int | None = None
    channel_id: int | None = None


class ScheduleResponse(BaseModel):
    id: int
    user_id: int
    server_id: int | None
    channel_id: int | None
    title: str
    description: str | None
    start_time: datetime.time
    end_time: datetime.time | None
    date: datetime.date | None
    day_of_week: int | None
    repeat_rule: str | None
    reminder_minutes: int
    color: str
    is_all_day: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class ScheduleParseRequest(BaseModel):
    text: str = Field(..., min_length=1)


class ScheduleParseResponse(BaseModel):
    title: str
    description: str | None
    start_time: datetime.time | None
    end_time: datetime.time | None
    date: datetime.date | None
    day_of_week: int | None
    repeat_rule: RepeatRule | None
    is_all_day: bool
    confidence: float


class PluginConfigSchema(BaseModel):
    type: str
    title: str
    description: str | None = None
    default: object | None = None
    required: bool = False
    enum: list[object] | None = None


class PluginManifestData(BaseModel):
    """Manifest data for a plugin (matches manifest.json)."""

    id: str
    name: str
    version: str = "1.0.0"
    description: str | None = None
    author: str | None = None
    min_app_version: str | None = None


class PluginCreate(BaseModel):
    """Kept for backward compat; not used in new scan-based system."""

    name: str = Field(..., min_length=1, max_length=100)
    version: str = Field(default="1.0.0", max_length=20)
    description: str | None = None
    author: str | None = None
    entry_point: str = Field(..., min_length=1)
    config_schema: list[PluginConfigSchema] | None = None
    config: dict | None = None
    is_builtin: bool = False


class PluginUpdate(BaseModel):
    config: dict | None = None
    is_enabled: bool | None = None


class PluginResponse(BaseModel):
    """Response model for plugin listing.

    Metadata (name/version/description/author/config_schema) is read
    from manifest.json at scan time, not from DB.
    """

    id: int
    plugin_id: str
    name: str
    version: str
    description: str | None
    author: str | None
    config_schema: list[PluginConfigSchema] | None
    config: dict | None
    is_enabled: bool
    is_builtin: bool
    installed_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class PluginToggleRequest(BaseModel):
    is_enabled: bool


class PluginDeployRequest(BaseModel):
    """Request body for deploying a plugin from developer console."""

    id: str = Field(..., min_length=1, max_length=100)
    manifest: PluginManifestData
    code: str = Field(..., min_length=1)


class PluginMessage(BaseModel):
    plugin_name: str
    message: str
    type: str = "info"  # info, warning, success, error
    timestamp: datetime.datetime = Field(default_factory=datetime.datetime.now)
    data: dict | None = None


class AttachmentResponse(BaseModel):
    id: int
    note_id: int
    filename: str
    file_path: str
    file_type: str | None
    file_size: int
    created_at: datetime.datetime

    model_config = {"from_attributes": True}


class UserApiKeyCreate(BaseModel):
    provider: str = Field(..., min_length=1)
    api_key: str = Field(..., min_length=1)
    model: str | None = None


class UserApiKeyResponse(BaseModel):
    id: int
    user_id: int
    provider: str
    api_key_masked: str
    model: str | None
    is_default: bool
    created_at: datetime.datetime
    updated_at: datetime.datetime

    model_config = {"from_attributes": True}


class ScheduleImportServer(BaseModel):
    name: str
    channels: list["ScheduleImportChannel"]


class ScheduleImportChannel(BaseModel):
    name: str
    notes: list["ScheduleImportNote"]


class ScheduleImportNote(BaseModel):
    content: str


class ScheduleImportSuggestion(BaseModel):
    type: str
    target_server: str | None = None
    message: str


class ScheduleImportRequest(BaseModel):
    text: str | None = None
    image_url: str | None = None


class ScheduleImportResponse(BaseModel):
    servers: list[ScheduleImportServer]
    schedules: list[ScheduleResponse]
    suggestions: list[ScheduleImportSuggestion]