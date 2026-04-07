"""Gemini AI backend — vision analysis, face swap, and batch processing."""

import base64
import io
import json
import logging
import tempfile
import time
from pathlib import Path

from google import genai
from google.genai import types
from PIL import Image

log = logging.getLogger("jfswap.gemini")

from .config import (
    VISION_MODEL,
    IMAGE_GEN_MODEL,
    BATCH_IMAGE_MODEL,
    VISION_PROMPT,
    get_settings,
    DATA_DIR,
)


def _client() -> genai.Client:
    cfg = get_settings()
    return genai.Client(api_key=cfg.gemini_api_key)


def normalize_image(image_bytes: bytes, max_dim: int = 2000) -> bytes:
    """Convert any image to JPEG bytes, resize if too large."""
    img = Image.open(io.BytesIO(image_bytes))
    img = img.convert("RGB")
    if max(img.size) > max_dim:
        img.thumbnail((max_dim, max_dim), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Vision analysis
# ---------------------------------------------------------------------------

def analyze_image(image_bytes: bytes, image_type: str = "poster") -> dict:
    """Analyze an image for faces using Gemini Flash.

    Returns dict with: total_faces, male_faces, female_faces,
    dominant_gender, target_person_description, edit_prompt
    """
    client = _client()
    jpg_bytes = normalize_image(image_bytes)
    prompt = VISION_PROMPT.format(image_type=image_type)
    log.info(f"Analyzing {image_type} image ({len(image_bytes)} bytes, normalized to {len(jpg_bytes)} bytes)")

    for attempt in range(3):
        response = client.models.generate_content(
            model=VISION_MODEL,
            contents=[
                types.Part.from_bytes(data=jpg_bytes, mime_type="image/jpeg"),
                types.Part.from_text(text=prompt),
            ],
        )
        text = response.text.strip()
        log.debug(f"Vision response (attempt {attempt+1}): {text[:200]}")

        # Strip markdown fences if present
        if text.startswith("```"):
            lines = text.split("\n")
            lines = [l for l in lines if not l.startswith("```")]
            text = "\n".join(lines)

        try:
            return json.loads(text)
        except json.JSONDecodeError:
            if attempt == 2:
                raise ValueError(f"Failed to parse Gemini response after 3 attempts: {text[:200]}")
            time.sleep(1)

    return {}


def test_connection() -> dict:
    """Test Gemini API key by listing models."""
    try:
        client = _client()
        # Simple test: generate a tiny response
        response = client.models.generate_content(
            model=VISION_MODEL,
            contents="Respond with exactly: OK",
        )
        return {
            "success": True,
            "message": f"Gemini API connected (model: {VISION_MODEL})",
            "details": {"model": VISION_MODEL},
        }
    except Exception as e:
        return {"success": False, "message": str(e), "details": None}


# ---------------------------------------------------------------------------
# Instant face swap
# ---------------------------------------------------------------------------

# Output resolution per image type
IMAGE_SIZE_MAP = {
    "poster": "1K",      # $0.067
}

# Cost per image (USD, from Google pricing page)
COST_INSTANT = {"poster": 0.067}
COST_BATCH = {"poster": 0.034}


def swap_face(
    poster_bytes: bytes,
    face_bytes: bytes,
    edit_prompt: str,
    image_type: str = "poster",
) -> bytes | None:
    """Swap a face in an image using Gemini image generation.

    Returns JPEG bytes of the result, or None if generation failed.
    """
    client = _client()
    poster_jpg = normalize_image(poster_bytes)
    face_jpg = normalize_image(face_bytes, max_dim=1024)

    image_size = IMAGE_SIZE_MAP.get(image_type, "1K")
    log.info(f"Swap request: source={len(poster_bytes)}b (norm {len(poster_jpg)}b), face={len(face_bytes)}b (norm {len(face_jpg)}b), size={image_size}, type={image_type}")
    log.info(f"Edit prompt: {edit_prompt[:150]}")

    try:
        response = client.models.generate_content(
            model=IMAGE_GEN_MODEL,
            contents=[
                types.Part.from_bytes(data=poster_jpg, mime_type="image/jpeg"),
                types.Part.from_bytes(data=face_jpg, mime_type="image/jpeg"),
                types.Part.from_text(text=edit_prompt),
            ],
            config=types.GenerateContentConfig(
                response_modalities=["IMAGE"],
                image_config=types.ImageConfig(image_size=image_size),
            ),
        )

        # Log full response structure
        candidates = response.candidates or []
        log.info(f"Response: {len(candidates)} candidate(s), finish_reason={candidates[0].finish_reason if candidates else 'NONE'}")

        if not candidates:
            log.warning("No candidates in response")
            return None

        parts = candidates[0].content.parts if candidates[0].content else []
        log.info(f"Parts: {len(parts)}")
        for i, part in enumerate(parts):
            if part.inline_data:
                log.info(f"  Part {i}: inline_data mime={part.inline_data.mime_type}, size={len(part.inline_data.data)}b")
                if part.inline_data.mime_type.startswith("image/"):
                    return part.inline_data.data
            elif part.text:
                log.info(f"  Part {i}: text={part.text[:100]}")
            else:
                log.info(f"  Part {i}: unknown type")

        log.warning("No image part found in response")

    except Exception as e:
        log.error(f"Gemini image gen failed: {e}", exc_info=True)
        return None

    return None


# ---------------------------------------------------------------------------
# Batch face swap
# ---------------------------------------------------------------------------

# Max items per batch JSONL to stay well under 2GB limit
# Each item is ~500KB base64 (2 images), so ~1000 items ≈ 500MB
MAX_ITEMS_PER_BATCH = 1000


def create_batch_jobs(items: list[dict]) -> list[str]:
    """Create one or more Gemini batch jobs for face swapping.

    Auto-splits into multiple batch jobs if items exceed MAX_ITEMS_PER_BATCH.

    items: list of dicts with keys:
        - item_id: Jellyfin item ID (used as batch request key)
        - image_type: poster, backdrop, or landscape
        - poster_bytes: original image bytes
        - face_bytes: replacement face bytes
        - edit_prompt: prompt from analysis step

    Returns list of batch job names for polling.
    """
    # Split into chunks
    chunks = [items[i:i + MAX_ITEMS_PER_BATCH] for i in range(0, len(items), MAX_ITEMS_PER_BATCH)]
    batch_names = []

    for chunk_idx, chunk in enumerate(chunks):
        client = _client()
        batch_dir = DATA_DIR / "batches"
        batch_dir.mkdir(exist_ok=True)
        jsonl_path = batch_dir / f"batch_{int(time.time())}_{chunk_idx}.jsonl"

        with open(jsonl_path, "w") as f:
            for item in chunk:
                image_type = item.get("image_type", "poster")
                image_size = IMAGE_SIZE_MAP.get(image_type, "1K")

                poster_b64 = base64.b64encode(
                    normalize_image(item["poster_bytes"])
                ).decode()
                face_b64 = base64.b64encode(
                    normalize_image(item["face_bytes"], max_dim=1024)
                ).decode()

                request = {
                    "key": item["item_id"],
                    "request": {
                        "contents": [{
                            "parts": [
                                {"inline_data": {"mime_type": "image/jpeg", "data": poster_b64}},
                                {"inline_data": {"mime_type": "image/jpeg", "data": face_b64}},
                                {"text": item["edit_prompt"]},
                            ]
                        }],
                        "generation_config": {
                            "responseModalities": ["IMAGE"],
                            "imageConfig": {"imageSize": image_size},
                        },
                    },
                }
                f.write(json.dumps(request) + "\n")

        uploaded = client.files.upload(
            file=str(jsonl_path),
            config=types.UploadFileConfig(
                display_name=f"jfswap-batch-{int(time.time())}-{chunk_idx}",
                mime_type="jsonl",
            ),
        )

        batch_job = client.batches.create(
            model=BATCH_IMAGE_MODEL,
            src=uploaded.name,
            config={"display_name": f"jfswap-{int(time.time())}-{chunk_idx}"},
        )

        jsonl_path.unlink(missing_ok=True)
        batch_names.append(batch_job.name)
        log.info(f"Batch chunk {chunk_idx+1}/{len(chunks)}: {len(chunk)} items → {batch_job.name}")

    return batch_names


BATCH_COMPLETED_STATES = {
    "JOB_STATE_SUCCEEDED",
    "JOB_STATE_FAILED",
    "JOB_STATE_CANCELLED",
    "JOB_STATE_EXPIRED",
}


def check_batch_status(batch_job_name: str) -> dict:
    """Check the status of a batch job.

    Returns dict with: state, total, completed, failed
    """
    client = _client()
    job = client.batches.get(name=batch_job_name)
    return {
        "state": job.state.name,
        "is_complete": job.state.name in BATCH_COMPLETED_STATES,
        "is_success": job.state.name == "JOB_STATE_SUCCEEDED",
        "dest_file": getattr(job.dest, "file_name", None) if job.dest else None,
    }


def download_batch_results(batch_job_name: str) -> dict[str, bytes]:
    """Download results from a completed batch job.

    Returns dict mapping item_id -> image_bytes for successful items.
    """
    client = _client()
    job = client.batches.get(name=batch_job_name)

    if job.state.name != "JOB_STATE_SUCCEEDED":
        raise RuntimeError(f"Batch job not succeeded: {job.state.name}")

    result_file_name = job.dest.file_name
    file_content = client.files.download(file=result_file_name).decode("utf-8")

    results = {}
    for line in file_content.splitlines():
        if not line:
            continue
        parsed = json.loads(line)
        item_id = parsed.get("key", "")

        if "response" in parsed and parsed["response"]:
            candidates = parsed["response"].get("candidates", [])
            if candidates:
                for part in candidates[0].get("content", {}).get("parts", []):
                    if "inlineData" in part:
                        img_data = base64.b64decode(part["inlineData"]["data"])
                        results[item_id] = img_data
                        break

    return results
