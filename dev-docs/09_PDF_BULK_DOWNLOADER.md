# PDF Bulk Downloader

**Route:** `/pdf-bulk-downloader`  
**API route:** `app/api/(pdf-bulk)/pdf-proxy/route.ts` (Node-only)

---

## What It Does

Batch-download apartment PDF brochures from `docgen.tsrvc.com` by apartment number range. Manages a concurrent job queue, shows per-job progress, and assembles all completed PDFs into a client-side ZIP.

The apartment number range is hardcoded to `45169–45340` (the current project) but trivial to change.

---

## Architecture

```
Browser
  │  Click "Start"
  │  → builds Job[] list (one per apartment number in range)
  │  → spawns N concurrent async workers (configurable 1–50)
  │     Each worker loops:
  │       GET /api/pdf-proxy?apt={apt}     (polls until PDF is ready)
  │       → receives raw PDF bytes (arraybuffer)
  │       → stores as Blob in job state
  │
  │  Click "Download ZIP"
  │  → jszip assembles all pdfBlob values in memory
  │  → triggers browser download
  ▼
/api/pdf-proxy (Node.js)
  │  Polls docgen.tsrvc.com/get-pdf?url={apartmentUrl}
  │  Parses HTML response for a PDF link
  │  Fetches and streams the PDF binary back
  ▼
docgen.tsrvc.com  (external service, not controlled by us)
```

---

## Client State (`app/pdf-bulk-downloader/page.tsx`)

```ts
rangeFrom: number         // apartment range start
rangeTo: number           // apartment range end
jobs: Job[]               // per-apartment job records
isRunning: boolean
isZipping: boolean
concurrency: number       // 1 | 3 | 5 | 10 | 20 | 50
```

`Job` shape:
```ts
type Job = {
  apt: number;
  status: 'queued' | 'generating_link' | 'generating_pdf' | 'downloading_pdf' | 'done' | 'error';
  label: string;           // human-readable status message
  pdfBlob?: Blob;          // set when status === 'done'
  error?: string;          // set when status === 'error'
  startedAt?: number;      // Date.now() timestamp
  finishedAt?: number;
};
```

`jobsRef` is a `useRef` that mirrors `jobs` state. It's needed because the ZIP handler runs after all jobs complete and needs to read the final `pdfBlob` values — using state directly would capture a stale closure.

### Concurrency model

```ts
const queue = jobs.map(j => j.apt);  // apartment numbers to process
let idx = 0;

async function worker() {
  while (idx < queue.length) {
    if (stoppedRef.current) break;
    const apt = queue[idx++];        // atomic increment (JS is single-threaded)
    await processJob(apt, signal);
  }
}

// Spawn N workers
const workers = Array.from({ length: concurrency }, () => worker());
await Promise.all(workers);
```

JavaScript's single-threaded event loop makes the `idx++` increment safe without a mutex — only one worker advances `idx` at a time.

### Cancellation

```ts
const controller = new AbortController();
abortRef.current = controller;
```

The `AbortSignal` is passed to each `fetch()` call inside `processJob`. When "Stop" is clicked:
1. `stoppedRef.current = true` — workers exit their while loops
2. `controller.abort()` — in-flight fetches receive an `AbortError`

In-progress jobs are marked `status: 'error', label: 'Cancelled'` when they catch the AbortError.

---

## API Route (`app/api/(pdf-bulk)/pdf-proxy/route.ts`)

**Purpose:** avoid CORS by proxying the request server-side. Also handles the polling loop so the browser doesn't need to stay active.

### Polling loop

```ts
const MAX_WAIT_MS = 10 * 60 * 1000;  // 10 minutes max per apartment

while (Date.now() - startTime < MAX_WAIT_MS) {
  const pageRes = await fetch(docgenUrl, { headers: { 'User-Agent': '...' } });
  const html = await pageRes.text();
  const pdfUrl = extractPdfUrl(html, docgenUrl);
  if (pdfUrl) {
    const pdfRes = await fetch(pdfUrl, ...);
    return new NextResponse(await pdfRes.arrayBuffer(), {
      headers: { 'Content-Type': 'application/pdf', ... }
    });
  }
  await sleep(4000);  // poll every 4 seconds
}
return NextResponse.json({ error: 'Timeout' }, { status: 504 });
```

### `extractPdfUrl(html, pageUrl)`

Tries five strategies in order:

1. Any `href` containing `.pdf`
2. `href` on an anchor with text "Click Here to download"
3. `<meta http-equiv="refresh">` pointing to a PDF
4. `<iframe>` or `<embed>` `src` containing `.pdf`
5. Any absolute URL in the page containing both "download" and ".pdf"

`resolveUrl(href, base)` handles relative URLs via `new URL(href, base).toString()`.

---

## ZIP Assembly

Uses `jszip` with `compression: 'STORE'` (no compression) for PDFs:

```ts
const JSZip = (await import("jszip")).default;  // lazy import
const zip = new JSZip();
for (const job of completedJobs) {
  zip.file(`apartment-${job.apt}.pdf`, job.pdfBlob!, { compression: "STORE" });
}
const zipBlob = await zip.generateAsync({ type: "blob" });
```

PDFs are already internally compressed — re-compressing them with Deflate wastes CPU with minimal size benefit. `STORE` skips compression entirely.

`jszip` is loaded lazily with `await import("jszip")` to avoid including it in the initial bundle for the page.

---

## Configuration

Constants at the top of `page.tsx`:

```ts
const APT_MIN = 45169;
const APT_MAX = 45340;
const CONCURRENCY_OPTIONS = [1, 3, 5, 10, 20, 50];
const DEFAULT_CONCURRENCY = 3;
```

And in the API route:

```ts
const DOCGEN_BASE = "https://docgen.tsrvc.com/get-pdf";
const APARTMENT_URL_TEMPLATE = "https://tekuchiapps.com/100avenueroad/.../1/{apt}/print/share/1";
const POLL_INTERVAL_MS = 4000;
const MAX_WAIT_MS = 10 * 60 * 1000;
```

To adapt this for a different project: update `APT_MIN`, `APT_MAX`, and `APARTMENT_URL_TEMPLATE`.

---

## Error Handling and Retry

Failed jobs show an error badge with the error message truncated. A "Retry N Failed" button resets failed jobs to `queued` and re-runs them through the same worker pool. The successful jobs are untouched.

The retry mechanism re-creates the `AbortController` — a new abort signal is needed because the previous one was already aborted or closed.

---

## Rate Limiting

Higher concurrency values are faster but risk hitting docgen's rate limiting. If requests start returning non-200 responses, the polling loop backs off with `sleep(4000)` before retrying — but doesn't implement exponential backoff. If rate limiting becomes a problem, adding jitter to `POLL_INTERVAL_MS` or capping concurrency would help.
