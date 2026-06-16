import base64
import os
from typing import List, Dict

import cv2
import fitz
import numpy as np
from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/compare", tags=["compare"])


def compare_word_lists(str1: List[str], str2: List[str]):
    """Categorise text changes between two word lists."""
    added   = [w for w in str2 if w not in str1]
    removed = [w for w in str1 if w not in str2]

    if added or removed:
        description = "Text changed."
        if removed:
            description += f" Text '{' '.join(removed[:3])}...' was REMOVED."
        if added:
            description += f" Text '{' '.join(added[:3])}...' was ADDED."
        return description
    return None


@router.post("/")
async def compare_docs(file1: UploadFile = File(...), file2: UploadFile = File(...)):
    """
    Compares two PDF files page-by-page (text + pixel diff) and returns
    a list of detected differences.
    """
    doc1_bytes = await file1.read()
    doc2_bytes = await file2.read()

    doc1 = fitz.open(stream=doc1_bytes, filetype="pdf")
    doc2 = fitz.open(stream=doc2_bytes, filetype="pdf")

    changes = []

    for page_num in range(min(len(doc1), len(doc2))):
        page1 = doc1[page_num]
        page2 = doc2[page_num]
        label = f"Página {page_num + 1}"

        # ── STEP 1: Compare text structure ────────────────────────────────────
        str1 = [w[4] for w in page1.get_text("words")]
        str2 = [w[4] for w in page2.get_text("words")]

        if str1 != str2:
            description = compare_word_lists(str1, str2)
            if description:
                changes.append({"section": label, "type": "text", "description": description})

        # ── STEP 2: Compare pixels ────────────────────────────────────────────
        pix1 = page1.get_pixmap()
        pix2 = page2.get_pixmap()

        img1 = np.frombuffer(pix1.samples, dtype=np.uint8).reshape((pix1.height, pix1.width, 3))
        img2 = np.frombuffer(pix2.samples, dtype=np.uint8).reshape((pix2.height, pix2.width, 3))

        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        diff   = cv2.absdiff(img1, img2)
        gray   = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
        _, thresh = cv2.threshold(gray, 25, 255, cv2.THRESH_BINARY)

        if np.count_nonzero(thresh) > 500:
            # ── STEP 3: Intelligent discrimination ───────────────────────────
            if str1 == str2:
                changes.append({
                    "section":     label,
                    "type":        "image",
                    "description": "Visual change detected (Image, color, or inversion) but text layer is identical.",
                })

    return {"summary": f"Detected {len(changes)} specific differences.", "changes": changes}
