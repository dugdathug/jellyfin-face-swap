"""Settings router — config CRUD + connection testing."""

from fastapi import APIRouter

from ..core.config import get_settings, update_settings, Settings
from ..core import jellyfin, gemini
from ..models import SettingsUpdate, SettingsResponse, ConnectionTestResult

router = APIRouter()


def _build_response(cfg: Settings) -> SettingsResponse:
    missing = cfg.validate_required()
    return SettingsResponse(
        jellyfin_url=cfg.jellyfin_url,
        jellyfin_api_key=cfg.jellyfin_api_key,
        gemini_api_key=cfg.gemini_api_key,
        anthropic_api_key=cfg.anthropic_api_key,
        fal_key=cfg.fal_key,
        jellyfin_configured=bool(cfg.jellyfin_url and cfg.jellyfin_api_key),
        gemini_configured=bool(cfg.gemini_api_key),
        anthropic_configured=bool(cfg.anthropic_api_key),
        fal_configured=bool(cfg.fal_key),
        backdrop_upload=cfg.backdrop_upload,
        media_ssh=cfg.media_ssh,
        analysis_backend=cfg.analysis_backend,
        swap_backend=cfg.swap_backend,
        missing=missing,
    )


@router.get("", response_model=SettingsResponse)
async def get_current_settings():
    return _build_response(get_settings())


@router.put("", response_model=SettingsResponse)
async def update_current_settings(body: SettingsUpdate):
    cfg = get_settings()

    # Merge non-None fields, skip empty strings for key fields to avoid
    # accidentally wiping keys loaded from .env
    updates = body.model_dump(exclude_none=True)
    current = cfg.model_dump()
    current.update(updates)

    new_cfg = Settings(**current)
    update_settings(new_cfg)

    return _build_response(new_cfg)


@router.post("/test-jellyfin", response_model=ConnectionTestResult)
async def test_jellyfin_connection():
    result = jellyfin.test_connection()
    return ConnectionTestResult(**result)


@router.post("/test-gemini", response_model=ConnectionTestResult)
async def test_gemini_connection():
    result = gemini.test_connection()
    return ConnectionTestResult(**result)
