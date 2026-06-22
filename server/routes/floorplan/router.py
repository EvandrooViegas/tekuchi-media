# -*- coding: utf-8 -*-
# routes/floorplan/router.py
#
# Extracts ONLY the floor-plan drawing — not text, not decorations, not images.
#
# How it decides whether a page contains a floor-plan:
#   - Uses PyMuPDF get_drawings() to get all vector paths
#   - Filters out decorative strokes: paths that are thin horizontal/vertical
#     lines (likely table rules or underlines), very small paths, and paths
#     outside the "drawing zone" (right 65% of the page — left side is text)
#   - Requires a minimum number of qualifying paths (>= MIN_PATHS) — a real
#     floor-plan has many lines; a simple image/text page has very few
#   - Requires the bounding box of qualifying paths to cover at least
#     MIN_DRAWING_COVERAGE of the page area
#   - If those conditions aren't met → page is skipped (not a floor-plan)
#
# Transparency:
#   - Background colour is sampled from the image corners
#   - All pixels within BG_TOLERANCE are made transparent (global, not just edge)
#   - Interior fills (room areas) are also transparent
#   - Alpha is trimmed to the tightest non-transparent bounding box

import asyncio
import base64
import io
import json as _json
import logging
import re
from typing import List, Optional, Tuple

import cv2
import fitz
import numpy as np
import pdfplumber
from PIL import Image
from scipy import ndimage
from fastapi import APIRouter, UploadFile, File
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/floorplan", tags=["floorplan"])
log    = logging.getLogger("floorplan")

# ── Tuning constants ───────────────────────────────────────────────────────────

DPI               = 200    # render DPI for final crop
PADDING           = 20     # padding around extracted regions

# Floor-plan detection thresholds (vector-based)
MIN_PATHS         = 30     # must have ≥ 30 qualifying paths to be a floor-plan
MIN_PATH_AREA     = 200    # individual path bbox must be ≥ 200 pt² (filters tiny strokes)
MAX_PATH_AR       = 20     # max aspect ratio for a single path (filters long horizontal rules)
MIN_PAGE_COVERAGE = 0.10   # drawing bbox must cover ≥ 10% of page area
TEXT_ZONE_FRAC    = 0.30   # left 30% of page is "text zone" — paths there are excluded

# Background removal (teal-based detection)
BG_TOLERANCE      = 45     # per-channel tolerance for background pixel removal
NEAR_WHITE_THRESH = 228    # pixels brighter than this on all channels → transparent

# Teal detection (for region-based extraction)
TEAL_R_MIN, TEAL_R_MAX = 185, 232
TEAL_G_MIN, TEAL_G_MAX = 215, 255
TEAL_B_MIN, TEAL_B_MAX = 200, 243
TEAL_G_R_MIN = 4   # G - R must be > this
TEAL_G_B_MIN = 2   # G - B must be > this
MIN_REGION_AREA = 0.01  # minimum region size as fraction of page


# ── Teal detection (region-based extraction) ──────────────────────────────────

def _is_teal(arr: np.ndarray) -> np.ndarray:
    """Return boolean mask of teal pixels."""
    r = arr[:, :, 0].astype(int)
    g = arr[:, :, 1].astype(int)
    b = arr[:, :, 2].astype(int)
    
    return (
        (r >= TEAL_R_MIN) & (r <= TEAL_R_MAX) &
        (g >= TEAL_G_MIN) & (g <= TEAL_G_MAX) &
        (b >= TEAL_B_MIN) & (b <= TEAL_B_MAX) &
        (g - r > TEAL_G_R_MIN) &
        (g - b > TEAL_G_B_MIN)
    )


def _flood_fill_background(arr: np.ndarray) -> np.ndarray:
    """Flood-fill teal background from page edges."""
    teal = _is_teal(arr)
    h, w = arr.shape[:2]
    
    seed = np.zeros((h, w), dtype=bool)
    seed[0, :] = teal[0, :]
    seed[-1, :] = teal[-1, :]
    seed[:, 0] = teal[:, 0]
    seed[:, -1] = teal[:, -1]
    
    filled = seed.copy()
    while True:
        expanded = ndimage.binary_dilation(filled, structure=np.ones((3, 3), dtype=bool))
        expanded = expanded & teal
        if np.array_equal(expanded, filled):
            break
        filled = expanded
    
    return filled


def _find_plan_regions(arr: np.ndarray) -> List[Tuple[int, int, int, int]]:
    """
    Find non-teal regions (floorplans) in the image.
    Returns list of (rmin, rmax, cmin, cmax) tuples.
    """
    teal = _is_teal(arr)
    h, w = arr.shape[:2]
    
    # Search only in main content area (exclude left text zone and margins)
    search = ~teal.copy()
    search[:, :int(w * 0.30)] = False  # left 30% is text
    search[:int(h * 0.05), :] = False  # top margin
    search[int(h * 0.88):, :] = False  # bottom margin
    
    labeled, n = ndimage.label(search)
    if n == 0:
        return []
    
    sizes = ndimage.sum(search, labeled, range(1, n + 1))
    min_size = h * w * MIN_REGION_AREA
    big_labels = [i + 1 for i, s in enumerate(sizes) if s > min_size]
    
    regions = []
    for lbl in big_labels:
        mask = labeled == lbl
        rows = np.any(mask, axis=1)
        cols = np.any(mask, axis=0)
        rmin, rmax = np.where(rows)[0][[0, -1]]
        cmin, cmax = np.where(cols)[0][[0, -1]]
        regions.append((rmin, rmax, cmin, cmax))
    
    regions.sort(key=lambda r: r[0])
    return regions


# ── Floor-plan detection (vector-based fallback) ─────────────────────────────

def _get_floorplan_bbox(page: fitz.Page) -> Optional[fitz.Rect]:
    """
    Analyse vector paths and return the bounding box of the floor-plan drawing,
    or None if no convincing floor-plan is found.
    """
    page_w = page.rect.width
    page_h = page.rect.height
    text_x_threshold = page_w * TEXT_ZONE_FRAC

    drawings = page.get_drawings()
    if not drawings:
        return None

    qualifying: List[fitz.Rect] = []

    for d in drawings:
        r = d.get("rect")
        if r is None:
            continue

        bw, bh = r.width, r.height
        area   = bw * bh

        # Skip tiny paths (dots, tick marks)
        if area < MIN_PATH_AREA:
            continue

        # Skip very elongated paths (horizontal rules, underlines, table lines)
        if bw > 0 and bh > 0:
            ar = max(bw / bh, bh / bw)
            if ar > MAX_PATH_AR:
                continue

        # Skip paths entirely in the text zone (left side of page)
        if r.x1 < text_x_threshold:
            continue

        qualifying.append(r)

    # Not enough paths → this is not a floor-plan page
    if len(qualifying) < MIN_PATHS:
        log.debug("  skip: only %d qualifying paths (need %d)", len(qualifying), MIN_PATHS)
        return None

    # Union all qualifying rects
    union = qualifying[0]
    for r in qualifying[1:]:
        union = union | r

    # Drawing must cover a meaningful portion of the page
    coverage = (union.width * union.height) / (page_w * page_h)
    if coverage < MIN_PAGE_COVERAGE:
        log.debug("  skip: coverage %.2f < %.2f", coverage, MIN_PAGE_COVERAGE)
        return None

    return union


# ── Rendering ─────────────────────────────────────────────────────────────────

def _render_region(page: fitz.Page, rect: fitz.Rect, dpi: int) -> np.ndarray:
    """Render a specific rect of a page to an RGB numpy array."""
    mat = fitz.Matrix(dpi / 72, dpi / 72)
    pix = page.get_pixmap(matrix=mat, clip=rect, colorspace=fitz.csRGB)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)


# ── Background removal (original method) ──────────────────────────────────────

def _sample_bg(arr: np.ndarray) -> Tuple[int, int, int]:
    """Sample background colour from image edges."""
    h, w = arr.shape[:2]
    edge_pixels = np.concatenate([
        arr[0,    :],   # top row
        arr[h-1,  :],   # bottom row
        arr[:,    0],   # left col
        arr[:,   -1],   # right col
    ])
    return (
        int(np.median(edge_pixels[:, 0])),
        int(np.median(edge_pixels[:, 1])),
        int(np.median(edge_pixels[:, 2])),
    )


def _make_transparent(arr: np.ndarray) -> Image.Image:
    """
    Make background and near-white pixels transparent.
    Operates on every pixel (global, not flood-fill) so interior room
    areas are also correctly transparent.
    """
    bg_r, bg_g, bg_b = _sample_bg(arr)

    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)

    # Pixels similar to the sampled background colour
    bg_match = (
        (np.abs(r - bg_r) <= BG_TOLERANCE) &
        (np.abs(g - bg_g) <= BG_TOLERANCE) &
        (np.abs(b - bg_b) <= BG_TOLERANCE)
    )

    # Pixels that are just plain near-white (interior room fills, page margin)
    near_white = (
        (r >= NEAR_WHITE_THRESH) &
        (g >= NEAR_WHITE_THRESH) &
        (b >= NEAR_WHITE_THRESH)
    )

    alpha = np.where(bg_match | near_white, 0, 255).astype(np.uint8)

    # Clean up fringe: semi-transparent pixels adjacent to transparent areas
    kernel          = np.ones((3, 3), np.uint8)
    transparent_exp = cv2.dilate((alpha == 0).astype(np.uint8), kernel).astype(bool)
    alpha[transparent_exp & (alpha < 100)] = 0

    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, "RGBA")


def _trim_alpha(img: Image.Image, pad: int = 10) -> Image.Image:
    """Auto-crop to the tightest non-transparent bounding box."""
    arr   = np.array(img)
    alpha = arr[:, :, 3]
    rows  = np.any(alpha > 0, axis=1)
    cols  = np.any(alpha > 0, axis=0)
    if not rows.any():
        return img
    rmin, rmax = np.where(rows)[0][[0, -1]]
    cmin, cmax = np.where(cols)[0][[0, -1]]
    h, w = arr.shape[:2]
    rmin = max(0, rmin - pad); rmax = min(h, rmax + pad)
    cmin = max(0, cmin - pad); cmax = min(w, cmax + pad)
    return Image.fromarray(arr[rmin:rmax, cmin:cmax], "RGBA")


def _make_transparent_teal(img_crop: Image.Image) -> Image.Image:
    """Make teal background and interior areas transparent using flood-fill."""
    arr = np.array(img_crop.convert("RGBA"))
    bg_mask = _flood_fill_background(arr)
    arr[bg_mask, 3] = 0
    return Image.fromarray(arr, "RGBA")


# ── Metadata helpers ──────────────────────────────────────────────────────────

def _get_flat_name(page: fitz.Page, plumber_page=None) -> str:
    """Extract flat name and address from page text."""
    try:
        if plumber_page:
            # Try pdfplumber first for better text extraction
            words = plumber_page.extract_words()
            left = [w for w in words if w['x0'] < 300]
            lines: dict = {}
            for w in left:
                key = round(w['top'] / 7) * 7
                lines.setdefault(key, []).append(w['text'])
            sorted_lines = [" ".join(v) for k, v in sorted(lines.items())]
        else:
            # Fallback to fitz
            words = page.get_text("words")
            left = [w for w in words if w[0] < 300]
            lines: dict = {}
            for w in left:
                key = round(w[1] / 7) * 7
                lines.setdefault(key, []).append(w[4])
            sorted_lines = [" ".join(v) for _, v in sorted(lines.items())]
        
        flat_line = next((l for l in sorted_lines if l.startswith("Flat")), "")
        addr_line = next(
            (l for l in sorted_lines if any(
                kw in l for kw in ("Broadway","Trinity","Avenue","Road","Street","Lane","Place")
            )), ""
        )
        addr_line = addr_line.replace("T he", "The").strip()
        flat_num = re.sub(r"Flat\s*", "", flat_line).strip()
        flat_num = flat_num.replace(", ", "-").replace(",", "-").replace(" ", "")
        name = f"{flat_num}_{addr_line}" if addr_line else flat_num
        name = re.sub(r"[^\w\-]", "_", name)
        name = re.sub(r"_+", "_", name).strip("_")
        return name or f"page_{page.page_number + 1}" if hasattr(page, 'page_number') else f"page_{page.number + 1}"
    except Exception as e:
        log.debug("Could not extract flat name: %s", e)
        return f"page_{page.page_number + 1}" if hasattr(page, 'page_number') else f"page_{page.number + 1}"


def _is_duplex(page: fitz.Page, plumber_page=None) -> bool:
    """Check if page is a duplex (two-floor) layout."""
    try:
        if plumber_page:
            words = plumber_page.extract_words()
            left = [w for w in words if w['x0'] < 300]
            text = " ".join(w['text'] for w in left)
        else:
            words = page.get_text("words")
            text = " ".join(w[4] for w in words if w[0] < 300)
        return "Duplex" in text
    except Exception:
        return False


def _to_base64_png(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ── Process one page ──────────────────────────────────────────────────────────

def _process_page_teal(arr: np.ndarray, name: str, duplex: bool) -> List[dict]:
    """
    Extract floorplans using teal region detection.
    Returns list of plan dictionaries.
    """
    h, w = arr.shape[:2]
    regions = _find_plan_regions(arr)
    
    if not regions:
        log.info("  No regions found, skipping")
        return []
    
    plans = []
    if duplex and len(regions) >= 2:
        # Sort regions vertically and label them
        regions_sorted = sorted(regions, key=lambda r: r[0])
        labels = ["_1", "_0"]
        
        for (rmin, rmax, cmin, cmax), suffix in zip(regions_sorted, labels):
            rmin = max(0, rmin - PADDING)
            rmax = min(h, rmax + PADDING)
            cmin = max(0, cmin - PADDING)
            cmax = min(w, cmax + PADDING)
            
            crop = arr[rmin:rmax, cmin:cmax]
            img_crop = Image.fromarray(crop, "RGB")
            transparent = _make_transparent_teal(img_crop)
            trimmed = _trim_alpha(transparent)
            
            if trimmed.width >= 20 and trimmed.height >= 20:
                label = f"{name}{suffix}"
                plans.append({
                    "label": label,
                    "dataUrl": _to_base64_png(trimmed),
                    "width": trimmed.width,
                    "height": trimmed.height,
                })
                log.info("    → %s  %dx%dpx (teal)", label, trimmed.width, trimmed.height)
    else:
        # Single region or non-duplex: use largest region
        if not regions:
            return []
        rmin, rmax, cmin, cmax = max(regions, key=lambda r: (r[1] - r[0]) * (r[3] - r[2]))
        
        rmin = max(0, rmin - PADDING)
        rmax = min(h, rmax + PADDING)
        cmin = max(0, cmin - PADDING)
        cmax = min(w, cmax + PADDING)
        
        crop = arr[rmin:rmax, cmin:cmax]
        img_crop = Image.fromarray(crop, "RGB")
        transparent = _make_transparent_teal(img_crop)
        trimmed = _trim_alpha(transparent)
        
        if trimmed.width >= 20 and trimmed.height >= 20:
            plans.append({
                "label": name,
                "dataUrl": _to_base64_png(trimmed),
                "width": trimmed.width,
                "height": trimmed.height,
            })
            log.info("    → %s  %dx%dpx (teal)", name, trimmed.width, trimmed.height)
    
    return plans


def _process_page_vector(page: fitz.Page, name: str) -> Tuple[List[dict], Optional[str]]:
    """
    Extract floorplans using vector path detection (original method).
    Returns (plans, warning_or_None).
    """
    duplex = _is_duplex(page)
    bbox   = _get_floorplan_bbox(page)

    if bbox is None:
        return [], None   # silently skip — not a floor-plan page

    # Pad and clamp to page
    padded = fitz.Rect(
        max(page.rect.x0, bbox.x0 - PADDING * 72 / DPI),
        max(page.rect.y0, bbox.y0 - PADDING * 72 / DPI),
        min(page.rect.x1, bbox.x1 + PADDING * 72 / DPI),
        min(page.rect.y1, bbox.y1 + PADDING * 72 / DPI),
    )

    if duplex:
        mid     = (padded.y0 + padded.y1) / 2
        padding = PADDING * 72 / DPI
        regions = [
            (fitz.Rect(padded.x0, padded.y0, padded.x1, mid + padding), "_1"),
            (fitz.Rect(padded.x0, mid - padding, padded.x1, padded.y1),  "_0"),
        ]
    else:
        regions = [(padded, "")]

    plans = []
    for rect, suffix in regions:
        if rect.width < 20 or rect.height < 20:
            continue
        arr         = _render_region(page, rect, DPI)
        transparent = _make_transparent(arr)
        trimmed     = _trim_alpha(transparent)
        if trimmed.width < 20 or trimmed.height < 20:
            continue
        label = f"{name}{suffix}" if suffix else name
        plans.append({
            "label":   label,
            "dataUrl": _to_base64_png(trimmed),
            "width":   trimmed.width,
            "height":  trimmed.height,
        })
        log.info("    → %s  %dx%dpx (vector)", label, trimmed.width, trimmed.height)

    return plans, None


def _process_page(page: fitz.Page, name: str, plumber_page=None) -> Tuple[List[dict], Optional[str]]:
    """
    Process a page using both teal and vector detection.
    Try teal-based (pixel region) first, fall back to vector-based.
    """
    duplex = _is_duplex(page, plumber_page)
    
    # Render the page to RGB
    mat = fitz.Matrix(DPI / 72, DPI / 72)
    pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
    arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
    
    # Try teal-based detection first
    plans = _process_page_teal(arr, name, duplex)
    if plans:
        return plans, None
    
    # Fall back to vector-based detection
    log.debug("  Teal detection failed, trying vector detection...")
    plans, warning = _process_page_vector(page, name)
    if plans:
        return plans, warning
    
    return [], None


# ── SSE route ─────────────────────────────────────────────────────────────────

@router.post("/extract")
async def extract_floorplans(files: List[UploadFile] = File(...)):
    file_data = [(upload.filename or "unknown.pdf", await upload.read())
                 for upload in files]

    async def stream():
        total_plans = 0

        for source, pdf_bytes in file_data:
            try:
                doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            except Exception as exc:
                yield f"data: {_json.dumps({'type':'error','message':f'Cannot open {source}: {exc}'})}\n\n"
                continue

            total_pages = len(doc)
            log.info("[floorplan] %s — %d page(s)", source, total_pages)
            
            # Also open with pdfplumber for better text extraction
            try:
                pdf_plumber = pdfplumber.open(io.BytesIO(pdf_bytes))
            except Exception:
                pdf_plumber = None

            for page_num in range(total_pages):
                page = doc[page_num]
                plumber_page = pdf_plumber.pages[page_num] if pdf_plumber else None
                name = _get_flat_name(page, plumber_page)

                yield f"data: {_json.dumps({'type':'progress','source':source,'page':page_num+1,'total':total_pages,'name':name})}\n\n"
                await asyncio.sleep(0)

                try:
                    plans, warning = _process_page(page, name, plumber_page)
                except Exception as exc:
                    log.error("  Page %d error: %s", page_num + 1, exc)
                    plans, warning = [], str(exc)

                log.info("  [%d/%d] %s | %d plan(s)", page_num+1, total_pages, name, len(plans))

                # Only emit a result event if there are actual plans
                # — silently skip non-floor-plan pages
                if plans:
                    result: dict = {
                        "source_file": source,
                        "page":        page_num + 1,
                        "name":        name,
                        "duplex":      bool(_is_duplex(page, plumber_page)),
                        "plans":       plans,
                    }
                    if warning:
                        result["warning"] = warning
                    total_plans += len(plans)
                    yield f"data: {_json.dumps({'type':'result', **result})}\n\n"
                    await asyncio.sleep(0)

            doc.close()
            if pdf_plumber:
                pdf_plumber.close()

        yield f"data: {_json.dumps({'type':'done','total_plans':total_plans})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
