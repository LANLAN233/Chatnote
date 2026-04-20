from datetime import datetime

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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


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
    created_at: datetime
    updated_at: datetime

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
    created_at: datetime
    updated_at: datetime

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
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NoteListResponse(BaseModel):
    items: list[NoteResponse]
    total: int
    page: int
    page_size: int


class ApiResponse(BaseModel):
    success: bool
    data: object | None = None
    message: str | None = None