"""SQLite database setup and access."""

import sqlite3
from contextlib import contextmanager
from pathlib import Path

from .config import DB_PATH, DATA_DIR

SCHEMA = """
CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    parent_id TEXT,
    has_poster BOOLEAN DEFAULT 0,
    has_backdrop BOOLEAN DEFAULT 0,
    has_landscape BOOLEAN DEFAULT 0,
    poster_status TEXT DEFAULT 'original',
    backdrop_status TEXT DEFAULT 'original',
    landscape_status TEXT DEFAULT 'original',
    poster_face_id INTEGER REFERENCES faces(id),
    backdrop_face_id INTEGER REFERENCES faces(id),
    landscape_face_id INTEGER REFERENCES faces(id),
    year INTEGER,
    date_added TIMESTAMP,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS faces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    gender TEXT NOT NULL,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mode TEXT NOT NULL,
    image_type TEXT NOT NULL,
    backend TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    gemini_batch_id TEXT,
    total_items INTEGER DEFAULT 0,
    completed_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,
    skipped_items INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS job_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL REFERENCES items(id),
    face_id INTEGER REFERENCES faces(id),
    image_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    analysis JSON,
    error TEXT,
    backup_path TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_poster_status ON items(poster_status);
CREATE INDEX IF NOT EXISTS idx_items_backdrop_status ON items(backdrop_status);
CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
"""


def init_db() -> None:
    """Create tables if they don't exist."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.executescript(SCHEMA)


@contextmanager
def get_db():
    """Context manager for database connections with WAL mode and row factory."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
