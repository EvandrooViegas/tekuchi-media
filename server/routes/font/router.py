# routes/font/router.py
#
# Converts OTF / TTF fonts into all web-safe formats:
#   EOT, SVG, TTF, WOFF, WOFF2
#
# Requires: fonttools[woff]  (pip install "fonttools[woff]")
#   - brotli  (for WOFF2 compression)
#   - zopfli  (optional, better WOFF compression — falls back to zlib)

import io
import logging
import struct
import zipfile
from pathlib import Path
from typing import List

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse

try:
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.sfnt import readTTCHeader
    FONTTOOLS_OK = True
except ImportError:
    FONTTOOLS_OK = False

logger = logging.getLogger("font_converter")

router = APIRouter(prefix="/font", tags=["font"])

ALLOWED_EXTS = {".otf", ".ttf"}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _load_font(data: bytes) -> "TTFont":
    """Load a TTFont from raw bytes."""
    return TTFont(io.BytesIO(data))


def _to_ttf(font: "TTFont") -> bytes:
    """Serialise font as TTF/OTF bytes (no conversion needed — just re-serialise)."""
    buf = io.BytesIO()
    font.save(buf)
    return buf.getvalue()


def _to_woff(font: "TTFont") -> bytes:
    """Convert to WOFF (zlib-compressed OpenType wrapper)."""
    buf = io.BytesIO()
    font.flavor = "woff"
    font.save(buf)
    font.flavor = None  # reset so the object can be reused
    return buf.getvalue()


def _to_woff2(font: "TTFont") -> bytes:
    """Convert to WOFF2 (Brotli-compressed OpenType wrapper)."""
    buf = io.BytesIO()
    font.flavor = "woff2"
    font.save(buf)
    font.flavor = None
    return buf.getvalue()


def _to_svg(font: "TTFont") -> bytes:
    """
    Generate a minimal SVG font file.
    SVG fonts are deprecated in modern browsers but still requested for
    legacy iOS Safari compatibility.
    """
    try:
        from fontTools.svgLib.path import SVGPath  # noqa: F401 — just check availability
    except ImportError:
        pass  # We build SVG manually below

    name_table = font["name"]

    def _name(name_id: int) -> str:
        rec = name_table.getName(name_id, 3, 1, 0x0409)
        if rec is None:
            rec = name_table.getName(name_id, 1, 0, 0)
        return rec.toUnicode() if rec else ""

    family = _name(1) or "Font"
    style  = _name(2) or "Regular"
    font_id = (family + "-" + style).replace(" ", "-")

    os2 = font.get("OS/2")
    units_per_em = font["head"].unitsPerEm
    ascent  = os2.sTypoAscender  if os2 else int(units_per_em * 0.8)
    descent = os2.sTypoDescender if os2 else -int(units_per_em * 0.2)

    glyph_set = font.getGlyphSet()
    cmap      = font.getBestCmap() or {}

    glyphs_svg: list[str] = []

    for codepoint, glyph_name in cmap.items():
        if glyph_name not in glyph_set:
            continue
        pen_data: list[str] = []

        class _SVGPen:
            """Minimal T2/TT pen that emits SVG path commands."""
            def __init__(self):
                self.d: list[str] = []

            def moveTo(self, pt):
                self.d.append(f"M{pt[0]},{pt[1]}")

            def lineTo(self, pt):
                self.d.append(f"L{pt[0]},{pt[1]}")

            def curveTo(self, *pts):
                coords = " ".join(f"{p[0]},{p[1]}" for p in pts)
                self.d.append(f"C{coords}")

            def qCurveTo(self, *pts):
                coords = " ".join(f"{p[0]},{p[1]}" for p in pts)
                self.d.append(f"Q{coords}")

            def closePath(self):
                self.d.append("Z")

            def endPath(self):
                pass

        pen = _SVGPen()
        try:
            glyph_set[glyph_name].draw(pen)
        except Exception:
            continue

        if not pen.d:
            continue

        char = chr(codepoint)
        # Escape XML special chars
        char_escaped = (
            char.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;")
                .replace('"', "&quot;")
        )
        d_attr = " ".join(pen.d)
        glyphs_svg.append(
            f'  <glyph unicode="{char_escaped}" glyph-name="{glyph_name}" d="{d_attr}"/>'
        )

    svg = (
        '<?xml version="1.0" standalone="no"?>\n'
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" '
        '"http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n'
        '<svg xmlns="http://www.w3.org/2000/svg">\n'
        "<defs>\n"
        f'<font id="{font_id}" horiz-adv-x="{units_per_em}">\n'
        f'  <font-face font-family="{family}" font-style="{style.lower()}" '
        f'units-per-em="{units_per_em}" ascent="{ascent}" descent="{descent}"/>\n'
        f'  <missing-glyph horiz-adv-x="{units_per_em}"/>\n'
        + "\n".join(glyphs_svg) + "\n"
        "</font>\n"
        "</defs>\n"
        "</svg>\n"
    )
    return svg.encode("utf-8")


def _to_eot(font: "TTFont", ttf_bytes: bytes) -> bytes:
    """
    Build an EOT (Embedded OpenType) file from TTF bytes.
    EOT is only needed for IE ≤ 8.  We produce a valid EOT v0x00020001
    with no root-string restrictions (so it works on any domain).

    Reference: https://www.w3.org/Submission/EOT/

    Fixed header layout (68 bytes):
      4  EotSize          (total file size)
      4  FontDataSize
      4  Version          (0x00020001)
      4  Flags            (0 = uncompressed)
      4  FontPANOSE[0..3] (first 4 bytes of 10-byte PANOSE)
      4  FontPANOSE[4..7]
      2  FontPANOSE[8..9]
      1  Charset
      1  Italic
      4  Weight
      2  FsType
      2  MagicNumber      (0x504C = "LP")
      4  UnicodeRange1
      4  UnicodeRange2
      4  UnicodeRange3
      4  UnicodeRange4
      4  CodePageRange1
      4  CodePageRange2
      4  CheckSumAdjustment
      4  Reserved1
      4  Reserved2
      4  Reserved3
    = 68 bytes
    """
    name_table = font["name"]

    def _utf16le(name_id: int) -> bytes:
        rec = name_table.getName(name_id, 3, 1, 0x0409)
        if rec is None:
            rec = name_table.getName(name_id, 1, 0, 0)
        if rec is None:
            return b""
        return rec.toUnicode().encode("utf-16-le")

    family_name = _utf16le(1)
    style_name  = _utf16le(2)
    version_str = _utf16le(5)
    full_name   = _utf16le(4)

    os2 = font.get("OS/2")
    if os2:
        panose_attrs = [
            "bFamilyType", "bSerifStyle", "bWeight", "bProportion",
            "bContrast", "bStrokeVariation", "bArmStyle",
            "bLetterForm", "bMidline", "bXHeight",
        ]
        panose_bytes = bytes(getattr(os2.panose, a, 0) for a in panose_attrs)
        char_set         = os2.fsFirstCharIndex & 0xFF
        italic           = 1 if (font["head"].macStyle & 0x02) else 0
        weight           = os2.usWeightClass
        fs_type          = os2.fsType
        unicode_range1   = os2.ulUnicodeRange1
        unicode_range2   = os2.ulUnicodeRange2
        unicode_range3   = os2.ulUnicodeRange3
        unicode_range4   = os2.ulUnicodeRange4
        code_page_range1 = os2.ulCodePageRange1
        code_page_range2 = os2.ulCodePageRange2
    else:
        panose_bytes     = b"\x00" * 10
        char_set         = 0
        italic           = 0
        weight           = 400
        fs_type          = 0
        unicode_range1   = 0
        unicode_range2   = 0
        unicode_range3   = 0
        unicode_range4   = 0
        code_page_range1 = 0
        code_page_range2 = 0

    # Each variable-length name field: 2-byte LE length + UTF-16LE data
    def _name_field(data: bytes) -> bytes:
        return struct.pack("<H", len(data)) + data

    root_string = b""  # empty = no domain restriction

    variable_part = (
        _name_field(family_name)
        + _name_field(style_name)
        + _name_field(version_str)
        + _name_field(full_name)
        + _name_field(root_string)
    )

    font_data_size = len(ttf_bytes)

    # Fixed header: 68 bytes
    # <  = little-endian
    # I  = uint32 (4 bytes) × many
    # H  = uint16 (2 bytes)
    # B  = uint8  (1 byte)
    # 10s = 10-byte string
    fixed_header = struct.pack(
        "<III I 4s 4s 2s B B I H H I I I I I I I I I I",
        0,                      # EotSize — filled in below
        font_data_size,         # FontDataSize
        0x00020001,             # Version
        0,                      # Flags (0 = uncompressed)
        panose_bytes[0:4],      # PANOSE bytes 0-3
        panose_bytes[4:8],      # PANOSE bytes 4-7
        panose_bytes[8:10],     # PANOSE bytes 8-9
        char_set,               # Charset
        italic,                 # Italic
        weight,                 # Weight
        fs_type,                # FsType
        0x504C,                 # MagicNumber "LP"
        unicode_range1,
        unicode_range2,
        unicode_range3,
        unicode_range4,
        code_page_range1,
        code_page_range2,
        0,                      # CheckSumAdjustment
        0,                      # Reserved1
        0,                      # Reserved2
        0,                      # Reserved3
    )

    eot_size = len(fixed_header) + len(variable_part) + font_data_size

    # Patch EotSize (first 4 bytes)
    fixed_header = struct.pack("<I", eot_size) + fixed_header[4:]

    return fixed_header + variable_part + ttf_bytes


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/convert")
async def convert_fonts(files: List[UploadFile] = File(...)):
    """
    Accept one or more OTF/TTF font files and return a ZIP archive
    containing each font converted to: EOT, SVG, TTF, WOFF, WOFF2.
    """
    if not FONTTOOLS_OK:
        raise HTTPException(
            status_code=500,
            detail="fonttools is not installed. Run: pip install 'fonttools[woff]'",
        )

    results: list[dict] = []
    zip_buf = io.BytesIO()

    with zipfile.ZipFile(zip_buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        for upload in files:
            suffix = Path(upload.filename or "font.ttf").suffix.lower()
            if suffix not in ALLOWED_EXTS:
                results.append({
                    "fileName": upload.filename,
                    "status": "skipped",
                    "reason": f"Unsupported extension '{suffix}'. Only .otf and .ttf are accepted.",
                    "formats": [],
                })
                continue

            raw = await upload.read()
            stem = Path(upload.filename).stem
            converted: list[str] = []
            errors: list[str] = []

            try:
                font = _load_font(raw)
            except Exception as exc:
                results.append({
                    "fileName": upload.filename,
                    "status": "error",
                    "reason": f"Could not parse font: {exc}",
                    "formats": [],
                })
                continue

            # ── TTF ──────────────────────────────────────────────────────────
            try:
                ttf_bytes = _to_ttf(font)
                zf.writestr(f"{stem}/{stem}.ttf", ttf_bytes)
                converted.append("ttf")
            except Exception as exc:
                errors.append(f"ttf: {exc}")
                ttf_bytes = raw  # fall back to original bytes for EOT

            # ── WOFF ─────────────────────────────────────────────────────────
            try:
                zf.writestr(f"{stem}/{stem}.woff", _to_woff(font))
                converted.append("woff")
            except Exception as exc:
                errors.append(f"woff: {exc}")

            # ── WOFF2 ────────────────────────────────────────────────────────
            try:
                zf.writestr(f"{stem}/{stem}.woff2", _to_woff2(font))
                converted.append("woff2")
            except Exception as exc:
                errors.append(f"woff2: {exc}")

            # ── SVG ──────────────────────────────────────────────────────────
            try:
                zf.writestr(f"{stem}/{stem}.svg", _to_svg(font))
                converted.append("svg")
            except Exception as exc:
                errors.append(f"svg: {exc}")

            # ── EOT ──────────────────────────────────────────────────────────
            try:
                zf.writestr(f"{stem}/{stem}.eot", _to_eot(font, ttf_bytes))
                converted.append("eot")
            except Exception as exc:
                errors.append(f"eot: {exc}")

            results.append({
                "fileName": upload.filename,
                "status": "success" if converted else "error",
                "formats": converted,
                "errors": errors,
            })

            logger.info(
                "Converted %s → %s%s",
                upload.filename,
                ", ".join(converted),
                f" (errors: {', '.join(errors)})" if errors else "",
            )

    zip_buf.seek(0)

    return StreamingResponse(
        zip_buf,
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="converted_fonts.zip"',
            "X-Conversion-Results": str(results),
        },
    )
