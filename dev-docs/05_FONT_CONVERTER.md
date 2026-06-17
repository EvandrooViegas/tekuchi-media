# Font Converter

**Route:** `/font-converter`  
**API route:** `app/api/(font)/font/route.ts`  
**Python router:** `server/routes/font/router.py`

---

## What It Does

Convert `.otf` or `.ttf` font files into all five web-safe formats — EOT, SVG, TTF, WOFF, WOFF2 — delivered as a single ZIP archive per font.

---

## Client (`app/font-converter/page.tsx`)

### State

```ts
jobs: FontJob[]    // { id, file, status, formats, errors, zipBlob? }
isDragging: boolean
```

`FontJob.status` progresses through: `'pending' → 'converting' → 'done' | 'error'`

`FontJob.formats` is an array of strings like `['ttf', 'woff', 'woff2', 'svg', 'eot']` indicating which formats were successfully produced. Used to render the coloured format badges.

### Conversion flow

```
1. User drops/selects .otf/.ttf files → new FontJob per file (status: 'pending')
2. "Convert N fonts" clicked → convertAll()
3. For each pending job (sequential):
   - POST /api/font (multipart, files: [job.file])
   - On success: response body is a binary ZIP blob
   - Parse X-Conversion-Results header to extract succeeded formats
   - Store zipBlob in job state, mark status 'done'
4. "Download ZIP" button: createObjectURL(zipBlob) → click → revokeObjectURL
```

### `X-Conversion-Results` header parsing

Python returns a stringified Python list of dicts in this header, e.g.:
```
[{'fileName': 'MyFont.ttf', 'formats': ['ttf', 'woff', 'woff2', 'svg', 'eot'], 'errors': []}]
```

The client extracts formats with a regex rather than JSON.parse (because it's Python repr, not JSON):
```ts
const fmtMatch = resultHeader.match(/'formats':\s*\[([^\]]*)\]/);
formats = fmtMatch[1].split(',').map(s => s.trim().replace(/'/g, '')).filter(Boolean);
```

If parsing fails, all 5 formats are assumed successful.

---

## API Route (`app/api/(font)/font/route.ts`)

Thin proxy. Forwards the multipart FormData to Python. The response from Python is a binary ZIP — the route passes it through directly:

```ts
const zipBuffer = await response.arrayBuffer();
return new NextResponse(zipBuffer, {
  headers: {
    'Content-Type': 'application/zip',
    'Content-Disposition': 'attachment; filename="converted_fonts.zip"',
  },
});
```

No JSON — the body is raw bytes.

---

## Python (`server/routes/font/router.py`)

Uses **fonttools** (`pip install "fonttools[woff]"`) with `brotli` for WOFF2 compression.

```
POST /font/convert  (List[UploadFile], .otf/.ttf only)

For each font file:
  1. TTFont(io.BytesIO(raw_bytes))      # parse with fonttools
  2. _to_ttf()   → re-serialise as TTF
  3. _to_woff()  → font.flavor = 'woff'  → save → reset flavor
  4. _to_woff2() → font.flavor = 'woff2' → save → reset flavor
  5. _to_svg()   → manually walk cmap + glyph set, emit SVG font XML
  6. _to_eot()   → hand-craft EOT v0x00020001 header via struct.pack
  7. All outputs written to a ZipFile with subfolder {stem}/{stem}.{ext}

Return: StreamingResponse (application/zip) + X-Conversion-Results header
```

### SVG fonts

SVG fonts are deprecated in all modern browsers but still supported for legacy iOS Safari. The implementation manually walks `font.getGlyphSet()` and `font.getBestCmap()`, drawing each glyph's outline with a minimal pen class that emits SVG `M/L/C/Q/Z` path commands.

### EOT files

EOT (Embedded OpenType) is only needed for IE ≤ 8. The implementation builds the binary header by hand using `struct.pack('<III...')` per the W3C EOT spec. The root-string restriction field is left empty so the font works on any domain.

### Error handling per format

Each format conversion is wrapped in its own `try/except`. A failure on one format (e.g. SVG) doesn't abort the others — the font still gets a ZIP with the remaining formats, and the failed format is listed in `errors`.

---

## Extending

**Adding a new format:** add a `_to_x()` helper function returning `bytes`, add a `zf.writestr(f"{stem}/{stem}.x", _to_x(font))` call in the main loop, add the format name to `converted` on success.

**Changing ZIP structure:** currently `{stem}/{stem}.{ext}`. Modify the `zf.writestr` path strings in the router.
