"""Faces router — upload, list, and manage replacement face images."""

import re
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File, Form

from ..core import faces as faces_module
from ..core.config import FACES_DIR
from ..models import Face, FaceUploadResponse

router = APIRouter()


@router.get("", response_model=list[Face])
async def list_faces():
    """List all registered face images."""
    faces_module.scan_faces()  # Sync disk with DB
    return [Face(**f) for f in faces_module.get_all_faces()]


@router.post("", response_model=FaceUploadResponse)
async def upload_face(
    file: UploadFile = File(...),
    gender: str = Form(..., pattern=r"^(male|female)$"),
):
    """Upload a new face image."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:  # 10MB limit
        raise HTTPException(status_code=400, detail="File too large (max 10MB)")

    # Determine extension from content type
    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    ext = ext_map.get(file.content_type, ".jpg")

    # Generate filename: gender_N.ext (find next available number)
    existing = list(FACES_DIR.glob(f"{gender}_*"))
    next_num = 1
    for f in existing:
        match = re.match(rf"{gender}_(\d+)", f.stem)
        if match:
            next_num = max(next_num, int(match.group(1)) + 1)

    filename = f"{gender}_{next_num}{ext}"
    face = faces_module.add_face(filename, content, gender)

    return FaceUploadResponse(face=Face(**face), detected_gender=gender)


@router.delete("/{face_id}")
async def delete_face(face_id: int):
    """Delete a face image."""
    if not faces_module.delete_face(face_id):
        raise HTTPException(status_code=404, detail="Face not found")
    return {"deleted": True}


@router.get("/{face_id}/image")
async def get_face_image(face_id: int):
    """Serve a face image file."""
    from fastapi.responses import FileResponse

    all_faces = faces_module.get_all_faces()
    face = next((f for f in all_faces if f["id"] == face_id), None)
    if not face:
        raise HTTPException(status_code=404, detail="Face not found")

    path = FACES_DIR / face["filename"]
    if not path.exists():
        raise HTTPException(status_code=404, detail="Face image file missing")

    return FileResponse(path)
