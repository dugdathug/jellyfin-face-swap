"""Configuration loading and validation."""

import os
import sys
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field

# Project root is two levels up from this file (app/core/config.py -> project root)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data"
FACES_DIR = DATA_DIR / "faces"
BACKUPS_DIR = DATA_DIR / "backups"
DB_PATH = DATA_DIR / "jfswap.db"

# AI model constants
VISION_MODEL = "gemini-2.5-flash"
IMAGE_GEN_MODEL = "gemini-3.1-flash-image-preview"
BATCH_IMAGE_MODEL = "gemini-3.1-flash-image-preview"

# Optional alternative backends
CLAUDE_VISION_MODEL = "claude-haiku-4-5-20251001"
FAL_MODEL = "fal-ai/nano-banana-2/edit"

VISION_PROMPT = """\
Analyze this movie/TV show {image_type} image. Count the human faces clearly visible.

Respond with ONLY valid JSON (no markdown, no explanation):
{{
  "total_faces": <int>,
  "male_faces": <int>,
  "female_faces": <int>,
  "dominant_gender": "male" or "female" (which gender is more prominent/central),
  "target_person_description": "<describe the most prominent/central person whose face should be replaced — position, clothing, expression>",
  "edit_prompt": "<prompt for AI image editor>"
}}

For the edit_prompt field, write a directive like:
"Replace the face of [target_person_description] with the face of the person shown in the reference image. Keep everything else identical — lighting, pose, composition, clothing, background. Match the style and color grading of the original {image_type}."

If there are multiple people, pick ONE person (the most prominent) and describe them specifically enough to distinguish from others.

If total_faces is 0, set dominant_gender to null, target_person_description to null, and edit_prompt to null.

IMPORTANT: Never mention the movie or show title in any field. Refer to it only as "the {image_type}" or "the image"."""


class Settings(BaseModel):
    """Application settings, loaded from .env / env vars / UI."""

    # Required
    jellyfin_url: str = ""
    jellyfin_api_key: str = ""
    gemini_api_key: str = ""

    # Optional alternative backends
    anthropic_api_key: str = ""
    fal_key: str = ""

    # AI backend selection
    analysis_backend: str = Field(default="gemini", pattern=r"^(gemini|claude)$")
    swap_backend: str = Field(default="gemini", pattern=r"^(gemini|fal)$")

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    def validate_required(self) -> list[str]:
        """Return list of missing required fields."""
        missing = []
        if not self.jellyfin_url:
            missing.append("JELLYFIN_URL")
        if not self.jellyfin_api_key:
            missing.append("JELLYFIN_API_KEY")
        if not self.gemini_api_key:
            missing.append("GEMINI_API_KEY")
        if self.analysis_backend == "claude" and not self.anthropic_api_key:
            missing.append("ANTHROPIC_API_KEY (required for Claude analysis backend)")
        if self.swap_backend == "fal" and not self.fal_key:
            missing.append("FAL_KEY (required for fal.ai swap backend)")
        return missing


def _load_dotenv(path: Path) -> dict[str, str]:
    """Parse a .env file into a dict."""
    env = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return env


def load_settings() -> Settings:
    """Load settings from .env file (project root) with env var fallback."""
    env = _load_dotenv(PROJECT_ROOT / ".env")

    def get(key: str, default: str = "") -> str:
        return env.get(key, os.environ.get(key, default))

    return Settings(
        jellyfin_url=get("JELLYFIN_URL"),
        jellyfin_api_key=get("JELLYFIN_API_KEY"),
        gemini_api_key=get("GEMINI_API_KEY"),
        anthropic_api_key=get("ANTHROPIC_API_KEY"),
        fal_key=get("FAL_KEY"),
        analysis_backend=get("ANALYSIS_BACKEND", "gemini"),
        swap_backend=get("SWAP_BACKEND", "gemini"),
        host=get("HOST", "0.0.0.0"),
        port=int(get("PORT", "8000")),
    )


# Singleton — loaded once from .env on startup
_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Get current settings (lazy-loaded singleton from .env)."""
    global _settings
    if _settings is None:
        _settings = load_settings()
    return _settings
