"""Settings router — read-only config status + connection testing."""

from fastapi import APIRouter

from ..core.config import get_settings
from ..core import jellyfin, gemini
from ..models import SettingsResponse, ConnectionTestResult

router = APIRouter()


@router.get("", response_model=SettingsResponse)
async def get_current_settings():
    cfg = get_settings()
    missing = cfg.validate_required()
    return SettingsResponse(
        jellyfin_url=cfg.jellyfin_url,
        jellyfin_configured=bool(cfg.jellyfin_url and cfg.jellyfin_api_key),
        gemini_configured=bool(cfg.gemini_api_key),
        anthropic_configured=bool(cfg.anthropic_api_key),
        fal_configured=bool(cfg.fal_key),
        analysis_backend=cfg.analysis_backend,
        swap_backend=cfg.swap_backend,
        missing=missing,
    )


@router.post("/test-jellyfin", response_model=ConnectionTestResult)
async def test_jellyfin_connection():
    result = jellyfin.test_connection()
    return ConnectionTestResult(**result)


@router.post("/test-gemini", response_model=ConnectionTestResult)
async def test_gemini_connection():
    result = gemini.test_connection()
    return ConnectionTestResult(**result)
