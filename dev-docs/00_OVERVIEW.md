# Tekuchi Media Suite — Developer Overview

This document is the entry point for new engineers. Read this first, then pick up the
per-feature docs for whatever area you're working on.

---

## Repository Layout

```
tekuchi-media (1)/
├── app/                          # Next.js App Router pages + API routes
│   ├── layout.tsx                # Root layout: Navbar, Toaster, fonts
│   ├── navbar.tsx                # Global nav with dropdown groups
│   ├── compressor/               # Media Compressor page
│   ├── resizer/                  # Image Resizer page
│   ├── thumbnailer/              # PDF Thumbnailer page
│   ├── font-converter/           # Font Converter page
│   ├── image-duplicator/         # Image Duplicator page
│   ├── comparer/                 # PDF Comparer page
│   ├── blueprint-mirror/         # Blueprint Mirror page
│   ├── pdf-bulk-downloader/      # PDF Bulk Downloader page
│   ├── docs/                     # In-app documentation viewer
│   └── api/                      # Next.js Route Handlers (see below)
│       ├── (compressor)/         # Route group — no URL effect
│       ├── (resize)/
│       ├── (thumbnail)/
│       ├── (font)/
│       ├── (comparer)/
│       ├── (blueprint-mirror)/
│       ├── (pdf-bulk)/
│       └── image-duplicator/
├── components/
│   ├── ui/                       # shadcn/radix component library
│   └── docs-banner.tsx           # Footer docs-link shown on every page
├── lib/
│   ├── config.ts                 # config.ini reader + PYTHON_API_URL
│   └── utils.ts                  # cn() Tailwind merge helper
├── server/                       # FastAPI Python backend
│   ├── main.py                   # App entrypoint, scheduler, legacy routes
│   ├── requirements.txt
│   └── routes/
│       ├── compress/router.py    # Media compression pipeline
│       ├── compare/router.py     # PDF diff (PyMuPDF + OpenCV)
│       ├── thumbnail/router.py   # PDF-to-JPEG cover (PyMuPDF)
│       ├── font/router.py        # Font format conversion (fonttools)
│       └── cropper/router.py     # Image crop/resize (OpenCV)
├── config.ini                    # Filesystem paths + processing settings
├── next.config.ts                # Next.js config
├── package.json
└── manager.bat                   # Dev launcher (starts Python + Next.js)
```

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend framework | Next.js 16.2.1 (App Router) | Uses `'use client'` everywhere — all pages are client components |
| UI | React 19.2.4 | |
| Styling | Tailwind CSS v4 + tw-animate-css | No dark mode, slate-based palette |
| Components | shadcn/radix (`radix-ui` monorepo package) | `class-variance-authority` for variants |
| Toast | Sonner 2.x | `<Toaster>` registered in `app/layout.tsx` |
| Icons | lucide-react | @tabler/icons-react used inside UI components only |
| Server-side image ops | sharp 0.32 | Runs in Node.js API routes |
| OCR | tesseract.js 7.0.0 | `serverExternalPackages` — not bundled by webpack |
| ZIP (client) | jszip | Used in PDF bulk downloader and blueprint mirror |
| ZIP (server) | archiver | Used in image duplicator API route |
| Python backend | FastAPI + uvicorn | Port 8000. Proxied from Next.js API routes |
| Python image processing | OpenCV, Pillow | |
| Python PDF ops | PyMuPDF (fitz) | |
| Python font ops | fonttools[woff] + brotli | |
| Scheduling | APScheduler | Periodic inbox polling |
| External tools | FFmpeg, Ghostscript | Must be installed on the host machine |

---

## Two-Process Architecture

```
Browser
   │
   ▼
Next.js (port 3000)
   │
   ├── Pure Node routes (no Python)
   │     app/api/(blueprint-mirror)/blueprint-mirror/   sharp + Tesseract
   │     app/api/image-duplicator/process/              archiver ZIP
   │     app/api/(pdf-bulk)/pdf-proxy/                  HTTP polling proxy
   │     app/api/(compressor)/media/                    disk file server
   │     app/api/(compressor)/download/                 disk file server
   │
   └── Proxy routes (forward to Python)
         /api/upload       → POST /compress/upload
         /api/run          → POST /compress/run
         /api/logs         → GET  /compress/logs
         /api/resize       → POST /manual-resize
         /api/thumbnail    → POST /thumbnail/
         /api/compare      → POST /compare/
         /api/font         → POST /font/convert
         /api/resize/*     → GET  /folder-status, /run-batch, etc.
         │
         ▼
      Python FastAPI (port 8000)
         FFmpeg  ◄─── video/image processing
         Ghostscript ◄── PDF compression
         OpenCV, Pillow, PyMuPDF, fonttools
```

The Python server **must be running** for most tools. Start it with `manager.bat` (Windows) or:

```bash
cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

Override the Python URL with the `PYTHON_API_URL` environment variable if running on a different host/port.

---

## Configuration (`config.ini`)

All filesystem paths live here. The `%(base_path)s` syntax is Python-style interpolation — handled in TypeScript via a `Proxy` in `lib/config.ts`.

```ini
[paths]
base_path  = V:\0000 Tekuchi Media Processor
inbox      = %(base_path)s\TODO          # compressor input
converted  = %(base_path)s\PROCESSED     # compressor output
archive    = %(base_path)s\PROCESSED_SOURCES
processing = %(base_path)s\processing
cropper_inbox     = %(base_path)s\VIEWS_TODO
cropper_processed = %(base_path)s\VIEWS_PROCESSED

[images]
target_height = 1080   # compressor 1080p target

[video]
max_width  = 1920
max_height = 1080

[general]
interval = 900         # Python scheduler polling interval (seconds)
```

---

## Starting the Dev Environment

The easiest way is `manager.bat` — it kills any existing Python/Node processes, installs deps, then launches both servers. Logs stream to `logs/api.log` and `logs/frontend.log`.

Manual start:

```bash
# Terminal 1 — Python backend
cd server
python -m uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Next.js
npm run dev
```

---

## Adding a New Page

1. Create `app/my-tool/page.tsx` — use `'use client'` at the top.
2. Create API route(s) under `app/api/` (use a route group folder `(my-tool)` for organisation).
3. Add the tool to the `NAV_GROUPS` array in `app/navbar.tsx`.
4. Add a doc entry to `doc/` and register it in `app/docs/page.tsx` (`DOC_CATEGORIES`, `DOC_METADATA`).
5. Add a `<DocsBanner docFile="XX_MY_TOOL" explanation="…" />` at the bottom of the page.

---

## Per-Feature Documentation

| File | Covers |
|---|---|
| `01_ARCHITECTURE.md` | API route patterns, config system, shared components |
| `02_COMPRESSOR.md` | Media Compressor — upload, processing pipeline, 4K output |
| `03_RESIZER.md` | Image Resizer — batch automation and manual upload modes |
| `04_THUMBNAILER.md` | PDF Thumbnailer |
| `05_FONT_CONVERTER.md` | Font Converter |
| `06_IMAGE_DUPLICATOR.md` | Image Duplicator — CSV mapping, ZIP assembly |
| `07_COMPARER.md` | PDF Comparer — diff algorithm, export |
| `08_BLUEPRINT_MIRROR.md` | Blueprint Mirror — sharp flip, OCR, region painter |
| `09_PDF_BULK_DOWNLOADER.md` | PDF Bulk Downloader — concurrency, polling, ZIP |
