"""SQLite database setup, migrations, and access."""

import logging
import sqlite3
from contextlib import contextmanager

from .config import DB_PATH, DATA_DIR

log = logging.getLogger("jfswap.db")

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

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_poster_status ON items(poster_status);
CREATE INDEX IF NOT EXISTS idx_items_backdrop_status ON items(backdrop_status);
CREATE INDEX IF NOT EXISTS idx_job_items_job_id ON job_items(job_id);
CREATE INDEX IF NOT EXISTS idx_job_items_status ON job_items(status);
"""

# Migrations: list of (version, description, SQL) tuples.
# Each runs once, in order. Version is tracked in the settings table.
MIGRATIONS = [
    (1, "Add landscape columns to items", [
        "ALTER TABLE items ADD COLUMN has_landscape BOOLEAN DEFAULT 0",
        "ALTER TABLE items ADD COLUMN landscape_status TEXT DEFAULT 'original'",
        "ALTER TABLE items ADD COLUMN landscape_face_id INTEGER REFERENCES faces(id)",
    ]),
    (2, "Add date_added to items", [
        "ALTER TABLE items ADD COLUMN date_added TIMESTAMP",
    ]),
    (3, "Add settings table", [
        "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    ]),
]


def _get_db_version(conn: sqlite3.Connection) -> int:
    """Get current schema version from settings table."""
    try:
        row = conn.execute("SELECT value FROM settings WHERE key = 'schema_version'").fetchone()
        return int(row[0]) if row else 0
    except sqlite3.OperationalError:
        # settings table doesn't exist yet
        return 0


def _run_migrations(conn: sqlite3.Connection) -> None:
    """Run any pending migrations."""
    current = _get_db_version(conn)

    for version, desc, statements in MIGRATIONS:
        if version <= current:
            continue
        log.info(f"Running migration v{version}: {desc}")
        for sql in statements:
            try:
                conn.execute(sql)
            except sqlite3.OperationalError as e:
                # Column/table already exists — safe to skip
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    log.debug(f"  Skipped (already applied): {sql[:60]}")
                else:
                    raise

    # Update version to latest
    latest = MIGRATIONS[-1][0] if MIGRATIONS else 0
    if latest > current:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('schema_version', ?)",
            (str(latest),),
        )
        log.info(f"Schema updated to v{latest}")


def init_db() -> None:
    """Create tables if they don't exist, then run migrations."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with get_db() as conn:
        conn.executescript(SCHEMA)
        _run_migrations(conn)


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


# --- Settings helpers (for non-secret preferences) ---

def get_setting(key: str, default: str = "") -> str:
    """Get a setting from the DB."""
    with get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str) -> None:
    """Set a setting in the DB."""
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value),
        )
