"""fal.ai backend — optional alternative for face swapping."""

import os
from pathlib import Path

import fal_client
import requests

from .config import FAL_MODEL, get_settings
from .gemini import normalize_image


def swap_face(
    poster_bytes: bytes,
    face_bytes: bytes,
    edit_prompt: str,
) -> bytes | None:
    """Swap a face using fal.ai's image editing model.

    Drop-in replacement for gemini.swap_face().
    """
    cfg = get_settings()
    os.environ["FAL_KEY"] = cfg.fal_key

    poster_jpg = normalize_image(poster_bytes)
    face_jpg = normalize_image(face_bytes, max_dim=1024)

    # Upload both images to fal CDN
    poster_url = fal_client.upload(poster_jpg, "image/jpeg")
    face_url = fal_client.upload(face_jpg, "image/jpeg")

    try:
        result = fal_client.subscribe(FAL_MODEL, arguments={
            "prompt": edit_prompt,
            "image_urls": [poster_url, face_url],
            "num_images": 1,
            "aspect_ratio": "auto",
            "resolution": "1K",
            "safety_tolerance": "6",
            "thinking_level": "high",
            "output_format": "jpeg",
        }, client_timeout=600)
    except Exception as e:
        print(f"  fal.ai rejected: {e}")
        return None

    images = result.get("images", [])
    if not images:
        return None

    r = requests.get(images[0]["url"], timeout=60)
    r.raise_for_status()
    return r.content
