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

import logging
logger = logging.getLogger("cropper")

def _encode_img(cv_img: np.ndarray, filename: str) -> dict:
    """
    Encode an OpenCV image to JPEG bytes, compress them with Pillow,
    and return a base64 data-URI.
    """
    _, buffer = cv2.imencode(".jpg", cv_img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    raw_bytes = buffer.tobytes()

    # ── Compression step ──
    compressed = compress_image_bytes(raw_bytes, filename or "crop.jpg", quality=85)

    orig_kb = len(raw_bytes) // 1024
    comp_kb = len(compressed) // 1024
    logger.info(f"  [Cropper API] {filename or 'Image'} compressed: {orig_kb}KB -> {comp_kb}KB")

    return {
        "url": f"data:image/jpeg;base64,{base64.b64encode(compressed).decode('utf-8')}",
        "stats": f"{orig_kb}KB -> {comp_kb}KB"
    }
