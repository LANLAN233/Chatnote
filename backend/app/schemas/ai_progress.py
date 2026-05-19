from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AiProgressStage(BaseModel):
    """A single stage in an AI pipeline operation."""

    stage: str = Field(description="Stage name (e.g. 'extract_knowledge', 'generate_summary')")
    status: Literal["pending", "in_progress", "completed", "failed", "skipped", "fallback"] = Field(
        description="Current status of this stage"
    )
    model: str = Field(description="LLM model used for this stage")
    tier: str = Field(description="Model tier (e.g. 'primary', 'secondary', 'fallback')")
    message: str = Field(description="Human-readable progress message")
    metadata: dict[str, Any] | None = Field(default=None, description="Optional stage-specific metadata")
    duration_ms: int | None = Field(default=None, description="Stage execution duration in milliseconds")
    progress_pct: int | None = Field(default=None, ge=0, le=100, description="Optional progress percentage (0-100) for granular progress bars")


class AiProgressEvent(BaseModel):
    """A complete AI progress event sent via WebSocket."""

    operation_id: str = Field(description="Unique identifier for the operation (e.g. 'daily_summary_1715800000')")
    stages: list[AiProgressStage] = Field(description="All stages in the pipeline, updated incrementally")
    current_stage: int = Field(default=0, description="Index of the currently active stage")
    overall_status: str = Field(default="in_progress", description="Overall operation status")
