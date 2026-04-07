"""Jellyfin API client — browse library, download/upload images."""

import base64
import time

import requests

from .config import get_settings


def _headers() -> dict:
    cfg = get_settings()
    return {"Authorization": f'MediaBrowser Token="{cfg.jellyfin_api_key}"'}


def _url(path: str) -> str:
    cfg = get_settings()
    return f"{cfg.jellyfin_url.rstrip('/')}{path}"


def _get(path: str, params: dict | None = None, timeout: int = 30) -> dict | None:
    """GET request with retry."""
    for attempt in range(3):
        try:
            r = requests.get(_url(path), headers=_headers(), params=params, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except requests.RequestException:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)
    return None


# ---------------------------------------------------------------------------
# Library browsing (user-scoped for full visibility)
# ---------------------------------------------------------------------------

_user_id: str | None = None


def _get_user_id() -> str:
    """Get an admin user's ID (cached). Falls back to first user."""
    global _user_id
    if _user_id is None:
        users = _get("/Users")
        if not users:
            raise RuntimeError("No Jellyfin users found")
        # Prefer admin user for full library access
        for u in users:
            if u.get("Policy", {}).get("IsAdministrator"):
                _user_id = u["Id"]
                break
        if _user_id is None:
            _user_id = users[0]["Id"]
    return _user_id


def _user_items(params: dict) -> list[dict]:
    """Fetch items via user-scoped endpoint for full library visibility."""
    uid = _get_user_id()
    data = _get(f"/Users/{uid}/Items", params)
    return data.get("Items", []) if data else []


def get_movies() -> list[dict]:
    """Fetch all movies."""
    items = _user_items({
        "IncludeItemTypes": "Movie",
        "Recursive": "true",
        "Fields": "PrimaryImageAspectRatio,ProductionYear,DateCreated",
        "SortBy": "Name",
        "SortOrder": "Ascending",
        "Limit": "10000",
    })
    return [
        {
            "id": item["Id"],
            "name": item["Name"],
            "type": "Movie",
            "has_poster": bool(item.get("ImageTags", {}).get("Primary")),
            "has_backdrop": bool(item.get("BackdropImageTags")),
            "has_landscape": bool(item.get("ImageTags", {}).get("Thumb")),
            "year": item.get("ProductionYear"),
            "date_added": item.get("DateCreated"),
        }
        for item in items
    ]


def get_series() -> list[dict]:
    """Fetch all TV series."""
    items = _user_items({
        "IncludeItemTypes": "Series",
        "Recursive": "true",
        "Fields": "PrimaryImageAspectRatio,ProductionYear,DateCreated",
        "SortBy": "Name",
        "SortOrder": "Ascending",
        "Limit": "10000",
    })
    return [
        {
            "id": item["Id"],
            "name": item["Name"],
            "type": "Series",
            "has_poster": bool(item.get("ImageTags", {}).get("Primary")),
            "has_backdrop": bool(item.get("BackdropImageTags")),
            "has_landscape": bool(item.get("ImageTags", {}).get("Thumb")),
            "year": item.get("ProductionYear"),
            "date_added": item.get("DateCreated"),
        }
        for item in items
    ]


def get_seasons(series_id: str) -> list[dict]:
    """Fetch seasons for a series."""
    items = _user_items({
        "ParentId": series_id,
        "IncludeItemTypes": "Season",
        "SortBy": "SortName",
        "SortOrder": "Ascending",
    })
    return [
        {
            "id": item["Id"],
            "name": item["Name"],
            "type": "Season",
            "parent_id": series_id,
            "has_poster": bool(item.get("ImageTags", {}).get("Primary")),
            "has_backdrop": bool(item.get("BackdropImageTags")),
            "has_landscape": bool(item.get("ImageTags", {}).get("Thumb")),
        }
        for item in items
    ]


def test_connection() -> dict:
    """Test Jellyfin connection. Returns server info on success."""
    try:
        data = _get("/System/Info/Public", timeout=10)
        return {
            "success": True,
            "message": f"Connected to {data.get('ServerName', 'Jellyfin')} v{data.get('Version', '?')}",
            "details": {
                "server_name": data.get("ServerName"),
                "version": data.get("Version"),
                "os": data.get("OperatingSystem"),
            },
        }
    except Exception as e:
        return {"success": False, "message": str(e), "details": None}


# ---------------------------------------------------------------------------
# Image download
# ---------------------------------------------------------------------------

def download_image(item_id: str, image_type: str = "Primary") -> bytes | None:
    """Download an image from Jellyfin. image_type: 'Primary', 'Backdrop/0', or 'Thumb'."""
    try:
        r = requests.get(
            _url(f"/Items/{item_id}/Images/{image_type}"),
            headers=_headers(),
            timeout=180,
        )
        if r.status_code == 404:
            return None
        r.raise_for_status()
        return r.content
    except requests.RequestException:
        return None


# ---------------------------------------------------------------------------
# Image upload (multiple strategies)
# ---------------------------------------------------------------------------

def upload_image(item_id: str, image_type: str, image_bytes: bytes) -> None:
    """Upload an image to Jellyfin via the API.

    image_type: 'Primary', 'Backdrop', or 'Thumb' (landscape).
    """
    api_paths = {"Primary": "Primary", "Backdrop": "Backdrop/0", "Thumb": "Thumb"}
    image_path = api_paths.get(image_type, image_type)

    # Backdrops: DELETE first, otherwise Jellyfin appends (creates backdrop1.jpg)
    if image_path == "Backdrop/0":
        requests.delete(
            _url(f"/Items/{item_id}/Images/Backdrop/0"),
            headers=_headers(),
            timeout=180,
        )

    headers = _headers()
    headers["Content-Type"] = "image/jpeg"
    body = base64.b64encode(image_bytes).decode()
    r = requests.post(
        _url(f"/Items/{item_id}/Images/{image_path}"),
        headers=headers,
        data=body,
        timeout=180,
    )
    r.raise_for_status()
