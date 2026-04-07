"""Claude Vision backend — optional alternative for face analysis."""

import base64
import io
import json
import time

import anthropic
from PIL import Image

from .config import CLAUDE_VISION_MODEL, VISION_PROMPT, get_settings
from .gemini import normalize_image


def analyze_image(image_bytes: bytes, image_type: str = "poster") -> dict:
    """Analyze an image for faces using Claude Vision.

    Drop-in replacement for gemini.analyze_image().
    """
    cfg = get_settings()
    client = anthropic.Anthropic(api_key=cfg.anthropic_api_key)

    jpg_bytes = normalize_image(image_bytes)
    b64 = base64.b64encode(jpg_bytes).decode()
    prompt = VISION_PROMPT.format(image_type=image_type)

    for attempt in range(3):
        resp = client.messages.create(
            model=CLAUDE_VISION_MODEL,
            max_tokens=500,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": prompt},
                ],
            }],
        )
        text = resp.content[0].text.strip()

        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            if attempt == 2:
                raise ValueError(f"Failed to parse Claude response after 3 attempts: {text[:200]}")
            time.sleep(1)

    return {}
