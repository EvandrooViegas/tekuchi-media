import base64
import os
from typing import List

import cv2
import numpy as np
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import FileResponse, Response

# Import the in-memory compressor helper from the compress route
from routes.compress.router import compress_image_bytes

router = APIRouter(prefix="/cropper", tags=["cropper"])

TARGET_W = 1920
TARGET_H = 1080


def _encode_img(cv_img: np.ndarray, filename: str) -> str:
    """
    Encode an OpenCV image to JPEG bytes, compress them with Pillow,
    and return a base64 data-URI.
    """
    _, buffer = cv2.imencode(".jpg", cv_img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    raw_bytes = buffer.tobytes()

    # ── Compression step (new) ───────────────────────────────────────────────
    compressed = compress_image_bytes(raw_bytes, filename or "crop.jpg", quality=85)

    orig_kb = len(raw_bytes) // 1024
    comp_kb = len(compressed) // 1024
    print(f"  [Cropper API] {filename or 'Image'} compressed: {orig_kb}KB -> {comp_kb}KB")

    return {
        "url": f"data:image/jpeg;base64,{base64.b64encode(compressed).decode('utf-8')}",
        "stats": f"{orig_kb}KB -> {comp_kb}KB"
    }


@router.post("/resize-image")
async def resize_image(files: List[UploadFile] = File(...)):
    """
    Accepts images, performs center + top crops to 1920×1080, compresses
    each crop with the compressor engine, and returns base64 data-URIs.
    """
    all_results = []

    for file in files:
        try:
            contents = await file.read()
            nparr    = np.frombuffer(contents, np.uint8)
            img      = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

            if img is None:
                continue

            h, w           = img.shape[:2]
            target_aspect  = TARGET_W / TARGET_H
            input_aspect   = w / h

            if input_aspect > target_aspect:
                new_h, new_w = h, int(h * target_aspect)
            else:
                new_w, new_h = w, int(w / target_aspect)

            cy, cx = (h - new_h) // 2, (w - new_w) // 2

            center_final = cv2.resize(img[cy:cy + new_h, cx:cx + new_w], (TARGET_W, TARGET_H))
            top_final    = cv2.resize(img[0:new_h, cx:cx + new_w],       (TARGET_W, TARGET_H))

            center_data = _encode_img(center_final, file.filename)
            top_data    = _encode_img(top_final,    file.filename)

            all_results.append({
                "fileName":    file.filename,
                "centerCrop":  center_data["url"],
                "centerStats": center_data["stats"],
                "topCrop":     top_data["url"],
                "topStats":    top_data["stats"],
            })
        except Exception as e:
            print(f"Error processing {file.filename}: {e}")
            continue

    return {"results": all_results}
