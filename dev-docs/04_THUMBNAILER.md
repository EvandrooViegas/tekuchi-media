# PDF Thumbnailer

**Route:** `/thumbnailer`  
**API route:** `app/api/(thumbnail)/thumbnail/route.ts`  
**Python router:** `server/routes/thumbnail/router.py`

---

## What It Does

Upload one or more PDFs and receive a high-resolution JPEG thumbnail (661×931 px) of each document's first page. Results are returned as base64 data URIs in the JSON response — nothing is written to disk.

---

## Dimensions

`TARGET_W = 661`, `TARGET_H = 931` — chosen to match a 3:4 portrait aspect ratio typical for brochure covers.

The scaling strategy is **cover** (`object-fit: cover` semantics): use the larger of `ratio_w` or `ratio_h` so the canvas is completely filled, then crop the overflow.

---

## Python Implementation (`server/routes/thumbnail/router.py`)

```python
POST /thumbnail/  (List[UploadFile])

For each PDF:
  1. fitz.open(stream=pdf_bytes) — PyMuPDF
  2. page = doc[0]               — first page only
  3. ratio_w = TARGET_W / rect.width
     ratio_h = TARGET_H / rect.height
     scale = max(ratio_w, ratio_h)   # cover, not contain
  4. pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
  5. Create blank 661×931 canvas, fill white
  6. Center the pixmap on the canvas (may overflow on one axis — cropped)
  7. Encode as JPEG → base64
  8. Return { fileName, imageData: "data:image/jpeg;base64,..." }
```

Step 6–7 is the key: `pix.set_origin(x_offset, y_offset)` positions the rendered page, then `final_canvas.copy(pix, pix.irect)` stamps it — any pixels outside the 661×931 rect are automatically clipped by PyMuPDF.

---

## Client Implementation (`app/thumbnailer/page.tsx`)

Simple uncontrolled form — no staged state, direct upload on `<input onChange>`.

```
User selects PDFs
    → POST /api/thumbnail (multipart, files[])
    → Next.js proxy → Python POST /thumbnail/
    → { thumbnails: [{ fileName, imageData }] }
    → prepend to history[] state
    → render <img src={imageData} /> grid
```

Results live in `history[]` — React state only, cleared on page refresh. No persistence, no disk writes.

Download: creates an `<a>` element with the base64 URL, triggers `.click()`, removes element.

---

## Extending

To support pages beyond the first page, change `doc[0]` to `doc[page_number]` in the Python router and pass a page parameter from the client.

To change thumbnail dimensions, update `TARGET_W` and `TARGET_H` in the Python router. The cover-scale logic adapts automatically.
