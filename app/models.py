"""Pydantic models for API request/response types."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# --- Library ---

class LibraryItem(BaseModel):
    id: str
    name: str
    type: str  # Movie, Series, Season
    parent_id: Optional[str] = None
    has_poster: bool = False
    has_backdrop: bool = False
    has_landscape: bool = False
    poster_status: str = "original"
    backdrop_status: str = "original"
    landscape_status: str = "original"
    poster_face_id: Optional[int] = None
    backdrop_face_id: Optional[int] = None
    landscape_face_id: Optional[int] = None
    year: Optional[int] = None
    last_synced: Optional[datetime] = None


class LibraryResponse(BaseModel):
    items: list[LibraryItem]
    total: int


class LibrarySyncResponse(BaseModel):
    synced: int
    new: int
    updated: int


# --- Faces ---

class Face(BaseModel):
    id: int
    filename: str
    gender: str
    usage_count: int = 0
    created_at: Optional[datetime] = None


class FaceUploadResponse(BaseModel):
    face: Face
    detected_gender: str


# --- Jobs ---

class JobCreate(BaseModel):
    item_ids: list[str]
    mode: str = "instant"  # instant, batch
    image_type: str = "poster"  # poster, backdrop, both


class Job(BaseModel):
    id: int
    mode: str
    image_type: str
    backend: str
    status: str
    gemini_batch_id: Optional[str] = None
    total_items: int = 0
    completed_items: int = 0
    failed_items: int = 0
    skipped_items: int = 0
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobItem(BaseModel):
    id: int
    job_id: int
    item_id: str
    item_name: Optional[str] = None
    face_id: Optional[int] = None
    image_type: str
    status: str
    analysis: Optional[dict] = None
    error: Optional[str] = None
    backup_path: Optional[str] = None
    created_at: Optional[datetime] = None


class JobDetail(BaseModel):
    job: Job
    items: list[JobItem]


# --- Settings ---

class SettingsUpdate(BaseModel):
    jellyfin_url: Optional[str] = None
    jellyfin_api_key: Optional[str] = None
    gemini_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    fal_key: Optional[str] = None
    backdrop_upload: Optional[str] = None
    media_ssh: Optional[str] = None
    jf_path_prefix: Optional[str] = None
    host_path_prefix: Optional[str] = None
    analysis_backend: Optional[str] = None
    swap_backend: Optional[str] = None


class SettingsResponse(BaseModel):
    jellyfin_url: str
    jellyfin_api_key: str
    gemini_api_key: str
    anthropic_api_key: str
    fal_key: str
    jellyfin_configured: bool
    gemini_configured: bool
    anthropic_configured: bool
    fal_configured: bool
    backdrop_upload: str
    media_ssh: str
    analysis_backend: str
    swap_backend: str
    missing: list[str]


class ConnectionTestResult(BaseModel):
    success: bool
    message: str
    details: Optional[dict] = None


# --- Restore ---

class RestoreRequest(BaseModel):
    item_ids: list[str]
    image_type: str = "poster"  # poster, backdrop


class RestoreResponse(BaseModel):
    restored: int
    failed: int
    errors: list[str]
