"""Face library management and round-robin selection."""

import shutil
from pathlib import Path

from .config import FACES_DIR, BACKUPS_DIR
from .db import get_db


def ensure_dirs() -> None:
    """Create faces and backups directories if they don't exist."""
    FACES_DIR.mkdir(parents=True, exist_ok=True)
    BACKUPS_DIR.mkdir(parents=True, exist_ok=True)


def scan_faces() -> dict[str, list[dict]]:
    """Scan faces directory and sync with database. Returns faces by gender."""
    ensure_dirs()
    on_disk = set()
    faces = {"male": [], "female": []}

    for f in sorted(FACES_DIR.iterdir()):
        if f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp"):
            gender = None
            if f.stem.lower().startswith("male"):
                gender = "male"
            elif f.stem.lower().startswith("female"):
                gender = "female"
            if gender:
                on_disk.add(f.name)

    with get_db() as conn:
        # Add new files to DB
        for filename in on_disk:
            gender = "male" if filename.lower().startswith("male") else "female"
            conn.execute(
                "INSERT OR IGNORE INTO faces (filename, gender) VALUES (?, ?)",
                (filename, gender),
            )

        # Remove DB entries for deleted files
        db_faces = conn.execute("SELECT id, filename FROM faces").fetchall()
        for row in db_faces:
            if row["filename"] not in on_disk:
                conn.execute("DELETE FROM faces WHERE id = ?", (row["id"],))

        # Return current state
        for row in conn.execute(
            "SELECT id, filename, gender, usage_count, created_at FROM faces ORDER BY gender, filename"
        ).fetchall():
            entry = dict(row)
            faces[entry["gender"]].append(entry)

    return faces


def get_all_faces() -> list[dict]:
    """Get all faces from database."""
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, filename, gender, usage_count, created_at FROM faces ORDER BY gender, filename"
        ).fetchall()
        return [dict(r) for r in rows]


def add_face(filename: str, file_bytes: bytes, gender: str) -> dict:
    """Save a face image and register it in the database."""
    ensure_dirs()
    dest = FACES_DIR / filename
    dest.write_bytes(file_bytes)

    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO faces (filename, gender) VALUES (?, ?)",
            (filename, gender),
        )
        row = conn.execute(
            "SELECT id, filename, gender, usage_count, created_at FROM faces WHERE filename = ?",
            (filename,),
        ).fetchone()
        return dict(row)


def delete_face(face_id: int) -> bool:
    """Delete a face image and its DB entry."""
    with get_db() as conn:
        row = conn.execute("SELECT filename FROM faces WHERE id = ?", (face_id,)).fetchone()
        if not row:
            return False
        filepath = FACES_DIR / row["filename"]
        if filepath.exists():
            filepath.unlink()
        conn.execute("DELETE FROM faces WHERE id = ?", (face_id,))
        return True


def pick_face(gender: str) -> dict | None:
    """Pick the next face for the given gender using round-robin.

    Falls back to the other gender if no faces of the requested gender exist.
    Increments usage_count to track round-robin position.
    """
    with get_db() as conn:
        # Try requested gender first, then fallback
        for g in [gender, "female" if gender == "male" else "male"]:
            faces = conn.execute(
                "SELECT id, filename, gender, usage_count FROM faces WHERE gender = ? ORDER BY usage_count ASC, id ASC LIMIT 1",
                (g,),
            ).fetchone()
            if faces:
                conn.execute(
                    "UPDATE faces SET usage_count = usage_count + 1 WHERE id = ?",
                    (faces["id"],),
                )
                return dict(faces)
    return None


def backup_image(item_id: str, image_type: str, image_bytes: bytes) -> str:
    """Save original image to backups directory. Returns relative backup path."""
    ensure_dirs()
    filename = f"{item_id}_{image_type}_original.jpg"
    path = BACKUPS_DIR / filename
    if not path.exists():
        path.write_bytes(image_bytes)
    return f"data/backups/{filename}"


def get_backup(item_id: str, image_type: str) -> bytes | None:
    """Retrieve backup image bytes."""
    path = BACKUPS_DIR / f"{item_id}_{image_type}_original.jpg"
    if path.exists():
        return path.read_bytes()
    return None
