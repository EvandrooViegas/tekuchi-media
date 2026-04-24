# pip install fastapi uvicorn pymupdf opencv-python numpy python-multipart pillow apscheduler
#
# Run with:
#   cd server
#   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
#
# All routes are mounted under their own prefix:
#   POST  /compress/           -> upload file(s) to be compressed
#   GET   /compress/logs       -> view job log
#   POST  /compress/cancel     -> cancel a running job
#   POST  /thumbnail/          -> generate PDF thumbnail(s)
#   POST  /cropper/resize-image -> crop + compress image(s)
#   POST  /compare/            -> compare two PDF files
#   GET   /folder-status       -> inbox file list
#   GET   /local-preview       -> serve a small preview of a local file
#   GET   /processed-history   -> list recently processed folders
#   GET   /full-resolution     -> serve the full-size version of a local file
#   POST  /run-batch           -> manually trigger the inbox batch job
#   GET   /ping                -> health check

import os
import shutil
import uuid
import configparser
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List

import cv2
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Response, UploadFile, File
from fastapi.responses import FileResponse

# ── Route modules ──────────────────────────────────────────────────────────────
from routes.compress.router  import router as compress_router,  run_once, trim_logs
from routes.thumbnail.router import router as thumbnail_router
from routes.cropper.router   import router as cropper_router
from routes.compare.router   import router as compare_router

# ── Config ─────────────────────────────────────────────────────────────────────
config      = configparser.ConfigParser()
current_dir = os.path.dirname(os.path.abspath(__file__))
root_dir    = os.path.abspath(os.path.join(current_dir, ".."))
config_path = os.path.join(root_dir, "config.ini")

if not os.path.exists(config_path):
    raise FileNotFoundError(f"Could not find config.ini at {config_path}")

config.read(config_path)

if "paths" not in config:
    raise KeyError(f"The config file at {config_path} is missing the [paths] section.")

CROP_INBOX     = config["paths"]["cropper_inbox"]
CROP_PROCESSED = config["paths"]["cropper_processed"]
POLL_INTERVAL  = config.getint("general", "interval", fallback=5)

# ── Scheduler ──────────────────────────────────────────────────────────────────
def auto_run_job():
    """Periodically check the inbox folder and compress any new files."""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Auto-checking folders for media and cropper...")
    import asyncio
    asyncio.run(run_all_async())

async def run_all_async():
    trim_logs()
    run_once()         # 1. Process Media Converter Inbox
    await run_batch()  # 2. Process Image Cropper Inbox

scheduler = BackgroundScheduler()
scheduler.add_job(auto_run_job, "interval", seconds=POLL_INTERVAL)

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    print(f"Automation started: checking inbox every {POLL_INTERVAL}s")
    yield
    scheduler.shutdown()

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Tekuchi Media Server",
    description="Compress, thumbnail, crop, and compare media files.",
    version="2.0.0",
    lifespan=lifespan,
)

# Register all sub-routers
app.include_router(compress_router)
app.include_router(thumbnail_router)
app.include_router(cropper_router)
app.include_router(compare_router)

# ── Utility / Legacy endpoints (kept here for backward compatibility) ──────────

@app.get("/ping")
async def ping():
    return {"ping": "pong"}


@app.get("/folder-status")
async def get_folder_status():
    if not os.path.exists(CROP_INBOX):
        return {"count": 0, "files": [], "error": f"Path {CROP_INBOX} not found"}
    valid_exts = (".png", ".jpg", ".jpeg", ".webp")
    files = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts)]
    return {"count": len(files), "files": files}


@app.get("/local-preview")
async def get_local_preview(filename: str, isProcessed: bool = False):
    base_path    = CROP_PROCESSED if isProcessed else CROP_INBOX
    clean_filename = filename.replace("/", os.sep).replace("\\", os.sep)
    file_path    = os.path.normpath(os.path.join(base_path, clean_filename))

    if not os.path.exists(file_path):
        print(f"DEBUG: File not found -> {file_path}")
        return Response(status_code=404)

    img = cv2.imread(file_path)
    if img is None:
        return Response(status_code=400)

    h, w       = img.shape[:2]
    preview_w  = 300
    preview_h  = int(h * (preview_w / w))
    preview    = cv2.resize(img, (preview_w, preview_h))

    _, buffer = cv2.imencode(".jpg", preview)
    return Response(content=buffer.tobytes(), media_type="image/jpeg")


@app.get("/processed-history")
async def get_processed_history():
    if not os.path.exists(CROP_PROCESSED):
        return {"history": []}

    history = []
    try:
        folders = sorted(
            [d for d in os.listdir(CROP_PROCESSED) if os.path.isdir(os.path.join(CROP_PROCESSED, d))],
            key=lambda d: os.path.getmtime(os.path.join(CROP_PROCESSED, d)),
            reverse=True,
        )
        for folder in folders[:15]:
            folder_path   = os.path.join(CROP_PROCESSED, folder)
            center_imgs   = [f for f in os.listdir(folder_path) if f.startswith("center_")]
            original_imgs = [f for f in os.listdir(folder_path) if f.startswith("original_")]
            if center_imgs:
                stats = {}
                stats_file = os.path.join(folder_path, "stats.json")
                if os.path.exists(stats_file):
                    import json
                    try:
                        with open(stats_file, "r") as f:
                            stats = json.load(f)
                    except Exception:
                        pass

                history.append({
                    "folder":        folder,
                    "preview":       center_imgs[0],
                    "original_file": original_imgs[0] if original_imgs else None,
                    "centerStats":   stats.get("centerStats"),
                    "topStats":      stats.get("topStats"),
                })
    except Exception as e:
        print(f"History Error: {e}")

    return {"history": history}


@app.get("/full-resolution")
async def get_full_resolution(filename: str, isProcessed: bool = False):
    """Serves the full-sized image for viewing and downloading."""
    base_path     = CROP_PROCESSED if isProcessed else CROP_INBOX
    safe_filename = filename.replace("/", os.sep).replace("\\", os.sep)
    file_path     = os.path.normpath(os.path.join(base_path, safe_filename))

    if not os.path.exists(file_path):
        return Response(status_code=404)

    return FileResponse(file_path)


@app.post("/run-batch")
async def run_batch():
    """Manually trigger a full batch crop of images in the inbox folder."""
    valid_exts     = (".png", ".jpg", ".jpeg", ".webp")
    files          = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts)]
    processed_count = 0

    for filename in files:
        file_path = os.path.join(CROP_INBOX, filename)
        img       = cv2.imread(file_path)
        if img is None:
            continue

        base_name   = os.path.splitext(filename)[0]
        folder_name = base_name
        counter     = 1
        while os.path.exists(os.path.join(CROP_PROCESSED, folder_name)):
            folder_name = f"{base_name}_{counter}"
            counter    += 1

        output_folder = os.path.join(CROP_PROCESSED, folder_name)
        os.makedirs(output_folder, exist_ok=True)

        h, w    = img.shape[:2]
        aspect  = 1920 / 1080
        if (w / h) > aspect:
            new_h, new_w = h, int(h * aspect)
        else:
            new_w, new_h = w, int(w / aspect)

        cx, cy      = (w - new_w) // 2, (h - new_h) // 2
        center_crop = cv2.resize(img[cy:cy + new_h, cx:cx + new_w], (1920, 1080))
        top_crop    = cv2.resize(img[0:new_h, cx:cx + new_w],       (1920, 1080))

        # Import the in-memory compressor
        from routes.compress.router import compress_image_bytes

        # Compress and save Center Crop
        _, c_buf = cv2.imencode(".jpg", center_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        c_raw = c_buf.tobytes()
        c_bytes  = compress_image_bytes(c_raw, f"center_{folder_name}.jpg", quality=85)
        with open(os.path.join(output_folder, f"center_{folder_name}.jpg"), "wb") as f:
            f.write(c_bytes)
        print(f"  [Background Cropper] Center Crop: {len(c_raw)//1024}KB -> {len(c_bytes)//1024}KB")

        # Compress and save Top Crop
        _, t_buf = cv2.imencode(".jpg", top_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
        t_raw = t_buf.tobytes()
        t_bytes  = compress_image_bytes(t_raw, f"top_{folder_name}.jpg", quality=85)
        with open(os.path.join(output_folder, f"top_{folder_name}.jpg"), "wb") as f:
            f.write(t_bytes)
        print(f"  [Background Cropper] Top Crop: {len(t_raw)//1024}KB -> {len(t_bytes)//1024}KB")

        import json
        with open(os.path.join(output_folder, "stats.json"), "w") as f:
            json.dump({
                "centerStats": f"{len(c_raw)//1024}KB -> {len(c_bytes)//1024}KB",
                "topStats": f"{len(t_raw)//1024}KB -> {len(t_bytes)//1024}KB"
            }, f)

        shutil.move(file_path, os.path.join(output_folder, f"original_{filename}"))

        processed_count += 1

    return {"status": "success", "processed": processed_count}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
