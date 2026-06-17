# Image Resizer

**Route:** `/resizer`  
**API routes:** `app/api/(resize)/resize/`  
**Python endpoints:** `/folder-status`, `/run-batch`, `/manual-resize`, `/local-preview`, `/full-resolution`, `/processed-history`, `/cropper/logs`

---

## What It Does

Two operating modes for generating HD-cropped image variants:

- **Automation (Batch):** Monitor a filesystem inbox folder (`cropper_inbox` from `config.ini`). When "Run Batch Processor" is clicked, all images in that folder are processed into 4 dimensions with 3 crop strategies each.
- **Manual:** Upload images directly via the browser, pick a target resolution, get back base64 data URIs for each crop.

---

## Crop Strategy

For a target resolution (e.g. 1920×1080):

1. Compute the target aspect ratio: `tw / th`
2. If the image is wider than the target AR: fix height, crop width (centered)
3. If the image is taller: fix width, crop height — then produce 3 variants:
   - **Center:** crop from the vertical midpoint
   - **Top:** crop from the top
   - **Bottom:** crop from the bottom
4. Resize the cropped region to exactly (tw, th) with `cv2.resize`

If the image is smaller than the target in either dimension, it's returned as-is with a "too small" status (no upscaling).

---

## Automation Mode

### Polling

The page polls three endpoints every 3 seconds via `setInterval`:

```
GET /api/resize/folder-status   → Python /folder-status
GET /api/resize/processed-history → Python /processed-history
GET /api/resize/logs            → Python /cropper/logs
```

`/folder-status` lists files directly in the `CROP_INBOX` root (non-recursive). Thumbnails are served via `/api/resize/local-preview?filename={f}`.

### Running batch

```
POST /api/resize/run-batch → Python POST /run-batch
```

Python's `/run-batch` endpoint:
1. Iterates dimensions: `[(1920,1080), (3840,2160), (800,450), (800,534)]`
2. For each image × dimension:
   - Applies center/top/bottom crop strategy
   - Encodes JPEG at Q92 → Pillow re-compress at Q85
   - Writes to `CROP_PROCESSED/{dim}/center|top|bottom/{filename}`
3. Moves originals to `CROP_PROCESSED/ORIGINALS/`

---

## Manual Upload Mode

### Flow

1. User selects files → dimension modal appears
2. User picks a dimension
3. `POST /api/resize?tw=1920&th=1080` (multipart, `files[]`)
4. Next.js route forwards to `POST /manual-resize?target_w=1920&target_h=1080`
5. Python returns `{ results: [{ fileName, centerCrop, topCrop, bottomCrop, centerStats, topStats, bottomStats, targetRes }] }`
6. Each `*Crop` field is a base64 data URI (`data:image/jpeg;base64,...`)
7. Client displays results in the history list; clicking opens a modal with all three crops

### Compression stats

`centerStats` / `topStats` / `bottomStats` are strings like `"285KB -> 142KB"` showing the Pillow compression savings. Displayed as a green badge in the result modal.

---

## API Routes (Next.js)

All resize routes under `app/api/(resize)/resize/` simply proxy to the Python server. They exist because the Python server doesn't run on the same origin.

| Next.js route | Python endpoint | Description |
|---|---|---|
| `POST /api/resize` | `POST /manual-resize` | Manual crop + resize |
| `GET /api/resize/folder-status` | `GET /folder-status` | Inbox file list |
| `POST /api/resize/run-batch` | `POST /run-batch` | Trigger batch processing |
| `GET /api/resize/logs` | `GET /cropper/logs` | Last 100 log lines |
| `GET /api/resize/processed-history` | `GET /processed-history` | Recent output list |
| `GET /api/resize/local-preview` | `GET /local-preview` | 300px preview JPEG |
| `GET /api/resize/full-resolution` | `GET /full-resolution` | Full-size image |

---

## Python Implementation Details

### `/manual-resize` (in `server/main.py`)

Returns base64 data URIs — results are transient (session only, not written to disk). This is intentional for the manual mode: fast, no cleanup needed.

```python
_encode_img(cv_img, filename)
  # 1. cv2.imencode JPEG Q90
  # 2. compress_image_bytes (Pillow Q85) — imported from compress router
  # 3. base64 encode → data:image/jpeg;base64,...
```

### `/run-batch` (in `server/main.py`)

Results are written to disk and persist. This endpoint is also called by the APScheduler background job every `POLL_INTERVAL` seconds — so the inbox gets processed automatically even without the user clicking "Run".

---

## State Management

```ts
// Automation tab
status: { count: number; files: string[] }
isProcessing: boolean
processedHistory: any[]
logs: string

// Manual tab
directHistory: ResizeResult[]
activeResult: ResizeResult | null   // drives the fullscreen modal
isUploading: boolean
pendingFiles: FileList | null       // held until user picks dimension
showDimModal: boolean               // dimension picker modal
```

`pendingFiles` is kept in state until the user confirms a dimension in the modal. Once confirmed, `confirmUpload(tw, th)` runs and clears it. The file input is also cleared on selection so the same file can be re-uploaded.
