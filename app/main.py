"""FastAPI application — serves API + static frontend."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)
# Quiet noisy loggers
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware

from .core.config import PROJECT_ROOT, get_settings
from .core.db import init_db
from .core.faces import ensure_dirs, scan_faces
from .routers import library, faces, jobs, items, settings

STATIC_DIR = PROJECT_ROOT / "web" / "dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: init DB, ensure directories, start batch poller."""
    init_db()
    ensure_dirs()
    scan_faces()  # Register any face images on disk into the DB

    # Start background batch job poller
    from .routers.jobs import batch_poller
    poller_task = asyncio.create_task(batch_poller())

    yield

    # Shutdown
    poller_task.cancel()
    try:
        await poller_task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="Jellyfin Face Swap",
    description="Swap faces in your Jellyfin media library posters and backdrops",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS for dev (Vite dev server on 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth middleware — optional, enabled when AUTH_TOKEN is set in .env
class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        cfg = get_settings()
        if not cfg.auth_token:
            return await call_next(request)  # No token configured = no auth

        # Only protect /api/ routes (not static files or SPA)
        if not request.url.path.startswith("/api/"):
            return await call_next(request)

        # Allow auth endpoints without token
        if request.url.path in ("/api/auth/check", "/api/auth/login"):
            return await call_next(request)

        # Check header first, then query param (for <img> src URLs)
        auth = request.headers.get("authorization", "")
        query_token = request.query_params.get("token", "")
        if auth == f"Bearer {cfg.auth_token}" or query_token == cfg.auth_token:
            return await call_next(request)

        return JSONResponse(status_code=401, content={"detail": "Unauthorized"})

app.add_middleware(AuthMiddleware)

# Auth check endpoint
@app.get("/api/auth/check")
async def auth_check():
    cfg = get_settings()
    return {"auth_required": bool(cfg.auth_token)}

@app.post("/api/auth/login")
async def auth_login(request: Request):
    cfg = get_settings()
    body = await request.json()
    token = body.get("token", "")
    if token == cfg.auth_token:
        return {"success": True}
    return JSONResponse(status_code=401, content={"detail": "Invalid token"})

# API routers
app.include_router(settings.router, prefix="/api/settings", tags=["settings"])
app.include_router(library.router, prefix="/api/library", tags=["library"])
app.include_router(faces.router, prefix="/api/faces", tags=["faces"])
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(items.router, prefix="/api/items", tags=["items"])

# Serve built frontend (if it exists)
if STATIC_DIR.exists():
    # Serve static assets (js, css, images)
    app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / "assets")), name="assets")

    # SPA fallback — serve index.html for all non-API routes
    @app.get("/{path:path}")
    async def spa_fallback(request: Request, path: str):
        # Try serving the exact file first (favicon.svg, etc.)
        if path:
            file_path = (STATIC_DIR / path).resolve()
            static_root = STATIC_DIR.resolve()
            if str(file_path).startswith(str(static_root)) and file_path.is_file():
                return FileResponse(file_path)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    from .core.config import get_settings

    cfg = get_settings()
    uvicorn.run("app.main:app", host=cfg.host, port=cfg.port, reload=True)
