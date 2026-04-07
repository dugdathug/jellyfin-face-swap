"""Library router — browse and sync Jellyfin library."""

from typing import Optional

from fastapi import APIRouter, Query

from ..core import jellyfin
from ..core.db import get_db
from ..models import LibraryItem, LibraryResponse, LibrarySyncResponse

router = APIRouter()


@router.post("/sync", response_model=LibrarySyncResponse)
async def sync_library():
    """Refresh library cache from Jellyfin."""
    movies = jellyfin.get_movies()
    series_list = jellyfin.get_series()

    # Fetch seasons for each series
    seasons = []
    for s in series_list:
        seasons.extend(jellyfin.get_seasons(s["id"]))

    all_items = movies + series_list + seasons
    new_count = 0
    updated_count = 0

    with get_db() as conn:
        for item in all_items:
            existing = conn.execute("SELECT id FROM items WHERE id = ?", (item["id"],)).fetchone()
            if existing:
                conn.execute(
                    """UPDATE items SET name=?, type=?, parent_id=?, has_poster=?,
                       year=?, date_added=?, last_synced=CURRENT_TIMESTAMP WHERE id=?""",
                    (item["name"], item["type"], item.get("parent_id"),
                     item.get("has_poster", False), item.get("year"),
                     item.get("date_added"), item["id"]),
                )
                updated_count += 1
            else:
                conn.execute(
                    """INSERT INTO items (id, name, type, parent_id, has_poster, year, date_added)
                       VALUES (?, ?, ?, ?, ?, ?, ?)""",
                    (item["id"], item["name"], item["type"], item.get("parent_id"),
                     item.get("has_poster", False), item.get("year"),
                     item.get("date_added")),
                )
                new_count += 1

    return LibrarySyncResponse(synced=len(all_items), new=new_count, updated=updated_count)


@router.get("/items", response_model=LibraryResponse)
async def list_items(
    search: Optional[str] = Query(None, description="Search by name"),
    type: Optional[str] = Query(None, description="Filter by type: Movie, Series, Season"),
    status: Optional[str] = Query(None, description="Filter by poster_status: original, swapped, failed"),
    sort: Optional[str] = Query("name", description="Sort by: name, year, last_synced"),
    order: Optional[str] = Query("asc", description="Sort order: asc, desc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(10000, ge=1, le=10000),
):
    """List library items with search and filters."""
    with get_db() as conn:
        where = ["1=1"]
        params = []

        if search:
            where.append("name LIKE ?")
            params.append(f"%{search}%")
        if type:
            where.append("type = ?")
            params.append(type)
        # Status filtering handled client-side based on visible image types

        where_clause = " AND ".join(where)

        total = conn.execute(
            f"SELECT COUNT(*) as cnt FROM items WHERE {where_clause}", params
        ).fetchone()["cnt"]

        # Validate sort column to prevent SQL injection
        sort_cols = {"name": "name", "year": "year", "date_added": "date_added"}
        sort_col = sort_cols.get(sort, "name")
        sort_dir = "DESC" if order == "desc" else "ASC"

        rows = conn.execute(
            f"SELECT * FROM items WHERE {where_clause} ORDER BY {sort_col} {sort_dir} LIMIT ? OFFSET ?",
            params + [limit, offset],
        ).fetchall()

        items = [LibraryItem(**dict(r)) for r in rows]

    return LibraryResponse(items=items, total=total)


@router.get("/items/{item_id}", response_model=LibraryItem)
async def get_item(item_id: str):
    """Get a single library item."""
    with get_db() as conn:
        row = conn.execute("SELECT * FROM items WHERE id = ?", (item_id,)).fetchone()
        if not row:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Item not found")
        return LibraryItem(**dict(row))
