<p align="center">
  <img src="https://raw.githubusercontent.com/jellyfin/jellyfin-ux/master/branding/SVG/icon-transparent.svg" width="80" alt="Jellyfin">
</p>

<h1 align="center">Jellyfin Face Swap</h1>

<p align="center">
  <strong>Replace faces in your Jellyfin movie and TV show artwork with your friends, family, or anyone else.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> &bull;
  <a href="#how-it-works">How It Works</a> &bull;
  <a href="#web-ui">Web UI</a> &bull;
  <a href="#cli">CLI</a> &bull;
  <a href="#batch-mode">Batch Mode</a> &bull;
  <a href="#configuration">Configuration</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.12+-blue?logo=python&logoColor=white" alt="Python 3.12+">
  <img src="https://img.shields.io/badge/Jellyfin-compatible-00a4dc?logo=jellyfin&logoColor=white" alt="Jellyfin">
  <img src="https://img.shields.io/badge/Google%20Gemini-AI-4285F4?logo=google&logoColor=white" alt="Gemini AI">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License">
</p>

---

## What Is This?

Jellyfin Face Swap automatically detects faces in your media library artwork and replaces them with faces you provide. It works on **posters**, **backdrops**, and **landscape** images across your entire movie and TV show collection.

**How it works:**
1. AI analyzes each image to find faces and identify the most prominent person
2. A replacement face is selected from your collection (round-robin by gender)
3. AI generates a new image with the face swapped, matching lighting and style
4. The new image is uploaded back to Jellyfin

Your originals are always backed up locally before any changes are made.

## Quick Start

### Prerequisites

- A running [Jellyfin](https://jellyfin.org/) server
- A [Google AI API key](https://aistudio.google.com/apikey) (for Gemini)
- Python 3.12+ or Docker

### 1. Clone and configure

```bash
git clone https://github.com/yourusername/jellyfin-face-swap.git
cd jellyfin-face-swap
cp .env.example .env
```

Edit `.env` with your keys:

```env
JELLYFIN_URL=http://your-jellyfin-server:8096
JELLYFIN_API_KEY=your_jellyfin_api_key
GEMINI_API_KEY=your_google_ai_api_key
```

> **Getting a Jellyfin API key:** In Jellyfin, go to Dashboard > API Keys > Add.

### 2. Add face images

Place photos of the faces you want to use in `data/faces/`:

```
data/faces/
  male_1.jpg      # Any male face
  male_2.jpg      # Another male face
  female_1.jpg    # Any female face
```

Name them `male_*.jpg` or `female_*.jpg` so the app knows which gender to match. The AI picks the most prominent face in each poster and replaces it with a same-gender face from your collection, rotating through them evenly.

### 3. Run

**With Docker (recommended):**

```bash
docker compose up -d
```

Open `http://localhost:8000` in your browser.

**Without Docker:**

```bash
pip install -r requirements.txt
cd web && npm install && npm run build && cd ..
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Web UI

The web interface lets you browse your library, select titles, and swap faces with a few clicks.

### Library

- Browse all movies and TV shows with poster thumbnails
- **Multi-select image types** — choose any combination of Poster, Backdrop, and Landscape to display and swap
- Each card shows all selected image types for that title
- Click to select, shift+click for range selection, or use Select All
- Search, filter by type (Movies/Shows) and status (Original/Swapped/Pending)
- Sort by name, year, or date added

### Face Swap

- **Instant mode** — process items one by one with real-time progress
- **Batch mode** — submit to Google's Batch API at **50% cost**, results applied automatically (may take up to 24 hours)
- All image types for a title process concurrently

### Jobs

- Track active and completed jobs
- Expand any job to see per-item results with before/after thumbnails
- Full-size image preview on any thumbnail
- Batch jobs show elapsed time and auto-apply results to Jellyfin

### Faces

- Upload and manage replacement face images
- Drag-and-drop upload with gender tagging
- Usage count tracking shows how evenly faces are distributed

### Settings

- Connection status for Jellyfin and Gemini
- Test connection buttons to verify your setup
- API keys are configured via `.env` file (never stored in browser or database)

## CLI

For scripting and automation, a full CLI is included:

```bash
# Swap posters for all movies (dry run)
python cli.py --dry-run

# Swap the first 5 movies
python cli.py --limit 5

# Swap backdrops only
python cli.py --backdrops

# Swap all image types (poster + backdrop + landscape)
python cli.py --all

# Movies only, skip TV shows
python cli.py --movies-only

# Restore all originals from backups
python cli.py --restore

# Start the web server
python cli.py --serve
```

## Batch Mode

Batch mode uses Google's [Batch API](https://ai.google.dev/gemini-api/docs/batch) to process face swaps at **50% of the normal cost**. The trade-off is time — results may take minutes to hours (up to 24 hours).

**How it works:**

1. Select items in the Library and click **"Batch (50% off)"**
2. The app analyzes all selected items immediately (fast, cheap)
3. Face swap requests are bundled into a JSONL file and submitted to Google
4. A background poller checks for results every 30 seconds
5. When complete, swapped images are automatically uploaded to Jellyfin

Items show a **"Batch Pending"** status while waiting. The server handles everything in the background — you can close the browser and come back later.

> **Note:** The server must stay running for the batch poller to work. If using Docker with `restart: unless-stopped`, this is handled automatically.

## Backups & Restore

Every original image is backed up to `data/backups/` before any swap is applied. Backups are named by Jellyfin item ID and image type:

```
data/backups/
  abc123_poster_original.jpg
  abc123_backdrop_original.jpg
  abc123_landscape_original.jpg
```

To restore originals:
- **Web UI:** Use the restore functionality in the Jobs page
- **CLI:** `python cli.py --restore`

## Image Types

Jellyfin uses three image types that this app can swap:

| Image Type | Jellyfin Name | File on Disk | Used By |
|---|---|---|---|
| **Poster** | Primary | `folder.jpg` | All clients — main poster grid |
| **Backdrop** | Backdrop | `backdrop.jpg` | Detail page backgrounds, web UI |
| **Landscape** | Thumb | `landscape.jpg` | Android TV, Roku, horizontal card layouts |

The web UI lets you select any combination of these per title.

## Configuration

All configuration is done via the `.env` file. API keys are never stored in the database.

| Variable | Required | Description |
|---|---|---|
| `JELLYFIN_URL` | Yes | Your Jellyfin server URL (e.g., `http://192.168.1.100:8096`) |
| `JELLYFIN_API_KEY` | Yes | Jellyfin API key (Dashboard > API Keys) |
| `GEMINI_API_KEY` | Yes | Google AI API key from [AI Studio](https://aistudio.google.com/apikey) |
| `ANTHROPIC_API_KEY` | No | For Claude Vision as alternative analysis backend |
| `FAL_KEY` | No | For fal.ai as alternative face swap backend |
| `ANALYSIS_BACKEND` | No | `gemini` (default) or `claude` |
| `SWAP_BACKEND` | No | `gemini` (default) or `fal` |
| `HOST` | No | Server bind address (default: `0.0.0.0`) |
| `PORT` | No | Server port (default: `8000`) |

## Tech Stack

- **Backend:** FastAPI + Python 3.12
- **Frontend:** React + TypeScript + Tailwind CSS + Framer Motion
- **AI:** Google Gemini (analysis + image generation)
- **Database:** SQLite with automatic migrations
- **Deployment:** Docker (multi-stage build)

## Rate Limits

Google Gemini has a rate limit of 500 requests per minute. The app processes items with a 1-second delay between titles, resulting in approximately 60 RPM — well within limits. Batch mode has no client-side rate concerns as Google handles throttling server-side.

## Responsible Use

This tool is intended for personal use on private media servers. Please use it responsibly:

- **Only use face images you have permission to use** (your own photos, friends/family with consent)
- **Do not distribute modified artwork** — swapped images are for your private Jellyfin library only
- **Original artwork is copyrighted** — backups are created so you can always restore originals
- **Be mindful of your AI provider's terms of service** — review Google's [Acceptable Use Policy](https://ai.google.dev/gemini-api/terms)

The authors are not responsible for how this tool is used.

## License

MIT License — see [LICENSE](LICENSE) for details.
