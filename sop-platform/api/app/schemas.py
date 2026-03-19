"""
Pydantic v2 response schemas for the SOP Platform API.
All schemas use from_attributes=True for SQLAlchemy ORM model serialization.
"""

import uuid
from datetime import datetime, date
from typing import Optional, Any

from pydantic import BaseModel, ConfigDict

from pydantic import field_validator

from app.models import (
    SOPStatus,
    CalloutConfidence,
    CalloutMatchMethod,
    PipelineStatus,
    SectionContentType,
    UserRole,
)


# ── User schemas ───────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: str
    name: str
    role: UserRole = UserRole.viewer

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        import re
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", v.strip()):
            raise ValueError("Invalid email address")
        return v.strip().lower()


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[UserRole] = None


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    name: str
    role: str
    created_at: datetime
    updated_at: datetime


class CalloutSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    step_id: uuid.UUID
    callout_number: int
    label: str
    element_type: Optional[str] = None
    target_x: int
    target_y: int
    confidence: CalloutConfidence
    match_method: CalloutMatchMethod
    ocr_matched_text: Optional[str] = None
    gemini_region_hint: Optional[str] = None
    was_repositioned: bool
    original_x: Optional[int] = None
    original_y: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class StepClipSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    step_id: uuid.UUID
    clip_url: str
    duration_sec: int
    file_size_bytes: Optional[int] = None
    created_at: datetime


class DiscussionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    step_id: uuid.UUID
    summary: str
    discussion_type: Optional[str] = None
    transcript_refs: list[Any] = []
    transcript_start: Optional[float] = None
    transcript_end: Optional[float] = None
    speakers: list[Any] = []
    created_at: datetime


class StepSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sop_id: uuid.UUID
    sequence: int
    title: str
    description: Optional[str] = None
    sub_steps: list[Any] = []
    timestamp_start: float
    timestamp_end: Optional[float] = None
    screenshot_url: Optional[str] = None
    annotated_screenshot_url: Optional[str] = None
    screenshot_width: Optional[int] = None
    screenshot_height: Optional[int] = None
    scene_score: Optional[float] = None
    frame_classification: Optional[str] = None
    gemini_description: Optional[str] = None
    is_approved: bool
    reviewed_by: Optional[uuid.UUID] = None
    reviewed_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    callouts: list[CalloutSchema] = []
    clips: list[StepClipSchema] = []
    discussions: list[DiscussionSchema] = []


class SectionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sop_id: uuid.UUID
    section_key: str
    section_title: str
    display_order: int
    content_type: SectionContentType
    content_text: Optional[str] = None
    content_json: Optional[Any] = None
    mermaid_syntax: Optional[str] = None
    diagram_url: Optional[str] = None
    is_approved: bool
    was_edited: bool
    created_at: datetime
    updated_at: datetime


class WatchlistSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sop_id: uuid.UUID
    property_name: str
    known_issues: Optional[str] = None
    status: str
    required_actions: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class TranscriptLineSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sop_id: uuid.UUID
    sequence: int
    speaker: str
    timestamp_sec: float
    content: str
    linked_step_id: Optional[uuid.UUID] = None
    original_speaker: Optional[str] = None
    original_content: Optional[str] = None
    was_edited: bool
    created_at: datetime
    updated_at: datetime


class PipelineRunSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sop_id: uuid.UUID
    status: PipelineStatus
    current_stage: Optional[str] = None
    stage_results: dict[str, Any] = {}
    total_api_cost: float
    gemini_input_tokens: int
    gemini_output_tokens: int
    processing_time_sec: Optional[int] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None
    error_stage: Optional[str] = None
    retry_count: int


class SOPListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: SOPStatus
    client_name: Optional[str] = None
    process_name: Optional[str] = None
    meeting_date: Optional[date] = None
    created_at: datetime
    step_count: int = 0


class SOPDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    status: SOPStatus
    video_url: Optional[str] = None
    video_duration_sec: Optional[int] = None
    video_file_size_bytes: Optional[int] = None
    cropped_video_url: Optional[str] = None
    screen_share_periods: list[Any] = []
    template_id: Optional[str] = None
    meeting_date: Optional[date] = None
    meeting_participants: list[Any] = []
    client_name: Optional[str] = None
    process_name: Optional[str] = None
    created_by: Optional[uuid.UUID] = None
    published_by: Optional[uuid.UUID] = None
    created_at: datetime
    updated_at: datetime
    published_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    steps: list[StepSchema] = []
    sections: list[SectionSchema] = []
    watchlist: list[WatchlistSchema] = []
