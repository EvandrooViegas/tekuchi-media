# Media Compressor

**Route:** `/compressor`  
**API routes:** `app/api/(compressor)/`  
**Python router:** `server/routes/compress/router.py`

---

## What It Does

Batch-compress images, videos, and PDFs. Files are uploaded to a Python-managed inbox folder, then processed in the background. Results persist in `PROCESSED/` and are displayed in a polling job table.

**Supported formats:** JPG, PNG, WebP, MP4, MOV, AVI, MKV, PDF.

---

## Client-Side (`app/compressor/page.tsx`)

### State

```ts
jobs: any[]            // completed job records from Python's log.json
systemLogs: string[]   // last 200 lines of converter.log
isRunning: boolean     // true while converter is active
stagedFiles: TrackedFile[]  // files queued/uploading in the browser
isDragging: boolean
viewingGallery: any | null  // video thumbnail gallery modal
```

### Upload flow

Uses raw `XMLHttpRequest` (not `fetch`) to get upload progress events:

```ts
const xhr = new XMLHttpRequest();
xhr.open("POST", `/api/upload?filename=${encodeURIComponent(item.file.name)}`, true);
xhr.upload.onprogress = (e) => {
  const percent = Math.round((e.loaded / e.total) * 100);
  // update progress bar
};
xhr.send(item.file);  // raw bytes body
```

The Next.js route at `/api/upload` re-wraps the raw bytes into a `FormData` before forwarding to Python, because Python's FastAPI expects `multipart/form-data` with `List[UploadFile]`.

### Log polling

`setInterval(fetchLogs, 3000)` runs while the page is mounted. After clicking "Run Converter", an additional burst of 5 polls at 1-second intervals catches the moment processing completes.

### Output table

Each job's `outputs[]` array contains relative paths like `42_12_1.jpg/42_12_1_1080p.jpg`. The table resolves these via:

```ts
const relPath = out.replace(/\\/g, '/');   // normalise separators
const encodedPath = encodeURIComponent(relPath);
// → /api/media?file=42_12_1.jpg%2F42_12_1_1080p.jpg
```

**Never strip to basename.** The media/download routes join this relative path with `CONVERTED_DIR` to locate the file in its subfolder.

Resolution labels (`1080p` slate pill, `4K` violet pill) are derived from the filename suffix (`_1080p.`, `_4k.`).

---

## API Routes

### `POST /api/upload`
Receives raw bytes body (`Content-Type: application/octet-stream`), reassembles into a `FormData`, forwards to `POST /compress/upload`.

### `POST /api/run`
Sends an empty FormData to `POST /compress/run`. Python adds `run_once()` as a `BackgroundTask` — the HTTP response returns immediately.

### `GET /api/logs`
Proxies `GET /compress/logs`. Reverses the jobs array (newest first) before returning. Returns `{ jobs, systemLogs }`.

### `GET /api/media?file={relPath}`
**Node-only.** Reads `path.join(paths.processed, relPath)` from disk and streams with correct MIME type (`Content-Disposition: inline` — for previewing).

### `GET /api/download?file={relPath}`
Same as media but forces `Content-Disposition: attachment` for browser download.

---

## Python Processing Pipeline

### `run_once()` — inbox scanner

Scans `INBOX_DIR` recursively for supported files older than `MIN_FILE_AGE_S` seconds. For each file:

1. Move to `PROCESSING_DIR` (preserving subdirectory structure)
2. Dispatch to `process_image()`, `process_video()`, or `process_pdf()`

### `process_image()`

```
source dimensions (ffprobe)
    │
    ├── Always → 1080p version (_1080p.jpg / _1080p.png)
    │              scale to IMAGE_TARGET_H=1080, preserve AR, round to even width
    │              Pillow optimize (PNG: compress_level=9; JPEG: quality=92 optimize)
    │
    └── If w≥3840 or h≥2160 → 4K version (_4k.jpg / _4k.png)
                   scale to 2160, same Pillow pass

Keep-original guard: if 1080p result is larger than source AND not a 4K source → keep original

Output folder: CONVERTED_DIR / {relative_subdir} / {original_filename}/
   e.g. PROCESSED/42_12_1.jpg/42_12_1_1080p.jpg
                              42_12_1_4k.jpg
```

**Note:** Each image gets its own named subfolder (`src.name` as directory). This is set via `image_subdir = subdir / src.name` in `process_image`. The `TempWorkspace.commit()` method uses this subdir to create the final output path.

`TempWorkspace` is a context manager that creates a temp directory, processes files there, then moves them atomically to `CONVERTED_DIR`. If an exception occurs before `commit()`, the temp directory is cleaned up.

### `process_video()`

Two FFmpeg passes:
- MP4: `libx264 veryfast crf23 -b:v 2M -movflags +faststart`
- WebM: `libvpx-vp9 crf35 -quality realtime -speed 5`

Both scale to 1920×1080 with letterboxing/pillarboxing. Audio: AAC 192k / Opus 128k.

Also extracts 10 JPEG thumbnails at frames 2–11 seconds (`_thumb_02s.jpg` … `_thumb_11s.jpg`). These are displayed in the gallery modal (triggered by the "View Gallery" button in the job table).

### `process_pdf()`

Ghostscript pass: downsample all images to 150 DPI, embed/subset fonts, enable FastWebView (linearised). If the output is larger than the input (already optimal), the original is kept.

### `append_job()` / `log.json`

Every processing step writes to `server/log.json`. The function does an upsert — if a job for the same filename is already in-progress, it updates that record rather than appending a new one. Jobs older than 3 days are pruned by `trim_logs()`.

---

## `MediaPreview` Component

```tsx
// app/compressor/components/MediaPreview.tsx
<MediaPreview filename="42_12_1.jpg/42_12_1_1080p.jpg" />
```

Opens a Dialog with an appropriate preview (video, img, or iframe for PDF). The `filename` prop is the full relative path — it's `encodeURIComponent`-ed when building the `/api/media?file=` URL.

---

## Extending the Compressor

**To add a new output format or resolution:** modify `process_image()` in `server/routes/compress/router.py`. The `out_files` list accepts any number of `Path` objects — they all get committed and appear as separate download buttons in the UI.

**To add a new file type:** add the extension to `IMAGE_EXTS`, `VIDEO_EXTS`, or create a new `process_X()` function and dispatch it in `run_once()`. Add the extension to `ALLOWED_EXTS` in `app/compressor/page.tsx`.
