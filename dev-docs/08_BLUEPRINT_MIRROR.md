# Blueprint Mirror

**Route:** `/blueprint-mirror`  
**API route:** `app/api/(blueprint-mirror)/blueprint-mirror/route.ts` (Node-only)

---

## What It Does

Mirrors blueprint PNG/JPEG images horizontally, vertically, or both. Includes a region painter that lets the user manually mark text/label areas before mirroring — those regions are pixel-copied from the original and placed at the correct post-flip coordinates so they remain readable.

---

## Architecture — Two-Phase Processing

```
Phase 1 (server): sharp pixel flip
Phase 2 (client): region stamp (optional, user-drawn regions)
```

The server handles the geometry flip. The client handles text preservation. This split is intentional — the server has no knowledge of which pixels are "text", and the client has direct access to both the original and flipped images for pixel operations.

---

## Client State (`app/blueprint-mirror/page.tsx`)

```ts
blueprints: BlueprintFile[]     // { id, file, previewUrl, labelRegions[] }
direction: MirrorDirection      // 'horizontal' | 'vertical' | 'both'
isProcessing: boolean
results: MirroredResult[]       // { id, name, originalUrl, mirroredUrl, width, height }
isDragging: boolean
paintingBp: BlueprintFile | null  // which blueprint has the region painter open
```

Each `BlueprintFile` holds an `ObjectURL` (`previewUrl`) created with `URL.createObjectURL()`. These are revoked when the blueprint is removed or `clearAll()` is called.

---

## Region Painter (`RegionPainter` component)

A modal that renders the blueprint on a `<canvas>` element and lets the user drag to draw bounding rectangles.

### Coordinate system

The canvas renders the image scaled to fit the modal (scale factor `sc`). Mouse coordinates are in **display space**. On `mouseup`, they're converted back to **image space**:

```ts
const ix = Math.round((canvasX - offX) / sc);   // offX/offY = letterbox offset
const iy = Math.round((canvasY - offY) / sc);
```

Stored regions are always in image-space pixels. This matters because the canvas size changes with window resize, but the stored coordinates must remain stable.

### `redraw(rects, liveRect)`

Called on every mouse move during drawing and whenever regions change. Clears the canvas, draws the image, then draws all saved regions as solid blue rectangles with numbered labels. The current in-progress drag is drawn in orange with a dashed border.

The `scaleRef` and `imgRef` are refs (not state) because `redraw` is called from event handlers — using state would cause stale closure issues.

---

## Mirror + Region Stamp Pipeline

### 1. Server flip (`POST /api/blueprint-mirror`)

```ts
// route.ts (Node runtime)
const buffer = Buffer.from(await file.arrayBuffer());
let pipeline = sharp(buffer);
if (direction === 'horizontal') pipeline = pipeline.flop();
else if (direction === 'vertical') pipeline = pipeline.flip();
else pipeline = pipeline.flop().flip();

const { data, info } = await pipeline.png().toBuffer({ resolveWithObject: true });
return { name, dataUrl: `data:image/png;base64,${data.toString('base64')}`, width, height };
```

`sharp.flop()` = horizontal mirror (left ↔ right).  
`sharp.flip()` = vertical mirror (top ↕ bottom).

Output is always PNG regardless of input format.

### 2. Client-side region stamping (`applyRegionStamps`)

```ts
async function applyRegionStamps(originalUrl, flippedDataUrl, regions, direction) {
  if (regions.length === 0) return flippedDataUrl;

  // Load both images onto offscreen <canvas> elements
  const [orig, flipped] = await Promise.all([
    loadImageToCanvas(originalUrl),
    loadImageToCanvas(flippedDataUrl),
  ]);

  for (const r of regions) {
    // Clamp to bounds
    const sx = Math.max(0, r.x); const sy = Math.max(0, r.y);
    const sw = Math.min(W - sx, r.w); const sh = Math.min(H - sy, r.h);

    // Compute destination on the flipped image
    let destX = sx, destY = sy;
    if (direction === 'horizontal' || direction === 'both') destX = W - sx - sw;
    if (direction === 'vertical'   || direction === 'both') destY = H - sy - sh;

    // Copy exact pixels from original → stamp onto flipped
    const patch = orig.ctx.getImageData(sx, sy, sw, sh);
    flipped.ctx.putImageData(patch, destX, destY);
  }

  return flipped.canvas.toDataURL('image/png');
}
```

The math for `destX`/`destY` is the inverse of the flip: a region at `(x, y, w, h)` in the original maps to `(W-x-w, y)` after a horizontal flip. This is the same coordinate transform that `sharp.flop()` applies to pixels.

### `loadImageToCanvas(src)`

Creates an offscreen `<canvas>` element, draws the image, returns `{ canvas, ctx, w, h }`. Works with both `ObjectURL` strings and base64 data URLs.

---

## API Route Details (`app/api/(blueprint-mirror)/blueprint-mirror/route.ts`)

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
```

These two exports are required because:
- `runtime = 'nodejs'` — disables the Edge runtime; sharp requires full Node.js
- `dynamic = 'force-dynamic'` — prevents Next.js from attempting to statically analyse or cache this route

The route also has an OCR path (Tesseract.js) that runs when the manual regions produce 0 results. The OCR pipeline:

1. Preprocess with sharp: greyscale → 2× upscale (lanczos3) → sharpen σ1.5 → normalise → `linear(1.5, -30)` → b-w
2. `createWorker('eng', 1, { workerPath })` — PSM 11 (sparse text, no layout assumption)
3. Parse the TSV output (level=5 rows = words, confidence ≥ 15)
4. Scale coordinates back ×0.5 (because OCR ran on 2× image)
5. Extract each word patch from original → composite onto flipped image

The `workerPath` must be built with `process.cwd()` — `require.resolve()` is intercepted by Turbopack and returns a virtual path, not a real filesystem path:

```ts
const workerPath = `${process.cwd()}/node_modules/tesseract.js/src/worker-script/node/index.js`;
```

`tesseract.js` is listed in `next.config.ts` `serverExternalPackages` so webpack/Turbopack does not attempt to bundle it.

---

## Why the OCR Approach Is Unreliable for Blueprints

Tesseract is trained on natural document text. Blueprints have:
- Very small text (15–20px cap height at typical resolutions)
- Thin strokes similar to architectural lines
- Mixed content (text, symbols, hatching) with similar pixel density

The current approach (2× upscale + contrast boost + PSM 11) improves detection but still produces false positives and misses some labels. The **manual region painter is the reliable path** for critical work.

---

## Extending

**To add a "preview regions" step:** after the server flip but before `applyRegionStamps`, you could visualise the detected regions on the result image using a canvas overlay, letting the user approve/reject individual regions before committing.

**To improve OCR:** Tesseract PSM 6 (single uniform block) sometimes works better for blueprints with labels in a consistent layout. You could expose the PSM as a parameter.

**To support multi-page blueprints (PDFs):** replace the sharp pipeline with PyMuPDF page rendering (send to Python), then apply the same region-stamp logic on each page.
