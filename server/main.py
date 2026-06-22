# pip install -r requirements.txt
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
import json
import asyncio
import configparser
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import List
import time

import cv2
import numpy as np
from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Response, UploadFile, File, Form
from fastapi.responses import FileResponse

# ── Route modules ──────────────────────────────────────────────────────────────
from routes.compress.router  import router as compress_router,  run_once, trim_logs
from routes.thumbnail.router import router as thumbnail_router
from routes.cropper.router   import router as cropper_router
from routes.compare.router   import router as compare_router
from routes.font.router      import router as font_router
from routes.floorplan.router import router as floorplan_router

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

# ── Logging ────────────────────────────────────────────────────────────────────
log_file = os.path.join(current_dir, "cropper.log")
logger = logging.getLogger("cropper")
logger.setLevel(logging.INFO)

# Avoid adding multiple handlers if the file is reloaded
if not logger.handlers:
    fh = logging.FileHandler(log_file)
    fh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(fh)
    
    sh = logging.StreamHandler()
    sh.setFormatter(logging.Formatter('%(asctime)s - %(levelname)s - %(message)s'))
    logger.addHandler(sh)

# ── Scheduler ──────────────────────────────────────────────────────────────────
def auto_run_job():
    """Periodically check the inbox folder and compress any new files."""
    logger.info("Auto-checking folders for media and cropper...")
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
app.include_router(font_router)
app.include_router(floorplan_router)

from routes.cropper.router import _encode_img

@app.post("/manual-resize")
async def manual_resize_image(
    files: List[UploadFile] = File(...),
    target_w: int = 1920,
    target_h: int = 1080
):
    """
    Transient manual resize (session persistent only). Returns base64 data.
    """
    all_results = []
    logger.info(f"Manual Resize (Transient): {len(files)} files, target={target_w}x{target_h}")

    for file in files:
        try:
            contents = await file.read()
            nparr    = np.frombuffer(contents, np.uint8)
            img      = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            h, w = img.shape[:2]
            
            # Validation: if image is smaller than target, return original without cropping
            if w < target_w or h < target_h:
                logger.info(f"Manual upload {file.filename} smaller than {target_w}x{target_h}. Returning original.")
                img_data = _encode_img(img, file.filename)
                all_results.append({
                    "fileName":    file.filename,
                    "centerCrop":  img_data["url"],
                    "centerStats": "Original (too small for crop)",
                    "topCrop":     img_data["url"],
                    "topStats":    "Original (too small for crop)",
                    "bottomCrop":  img_data["url"],
                    "bottomStats": "Original (too small for crop)",
                    "targetRes":   f"{target_w}x{target_h}"
                })
                continue

            target_aspect = target_w / target_h
            input_aspect  = w / h

            if input_aspect > target_aspect:
                new_h, new_w = h, int(h * target_aspect)
            else:
                new_w, new_h = w, int(w / target_aspect)

            cy, cx = (h - new_h) // 2, (w - new_w) // 2

            center_final = cv2.resize(img[cy:cy + new_h, cx:cx + new_w], (target_w, target_h))
            top_final    = cv2.resize(img[0:new_h, cx:cx + new_w],       (target_w, target_h))
            bottom_final = cv2.resize(img[h-new_h:h, cx:cx + new_w],     (target_w, target_h))

            center_data = _encode_img(center_final, file.filename)
            top_data    = _encode_img(top_final,    file.filename)
            bottom_data = _encode_img(bottom_final, file.filename)

            all_results.append({
                "fileName":    file.filename,
                "centerCrop":  center_data["url"],
                "centerStats": center_data["stats"],
                "topCrop":     top_data["url"],
                "topStats":    top_data["stats"],
                "bottomCrop":  bottom_data["url"],
                "bottomStats": bottom_data["stats"],
                "targetRes":   f"{target_w}x{target_h}"
            })
            logger.info(f"Successfully processed manual upload: {file.filename}")
        except Exception as e:
            logger.error(f"Manual Resize Error: {e}")
            continue

    return {"results": all_results}

# ── Utility / Legacy endpoints (kept here for backward compatibility) ──────────

@app.get("/ping")
async def ping():
    return {"ping": "pong"}


@app.get("/cropper/logs")
async def get_cropper_logs():
    """Returns the last 100 lines of the cropper log file."""
    if not os.path.exists(log_file):
        return {"logs": "Log file not found."}
    
    try:
        with open(log_file, "r") as f:
            lines = f.readlines()
            return {"logs": "".join(lines[-100:])}
    except Exception as e:
        return {"logs": f"Error reading logs: {str(e)}"}


@app.get("/folder-status")
async def get_folder_status():
    if not os.path.exists(CROP_INBOX):
        return {"count": 0, "files": [], "error": f"Path {CROP_INBOX} not found"}
    
    valid_exts = (".png", ".jpg", ".jpeg", ".webp")
    # List files directly in the inbox root
    all_files = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts) and os.path.isfile(os.path.join(CROP_INBOX, f))]
            
    return {"count": len(all_files), "files": all_files}


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
    """
    Returns a list of recently processed images by looking at the ORIGINALS folder.
    Each item includes URLs for the standard 1920x1080 crops.
    """
    originals_dir = os.path.join(CROP_PROCESSED, "ORIGINALS")
    if not os.path.exists(originals_dir):
        return {"history": []}

    history = []
    try:
        files = sorted(
            [f for f in os.listdir(originals_dir) if os.path.isfile(os.path.join(originals_dir, f))],
            key=lambda f: os.path.getmtime(os.path.join(originals_dir, f)),
            reverse=True,
        )
        
        for filename in files[:20]:
            # Default preview uses 1920x1080
            history.append({
                "folder": filename, # Using filename as identifier
                "original_file": filename,
                "targetRes": "Multi-Dimension",
                "centerStats": "Processed",
                "topStats": "Processed",
                "bottomStats": "Processed"
            })
    except Exception as e:
        logger.error(f"History Error: {e}")

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
    valid_exts = (".png", ".jpg", ".jpeg", ".webp")
    dimensions = [
        (1920, 1080),
        (3840, 2160),
        (800, 450),
        (800, 534)
    ]
    
    total_processed = 0
    logger.info("Starting multi-dimension batch processing...")

    if not os.path.exists(CROP_INBOX):
        return {"status": "error", "message": "Inbox not found"}

    files = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts) and os.path.isfile(os.path.join(CROP_INBOX, f))]
    
    if not files:
        logger.info("No files found in inbox.")
        return {"status": "success", "processed": 0}

    # Ensure output base directories exist
    os.makedirs(CROP_PROCESSED, exist_ok=True)
    originals_dir = os.path.join(CROP_PROCESSED, "ORIGINALS")
    os.makedirs(originals_dir, exist_ok=True)

    for filename in files:
        file_path = os.path.join(CROP_INBOX, filename)
        img = cv2.imread(file_path)
        if img is None:
            logger.warning(f"Failed to read image: {file_path}")
            continue

        h, w = img.shape[:2]
        logger.info(f"Processing image: {filename} ({w}x{h})")

        for (tw, th) in dimensions:
            dim_str = f"{tw}x{th}"
            
            # Create dimension-specific folders
            center_dir = os.path.join(CROP_PROCESSED, dim_str, "center")
            top_dir    = os.path.join(CROP_PROCESSED, dim_str, "top")
            bottom_dir = os.path.join(CROP_PROCESSED, dim_str, "bottom")
            os.makedirs(center_dir, exist_ok=True)
            os.makedirs(top_dir,    exist_ok=True)
            os.makedirs(bottom_dir, exist_ok=True)

            # Check if image is smaller than target dimensions
            if w < tw or h < th:
                logger.info(f"  {dim_str}: Image smaller than target. Saving original as is.")
                shutil.copy2(file_path, os.path.join(center_dir, filename))
                shutil.copy2(file_path, os.path.join(top_dir,    filename))
                shutil.copy2(file_path, os.path.join(bottom_dir, filename))
                continue

            aspect = tw / th
            if (w / h) > aspect:
                new_h, new_w = h, int(h * aspect)
            else:
                new_w, new_h = w, int(w / aspect)

            cx, cy = (w - new_w) // 2, (h - new_h) // 2
            center_crop = cv2.resize(img[cy:cy + new_h, cx:cx + new_w], (tw, th))
            top_crop    = cv2.resize(img[0:new_h, cx:cx + new_w],       (tw, th))
            bottom_crop = cv2.resize(img[h-new_h:h, cx:cx + new_w],     (tw, th))

            # Import the in-memory compressor
            from routes.compress.router import compress_image_bytes

            # Save Center Crop
            _, c_buf = cv2.imencode(".jpg", center_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            c_raw = c_buf.tobytes()
            c_bytes = compress_image_bytes(c_raw, filename, quality=85)
            with open(os.path.join(center_dir, filename), "wb") as f:
                f.write(c_bytes)

            # Save Top Crop
            _, t_buf = cv2.imencode(".jpg", top_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            t_raw = t_buf.tobytes()
            t_bytes = compress_image_bytes(t_raw, filename, quality=85)
            with open(os.path.join(top_dir, filename), "wb") as f:
                f.write(t_bytes)

            # Save Bottom Crop
            _, b_buf = cv2.imencode(".jpg", bottom_crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
            b_raw = b_buf.tobytes()
            b_bytes = compress_image_bytes(b_raw, filename, quality=85)
            with open(os.path.join(bottom_dir, filename), "wb") as f:
                f.write(b_bytes)

            logger.info(f"  {dim_str}: Processed center, top and bottom crops.")

        # Move original file to archive
        dest_original = os.path.join(originals_dir, filename)
        if os.path.exists(dest_original):
            # If file already exists in originals, add a timestamp
            base, ext = os.path.splitext(filename)
            dest_original = os.path.join(originals_dir, f"{base}_{int(time.time())}{ext}")
            
        shutil.move(file_path, dest_original)
        total_processed += 1
        logger.info(f"Finished processing {filename}. Moved to ORIGINALS.")

    logger.info(f"Batch processing completed. Total processed: {total_processed}")
    return {"status": "success", "processed": total_processed}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
