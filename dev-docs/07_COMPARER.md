# PDF Comparer

**Route:** `/comparer`  
**API route:** `app/api/(comparer)/compare/route.ts`  
**Python router:** `server/routes/compare/router.py`

---

## What It Does

Upload two PDF versions (original A, revised B). The tool compares them page-by-page using both text extraction and pixel diff, returning a list of detected changes. Results appear in a side-by-side viewer with click-to-navigate and export functionality.

---

## Client (`app/comparer/page.tsx`)

### State

```ts
file1: File | null      // Document A
file2: File | null      // Document B
loading: boolean
result: DiffResult | null   // { changes: Change[] }
activeIndex: number | null  // which change card is selected
```

### PDF Viewer

Uses `@react-pdf-viewer/core` with `pageNavigationPlugin` from `@react-pdf-viewer/page-navigation`. Two independent viewer instances, one per document.

```ts
const navPluginA = pageNavigationPlugin();
const navPluginB = pageNavigationPlugin();
const { jumpToPage: jumpA } = navPluginA;
const { jumpToPage: jumpB } = navPluginB;
```

When a change card is clicked, `handleJumpToChange` parses the page number from the `section` string (e.g. `"Página 3"` → page index 2) and calls `jumpA(pageNumber)` + `jumpB(pageNumber)` to scroll both viewers simultaneously.

The PDF viewer uses a CDN-loaded worker: `workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js"`. This matches the `pdfjs-dist` version in `package.json`.

### Object URLs

```ts
const urls = useMemo(() => ({
  u1: file1 ? URL.createObjectURL(file1) : '',
  u2: file2 ? URL.createObjectURL(file2) : ''
}), [file1, file2]);
```

`useMemo` with `[file1, file2]` deps means object URLs are only re-created when files change. These are never explicitly revoked — in practice this is fine since the page is SPA-navigated and the component lifecycle handles cleanup.

---

## Export Functionality

Two export functions run entirely client-side — no API call needed since all change data is already in React state.

### `exportTxt(changes, nameA, nameB)`

Builds a formatted text report grouped by section (page):

```
═══════════════════════
  PDF COMPARISON REPORT
═══════════════════════
  Generated : ...
  Original  : brochure_v1.pdf
  Revised   : brochure_v2.pdf
  Changes   : 8
═══════════════════════

── Página 3 ──────────
  [001] [TEXT ]  Text 'OLD' was REMOVED. Text 'NEW' was ADDED.
  [002] [IMAGE]  Visual change detected...
```

### `exportCsv(changes, nameA, nameB)`

Standard CSV with header rows and data rows. Quotes are doubled (`""`) for CSV safety.

Both use:
```ts
const blob = new Blob([content], { type: 'text/plain|csv;charset=utf-8' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url; a.download = filename; a.click();
URL.revokeObjectURL(url);
```

---

## API Route (`app/api/(comparer)/compare/route.ts`)

Thin proxy to Python. Forwards multipart FormData (both PDFs) to `POST /compare/`.

---

## Python Diff Algorithm (`server/routes/compare/router.py`)

### Dependencies

- **PyMuPDF** (`fitz`) — text extraction and page rendering
- **OpenCV** — pixel diff computation
- **numpy** — array ops

### Per-page comparison

```python
for page_num in range(min(len(doc1), len(doc2))):
    # STEP 1: Text diff
    str1 = [w[4] for w in page1.get_text("words")]   # word-level tokenisation
    str2 = [w[4] for w in page2.get_text("words")]
    if str1 != str2:
        description = compare_word_lists(str1, str2)
        changes.append({ "section": label, "type": "text", "description": description })

    # STEP 2: Pixel diff
    pix1 = page1.get_pixmap()   # renders at 72 DPI
    pix2 = page2.get_pixmap()
    img1 = np.frombuffer(pix1.samples, np.uint8).reshape(h, w, 3)
    img2 = ... (resize to match img1 if dimensions differ)
    diff = cv2.absdiff(img1, img2)
    gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
    _, thresh = cv2.threshold(gray, 25, 255, cv2.THRESH_BINARY)
    if np.count_nonzero(thresh) > 500:   # more than 500 differing pixels
        if str1 == str2:
            # Text is identical but pixels differ → image/layout change
            changes.append({ "type": "image", ... })
        # If text also differs, the text change is already appended above
```

### `compare_word_lists(str1, str2)`

```python
added   = [w for w in str2 if w not in str1]
removed = [w for w in str1 if w not in str2]
```

Simple set-difference. Reports first 3 removed words and first 3 added words. Not position-aware — a word moved to a different location appears as removed+added.

### Limitations

- Only compares pages that exist in **both** documents. If B has extra pages, they are not reported.
- Text comparison is word-list based, not positional — moved text registers as a change.
- Pixel diff threshold (500 pixels) is hardcoded. Very subtle changes (single-pixel adjustments) may be missed.
- Pages are rendered at 72 DPI for the pixel diff — fast but low resolution.

---

## Extending

**To export as PDF:** use a PDF generation library client-side (e.g. `jspdf`) to render the change list and add annotated screenshots.

**To improve text diff quality:** replace the word-list comparison with a proper diff algorithm (e.g. Myers diff) for line-level or character-level granularity. The `section` field on each change can include a more precise location (coordinates) if `page.get_text("dict")` is used instead of `"words"`.
