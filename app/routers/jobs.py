"""Jobs router — create and monitor face swap jobs (instant + batch)."""

import asyncio
import json
import logging
import time
import traceback
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Optional

from fastapi import APIRouter, HTTPException, BackgroundTasks, Query

log = logging.getLogger("jfswap.jobs")

from ..core import gemini, jellyfin, faces as faces_module
from ..core.config import get_settings, FACES_DIR
from ..core.db import get_db
from ..models import Job, JobCreate, JobDetail, JobItem

router = APIRouter()

# Maps our image_type names to Jellyfin API paths
_JF_DOWNLOAD = {"poster": "Primary", "backdrop": "Backdrop/0", "landscape": "Thumb"}
_JF_UPLOAD = {"poster": "Primary", "backdrop": "Backdrop", "landscape": "Thumb"}
_DB_STATUS_COL = {"poster": "poster_status", "backdrop": "backdrop_status", "landscape": "landscape_status"}
_DB_FACE_COL = {"poster": "poster_face_id", "backdrop": "backdrop_face_id", "landscape": "landscape_face_id"}


def _get_analysis_fn():
    """Return the analysis function based on current backend setting."""
    cfg = get_settings()
    if cfg.analysis_backend == "claude":
        from ..core import claude
        return claude.analyze_image
    return gemini.analyze_image


def _get_swap_fn():
    """Return the swap function based on current backend setting."""
    cfg = get_settings()
    if cfg.swap_backend == "fal":
        from ..core import fal
        return fal.swap_face
    return gemini.swap_face


# ---------------------------------------------------------------------------
# Instant processing (runs in background thread)
# ---------------------------------------------------------------------------

def _process_single_item(ji: dict, analyze, swap) -> str:
    """Process one job_item (one image type for one title). Returns status string."""
    ji_id = ji["id"]
    item_id = ji["item_id"]
    item_name = ji.get("name", item_id)
    image_type = ji["image_type"]

    log.info(f"[{item_name}] Starting {image_type} (ji={ji_id})")

    try:
        with get_db() as conn:
            conn.execute("UPDATE job_items SET status = 'analyzing' WHERE id = ?", (ji_id,))

        log.info(f"[{item_name}] Downloading {image_type} via {_JF_DOWNLOAD[image_type]}")
        image_bytes = jellyfin.download_image(item_id, _JF_DOWNLOAD[image_type])
        if not image_bytes:
            log.warning(f"[{item_name}] No {image_type} image returned from Jellyfin")
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'skipped', error = 'No image available' WHERE id = ?",
                    (ji_id,),
                )
            return "skipped"

        log.info(f"[{item_name}] Downloaded {image_type}: {len(image_bytes)} bytes, backing up")
        backup_path = faces_module.backup_image(item_id, image_type, image_bytes)

        log.info(f"[{item_name}] Analyzing {image_type} for faces...")
        analysis = analyze(image_bytes, image_type)
        log.info(f"[{item_name}] Analysis: {analysis.get('total_faces', 0)} faces ({analysis.get('male_faces', 0)}M/{analysis.get('female_faces', 0)}F), dominant={analysis.get('dominant_gender')}")

        with get_db() as conn:
            conn.execute(
                "UPDATE job_items SET analysis = ?, status = 'swapping' WHERE id = ?",
                (json.dumps(analysis), ji_id),
            )

        if analysis.get("total_faces", 0) == 0:
            log.info(f"[{item_name}] No faces in {image_type} — skipping")
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'skipped', error = 'No faces detected' WHERE id = ?",
                    (ji_id,),
                )
            return "skipped"

        gender = analysis.get("dominant_gender", "male") or "male"
        face = faces_module.pick_face(gender)
        if not face:
            log.error(f"[{item_name}] No {gender} face images available")
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'failed', error = 'No face images available' WHERE id = ?",
                    (ji_id,),
                )
            return "failed"

        log.info(f"[{item_name}] Picked face: {face['filename']} (id={face['id']}, gender={face['gender']})")
        face_bytes = (FACES_DIR / face["filename"]).read_bytes()
        log.info(f"[{item_name}] Face image: {len(face_bytes)} bytes")
        with get_db() as conn:
            conn.execute("UPDATE job_items SET face_id = ? WHERE id = ?", (face["id"], ji_id))

        edit_prompt = analysis.get("edit_prompt", "")
        log.info(f"[{item_name}] Calling swap for {image_type}...")
        result_bytes = swap(image_bytes, face_bytes, edit_prompt)
        if not result_bytes:
            log.error(f"[{item_name}] Swap returned None for {image_type}")
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'failed', error = 'AI generation returned no result' WHERE id = ?",
                    (ji_id,),
                )
            return "failed"

        log.info(f"[{item_name}] Swap returned {len(result_bytes)} bytes for {image_type}, uploading via {_JF_UPLOAD[image_type]}")
        jellyfin.upload_image(item_id, _JF_UPLOAD[image_type], result_bytes)

        with get_db() as conn:
            conn.execute(
                "UPDATE job_items SET status = 'success', backup_path = ? WHERE id = ?",
                (backup_path, ji_id),
            )
            conn.execute(
                f"UPDATE items SET {_DB_STATUS_COL[image_type]} = 'swapped', {_DB_FACE_COL[image_type]} = ? WHERE id = ?",
                (face["id"], item_id),
            )
        return "success"

    except Exception as e:
        with get_db() as conn:
            conn.execute(
                "UPDATE job_items SET status = 'failed', error = ? WHERE id = ?",
                (str(e), ji_id),
            )
        return "failed"


def _process_instant_job(job_id: int) -> None:
    """Process a swap job — all image types per title run concurrently."""
    analyze = _get_analysis_fn()
    swap = _get_swap_fn()

    with get_db() as conn:
        conn.execute("UPDATE jobs SET status = 'running' WHERE id = ?", (job_id,))

    with get_db() as conn:
        job_items = conn.execute(
            """SELECT ji.id, ji.item_id, ji.image_type, i.name
               FROM job_items ji JOIN items i ON ji.item_id = i.id
               WHERE ji.job_id = ? AND ji.status = 'pending'""",
            (job_id,),
        ).fetchall()

    # Group by item_id so all image types for one title run together
    by_title: dict[str, list[dict]] = defaultdict(list)
    for ji in job_items:
        d = dict(ji)
        by_title[d["item_id"]].append(d)

    completed = 0
    failed = 0
    skipped = 0

    for item_id, title_items in by_title.items():
        # Process all image types for this title concurrently
        with ThreadPoolExecutor(max_workers=len(title_items)) as executor:
            futures = {
                executor.submit(_process_single_item, ji, analyze, swap): ji
                for ji in title_items
            }
            for future in as_completed(futures):
                result = future.result()
                if result == "success":
                    completed += 1
                elif result == "skipped":
                    skipped += 1
                else:
                    failed += 1

        # Update job counters after each title
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET completed_items = ?, failed_items = ?, skipped_items = ? WHERE id = ?",
                (completed, failed, skipped, job_id),
            )

        time.sleep(1)  # Rate limit between titles, not between image types

    # Finalize job
    with get_db() as conn:
        conn.execute(
            "UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )


# ---------------------------------------------------------------------------
# Batch processing
# ---------------------------------------------------------------------------

def _create_batch_job(job_id: int) -> None:
    """Prepare and submit a Gemini batch job."""
    analyze = _get_analysis_fn()

    with get_db() as conn:
        conn.execute("UPDATE jobs SET status = 'running' WHERE id = ?", (job_id,))

    with get_db() as conn:
        job_items = conn.execute(
            """SELECT ji.id, ji.item_id, ji.image_type
               FROM job_items ji WHERE ji.job_id = ? AND ji.status = 'pending'""",
            (job_id,),
        ).fetchall()

        # Mark all affected items as "pending" immediately so the UI reflects batch-in-progress
        for ji in job_items:
            status_col = _DB_STATUS_COL[ji["image_type"]]
            conn.execute(f"UPDATE items SET {status_col} = 'pending' WHERE id = ?", (ji["item_id"],))

    batch_items = []

    for ji in job_items:
        ji = dict(ji)
        ji_id = ji["id"]
        item_id = ji["item_id"]
        image_type = ji["image_type"]
        jf_image_type = _JF_DOWNLOAD[image_type]

        try:
            with get_db() as conn:
                conn.execute("UPDATE job_items SET status = 'analyzing' WHERE id = ?", (ji_id,))

            image_bytes = jellyfin.download_image(item_id, jf_image_type)
            if not image_bytes:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE job_items SET status = 'skipped', error = 'No image' WHERE id = ?",
                        (ji_id,),
                    )
                continue

            # Backup
            faces_module.backup_image(item_id, image_type, image_bytes)

            # Analyze
            analysis = analyze(image_bytes, image_type)
            total_faces = analysis.get("total_faces", 0)
            if total_faces == 0:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE job_items SET status = 'skipped', error = 'No faces' WHERE id = ?",
                        (ji_id,),
                    )
                continue

            # Pick face
            gender = analysis.get("dominant_gender", "male") or "male"
            face = faces_module.pick_face(gender)
            if not face:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE job_items SET status = 'failed', error = 'No faces available' WHERE id = ?",
                        (ji_id,),
                    )
                continue

            face_bytes = (FACES_DIR / face["filename"]).read_bytes()

            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET face_id = ?, analysis = ?, status = 'swapping' WHERE id = ?",
                    (face["id"], json.dumps(analysis), ji_id),
                )

            batch_items.append({
                "item_id": item_id,
                "ji_id": ji_id,
                "poster_bytes": image_bytes,
                "face_bytes": face_bytes,
                "edit_prompt": analysis.get("edit_prompt", ""),
            })

        except Exception as e:
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'failed', error = ? WHERE id = ?",
                    (str(e), ji_id),
                )

    if not batch_items:
        with get_db() as conn:
            conn.execute(
                "UPDATE jobs SET status = 'completed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                (job_id,),
            )
        return

    # Submit batch
    batch_job_name = gemini.create_batch_job(batch_items)
    with get_db() as conn:
        conn.execute(
            "UPDATE jobs SET gemini_batch_id = ?, status = 'batch_pending' WHERE id = ?",
            (batch_job_name, job_id),
        )


# ---------------------------------------------------------------------------
# Batch poller (runs as background task during app lifespan)
# ---------------------------------------------------------------------------

async def batch_poller():
    """Poll active Gemini batch jobs and process results when complete."""
    while True:
        try:
            with get_db() as conn:
                pending_jobs = conn.execute(
                    "SELECT id, gemini_batch_id FROM jobs WHERE status = 'batch_pending' AND gemini_batch_id IS NOT NULL"
                ).fetchall()

            for job_row in pending_jobs:
                job_row = dict(job_row)
                try:
                    status = gemini.check_batch_status(job_row["gemini_batch_id"])

                    if status["is_complete"]:
                        if status["is_success"]:
                            _process_batch_results(job_row["id"], job_row["gemini_batch_id"])
                        else:
                            with get_db() as conn:
                                conn.execute(
                                    "UPDATE jobs SET status = 'failed', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
                                    (job_row["id"],),
                                )
                except Exception as e:
                    print(f"Batch poll error for job {job_row['id']}: {e}")

        except Exception as e:
            print(f"Batch poller error: {e}")

        await asyncio.sleep(30)


def _process_batch_results(job_id: int, batch_job_name: str) -> None:
    """Download batch results and upload swapped images to Jellyfin."""
    results = gemini.download_batch_results(batch_job_name)

    completed = 0
    failed = 0

    with get_db() as conn:
        job_items = conn.execute(
            "SELECT id, item_id, image_type FROM job_items WHERE job_id = ? AND status = 'swapping'",
            (job_id,),
        ).fetchall()

    for ji in job_items:
        ji = dict(ji)
        item_id = ji["item_id"]
        image_type = ji["image_type"]
        result_bytes = results.get(item_id)

        if result_bytes:
            try:
                jf_upload_type = "Primary" if image_type == "poster" else "Backdrop"
                jellyfin.upload_image(item_id, jf_upload_type, result_bytes)

                status_col = _DB_STATUS_COL[image_type]
                with get_db() as conn:
                    conn.execute("UPDATE job_items SET status = 'success' WHERE id = ?", (ji["id"],))
                    conn.execute(f"UPDATE items SET {status_col} = 'swapped' WHERE id = ?", (item_id,))
                completed += 1
            except Exception as e:
                with get_db() as conn:
                    conn.execute(
                        "UPDATE job_items SET status = 'failed', error = ? WHERE id = ?",
                        (str(e), ji["id"]),
                    )
                failed += 1
        else:
            with get_db() as conn:
                conn.execute(
                    "UPDATE job_items SET status = 'failed', error = 'No result in batch output' WHERE id = ?",
                    (ji["id"],),
                )
            failed += 1

    with get_db() as conn:
        conn.execute(
            """UPDATE jobs SET status = 'completed', completed_items = ?,
               failed_items = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (completed, failed, job_id),
        )


# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@router.post("", response_model=Job)
async def create_job(body: JobCreate, background_tasks: BackgroundTasks):
    """Create a new face swap job."""
    cfg = get_settings()

    if not body.item_ids:
        raise HTTPException(status_code=400, detail="No items selected")

    backend = cfg.swap_backend

    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO jobs (mode, image_type, backend, status, total_items)
               VALUES (?, ?, ?, 'pending', ?)""",
            (body.mode, body.image_type, backend, len(body.item_ids)),
        )
        job_id = cursor.lastrowid

        # Create job_items — image_type can be comma-separated (e.g., "poster,backdrop")
        all_types = {"poster", "backdrop", "landscape"}
        if body.image_type == "all":
            image_types = sorted(all_types)
        else:
            image_types = [t.strip() for t in body.image_type.split(",") if t.strip() in all_types]
        if not image_types:
            image_types = ["poster"]

        for item_id in body.item_ids:
            for img_type in image_types:
                conn.execute(
                    "INSERT INTO job_items (job_id, item_id, image_type) VALUES (?, ?, ?)",
                    (job_id, item_id, img_type),
                )

        # Update total_items to reflect actual job_items count
        actual_total = len(body.item_ids) * len(image_types)
        conn.execute("UPDATE jobs SET total_items = ? WHERE id = ?", (actual_total, job_id))

        row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()

    # Launch processing
    if body.mode == "instant":
        background_tasks.add_task(_process_instant_job, job_id)
    elif body.mode == "batch":
        background_tasks.add_task(_create_batch_job, job_id)

    return Job(**dict(row))


@router.get("", response_model=list[Job])
async def list_jobs(
    status: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """List recent jobs."""
    with get_db() as conn:
        if status:
            rows = conn.execute(
                "SELECT * FROM jobs WHERE status = ? ORDER BY created_at DESC LIMIT ?",
                (status, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
    return [Job(**dict(r)) for r in rows]


@router.get("/{job_id}", response_model=JobDetail)
async def get_job(job_id: int):
    """Get job details including per-item status."""
    with get_db() as conn:
        job_row = conn.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job_row:
            raise HTTPException(status_code=404, detail="Job not found")

        item_rows = conn.execute(
            """SELECT ji.*, i.name as item_name
               FROM job_items ji JOIN items i ON ji.item_id = i.id
               WHERE ji.job_id = ? ORDER BY ji.id""",
            (job_id,),
        ).fetchall()

    job = Job(**dict(job_row))
    items = []
    for r in item_rows:
        d = dict(r)
        if isinstance(d.get("analysis"), str):
            d["analysis"] = json.loads(d["analysis"])
        items.append(JobItem(**d))

    return JobDetail(job=job, items=items)


@router.post("/{job_id}/cancel")
async def cancel_job(job_id: int):
    """Cancel a running job."""
    with get_db() as conn:
        job = conn.execute("SELECT status FROM jobs WHERE id = ?", (job_id,)).fetchone()
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job["status"] in ("completed", "failed", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Job already {job['status']}")

        conn.execute(
            "UPDATE jobs SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP WHERE id = ?",
            (job_id,),
        )

    return {"cancelled": True}
