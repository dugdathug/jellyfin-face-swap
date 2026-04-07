"""Items router — individual item operations, image proxying, and restore."""

import hashlib

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from ..core import jellyfin, faces as faces_module
from ..core.db import get_db
from ..models import RestoreRequest, RestoreResponse

router = APIRouter()

# Cache images for 1 hour in browser, revalidate with ETag
_CACHE_HEADERS = {"Cache-Control": "public, max-age=3600, must-revalidate"}

# 1x1 transparent PNG — returned for missing images so browser caches it and stops retrying
_EMPTY_PNG = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'


MAX_IMAGE_SIZE = 50 * 1024 * 1024  # 50MB


def _cached_image_response(request: Request, image_bytes: bytes) -> Response:
    """Return image with cache headers and ETag support."""
    if len(image_bytes) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="Image too large")
    etag = hashlib.md5(image_bytes).hexdigest()

    # Check If-None-Match — browser already has this version
    if_none_match = request.headers.get("if-none-match")
    if if_none_match and if_none_match.strip('"') == etag:
        return Response(status_code=304, headers={**_CACHE_HEADERS, "ETag": f'"{etag}"'})

    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={**_CACHE_HEADERS, "ETag": f'"{etag}"'},
    )


@router.get("/{item_id}/poster")
async def get_poster(item_id: str, request: Request):
    """Proxy a poster image from Jellyfin (avoids CORS issues in frontend)."""
    image_bytes = jellyfin.download_image(item_id, "Primary")
    if not image_bytes:
        raise HTTPException(status_code=404, detail="No poster image")
    return _cached_image_response(request, image_bytes)


@router.get("/{item_id}/backdrop")
async def get_backdrop(item_id: str, request: Request):
    """Proxy a backdrop image from Jellyfin."""
    image_bytes = jellyfin.download_image(item_id, "Backdrop/0")
    if not image_bytes:
        return Response(content=_EMPTY_PNG, media_type="image/png", headers=_CACHE_HEADERS)
    return _cached_image_response(request, image_bytes)


@router.get("/{item_id}/landscape")
async def get_landscape(item_id: str, request: Request):
    """Proxy a landscape/thumb image from Jellyfin."""
    image_bytes = jellyfin.download_image(item_id, "Thumb")
    if not image_bytes:
        return Response(content=_EMPTY_PNG, media_type="image/png", headers=_CACHE_HEADERS)
    return _cached_image_response(request, image_bytes)


@router.get("/{item_id}/backup/{image_type}")
async def get_backup(item_id: str, image_type: str, request: Request):
    """Serve a backed-up original image."""
    if image_type not in ("poster", "backdrop", "landscape"):
        raise HTTPException(status_code=400, detail="image_type must be 'poster', 'backdrop', or 'landscape'")

    backup_bytes = faces_module.get_backup(item_id, image_type)
    if not backup_bytes:
        raise HTTPException(status_code=404, detail="No backup found")
    return _cached_image_response(request, backup_bytes)


@router.post("/{item_id}/restore")
async def restore_item(item_id: str, image_type: str = "poster"):
    """Restore an item's original image from backup."""
    if image_type not in ("poster", "backdrop", "landscape"):
        raise HTTPException(status_code=400, detail="image_type must be 'poster', 'backdrop', or 'landscape'")

    backup_bytes = faces_module.get_backup(item_id, image_type)
    if not backup_bytes:
        raise HTTPException(status_code=404, detail="No backup found for this item")

    jf_types = {"poster": "Primary", "backdrop": "Backdrop", "landscape": "Thumb"}
    jellyfin.upload_image(item_id, jf_types[image_type], backup_bytes)

    # Update DB status
    status_cols = {"poster": "poster_status", "backdrop": "backdrop_status", "landscape": "landscape_status"}
    face_cols = {"poster": "poster_face_id", "backdrop": "backdrop_face_id", "landscape": "landscape_face_id"}
    status_col = status_cols[image_type]
    face_col = face_cols[image_type]
    with get_db() as conn:
        conn.execute(
            f"UPDATE items SET {status_col} = 'original', {face_col} = NULL WHERE id = ?",
            (item_id,),
        )

    return {"restored": True, "item_id": item_id, "image_type": image_type}


@router.post("/restore")
async def restore_bulk(body: RestoreRequest):
    """Restore multiple items' original images from backups."""
    restored = 0
    failed = 0
    errors = []

    for item_id in body.item_ids:
        try:
            backup_bytes = faces_module.get_backup(item_id, body.image_type)
            if not backup_bytes:
                errors.append(f"{item_id}: no backup found")
                failed += 1
                continue

            jf_types = {"poster": "Primary", "backdrop": "Backdrop", "landscape": "Thumb"}
            jellyfin.upload_image(item_id, jf_types[body.image_type], backup_bytes)

            status_cols = {"poster": "poster_status", "backdrop": "backdrop_status", "landscape": "landscape_status"}
            face_cols = {"poster": "poster_face_id", "backdrop": "backdrop_face_id", "landscape": "landscape_face_id"}
            status_col = status_cols[body.image_type]
            face_col = face_cols[body.image_type]
            with get_db() as conn:
                conn.execute(
                    f"UPDATE items SET {status_col} = 'original', {face_col} = NULL WHERE id = ?",
                    (item_id,),
                )
            restored += 1

        except Exception as e:
            errors.append(f"{item_id}: {str(e)}")
            failed += 1

    return RestoreResponse(restored=restored, failed=failed, errors=errors)
