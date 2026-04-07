#!/usr/bin/env python3
"""Jellyfin Face Swap — CLI entry point for headless/scripted usage."""

import argparse
import json
import sys
import time

from app.core.config import get_settings, FACES_DIR
from app.core.db import init_db, get_db
from app.core import faces as faces_module, jellyfin, gemini


def get_analysis_fn():
    cfg = get_settings()
    if cfg.analysis_backend == "claude":
        from app.core import claude
        return claude.analyze_image
    return gemini.analyze_image


def get_swap_fn():
    cfg = get_settings()
    if cfg.swap_backend == "fal":
        from app.core import fal
        return fal.swap_face
    return gemini.swap_face


def process_item(item_id, item_name, item_type, analyze, swap, dry_run=False):
    """Process a single item. Returns status string."""
    print(f"  Downloading poster...")
    image_bytes = jellyfin.download_image(item_id, "Primary")
    if not image_bytes:
        print(f"  No poster image — skipping")
        return "skipped"

    faces_module.backup_image(item_id, "poster", image_bytes)

    print(f"  Analyzing faces...")
    analysis = analyze(image_bytes, "poster")
    total = analysis.get("total_faces", 0)

    if total == 0:
        print(f"  No faces detected — skipping")
        return "skipped"

    gender = analysis.get("dominant_gender", "male") or "male"
    print(f"  Detected {total} face(s) ({analysis.get('male_faces', 0)}M/{analysis.get('female_faces', 0)}F)")

    face = faces_module.pick_face(gender)
    if not face:
        print(f"  No face images available — skipping")
        return "error"

    print(f"  Using face: {face['filename']}")

    if dry_run:
        print(f"  [DRY RUN] Would swap and upload")
        return "dry_run"

    face_bytes = (FACES_DIR / face["filename"]).read_bytes()
    print(f"  Swapping face...")
    result_bytes = swap(image_bytes, face_bytes, analysis.get("edit_prompt", ""))

    if not result_bytes:
        print(f"  AI returned no image — keeping original")
        return "failed"

    print(f"  Uploading to Jellyfin...")
    jellyfin.upload_image(item_id, "Primary", result_bytes)
    return "success"


def main():
    parser = argparse.ArgumentParser(description="Swap faces in Jellyfin posters")
    parser.add_argument("--dry-run", action="store_true", help="Analyze only, don't upload")
    parser.add_argument("--limit", type=int, default=0, help="Max items to process (0=all)")
    parser.add_argument("--movies-only", action="store_true", help="Skip TV shows")
    parser.add_argument("--shows-only", action="store_true", help="Skip movies")
    parser.add_argument("--restore", action="store_true", help="Restore originals from backups")
    parser.add_argument("--serve", action="store_true", help="Start the web UI server")
    args = parser.parse_args()

    if args.serve:
        import uvicorn
        cfg = get_settings()
        print(f"Starting web UI at http://{cfg.host}:{cfg.port}")
        uvicorn.run("app.main:app", host=cfg.host, port=cfg.port, reload=True)
        return

    # Validate config
    cfg = get_settings()
    missing = cfg.validate_required()
    if missing:
        print(f"Error: Missing config: {', '.join(missing)}", file=sys.stderr)
        print(f"Create a .env file or set environment variables.", file=sys.stderr)
        sys.exit(1)

    # Init DB + scan faces
    init_db()
    face_data = faces_module.scan_faces()
    total_faces = len(face_data["male"]) + len(face_data["female"])

    if not args.restore and total_faces == 0:
        print(f"Error: No face images found in {FACES_DIR}/", file=sys.stderr)
        print(f"Place images named male_1.jpg, female_1.jpg, etc.", file=sys.stderr)
        sys.exit(1)

    print(f"Loaded {len(face_data['male'])} male + {len(face_data['female'])} female face images")

    analyze = get_analysis_fn()
    swap = get_swap_fn()

    image_types = ["poster"]

    # Gather items
    items = []
    if not args.shows_only:
        print(f"\nFetching movies...")
        movies = jellyfin.get_movies()
        items.extend(movies)
        print(f"Found {len(movies)} movies")

    if not args.movies_only:
        print(f"Fetching TV series...")
        series_list = jellyfin.get_series()
        items.extend(series_list)
        print(f"Found {len(series_list)} series")

        for s in series_list:
            seasons = jellyfin.get_seasons(s["id"])
            items.extend(seasons)

    if args.restore:
        restored = 0
        for item in items:
            for img_type in image_types:
                backup = faces_module.get_backup(item["id"], img_type)
                if backup:
                    print(f"  Restoring {item['name']} ({img_type})...")
                    if not args.dry_run:
                        jellyfin.upload_image(item["id"], "Primary", backup)
                    restored += 1
        print(f"\nRestored {restored} items")
        return

    # Process
    stats = {"success": 0, "skipped": 0, "failed": 0, "dry_run": 0, "error": 0}
    processed = 0

    for item in items:
        if args.limit and processed >= args.limit:
            break

        for img_type in image_types:
            print(f"\n[{item['type']}] {item['name']}")
            try:
                result = process_item(
                    item["id"], item["name"], item["type"],
                    analyze, swap, args.dry_run,
                )
                stats[result] = stats.get(result, 0) + 1
                if result != "skipped":
                    processed += 1
                    time.sleep(1)
            except KeyboardInterrupt:
                print(f"\n\nInterrupted!")
                break
            except Exception as e:
                print(f"  ERROR: {e}")
                stats["error"] += 1
                processed += 1

    print(f"\n{'='*50}")
    print(f"Done! Processed {processed} items:")
    for k, v in stats.items():
        if v > 0:
            print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
