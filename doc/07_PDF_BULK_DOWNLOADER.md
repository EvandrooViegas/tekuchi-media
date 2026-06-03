# PDF Bulk Downloader

## What It Does

The PDF Bulk Downloader fetches apartment PDF documents in bulk from the docgen service (`docgen.tsrvc.com`). You select a range of apartment numbers, and the tool generates each PDF via the docgen pipeline — polling until it's ready — then lets you download them individually or as a single ZIP archive.

## What You Need

### Required
- A valid range of apartment numbers (between **45169** and **45340**)

### No file uploads needed
All data is fetched remotely from the docgen service using the apartment number as the key.

## How to Use

### Step 1: Select a Range
1. Go to `/pdf-bulk-downloader`
2. In the **"1. Select Range"** panel, set:
   - **From**: starting apartment number
   - **To**: ending apartment number
3. Both fields are clamped to the valid range (45169–45340)
4. The visual range bar and apartment count update in real time
5. Use quick-select presets for common ranges:
   - **All** — the entire 45169–45340 range
   - **First 10** — apartments 45169–45178
   - **First 50** — apartments 45169–45218
   - **First 100** — apartments 45169–45268

> Maximum of **500 apartments** per run.

### Step 2: Set Concurrency
In the **"2. Run"** panel, choose how many apartments to process simultaneously using the **Concurrent Jobs** selector: `1 / 3 / 5 / 10 / 20 / 50`.

- Higher values finish faster but may trigger rate-limiting on the docgen service
- Default is **3** — a safe starting point
- If you see many failures, reduce concurrency and retry

### Step 3: Run the Jobs
1. Click **"Start (N PDFs)"**
2. The job queue table updates live with per-apartment status
3. Click **"Stop Jobs"** at any time to cancel in-flight requests

### Step 4: Monitor Progress
The stats panel shows:
- **Done** — successfully downloaded PDFs
- **Running** — apartments currently being processed
- **Failed** — apartments that encountered an error
- An overall progress bar (done + failed / total)

### Step 5: Handle Failures
If any jobs fail, the **"Retry N Failed"** button appears.  
Click it to requeue only the failed apartments and process them again.

### Step 6: Download
- **Individual PDF**: click the **"PDF"** button on any completed row in the job table — available as soon as that job finishes, even while other jobs are still running
- **All at once**: click **"Download ZIP (N PDFs)"** in the **"3. Download ZIP"** panel — available as soon as at least one job is done, no need to wait for the full run to complete

The ZIP is named `apartments-{from}-{to}.zip` and only includes jobs that have the **Done** status at the time you click.

## Job Statuses

| Status | Meaning |
|--------|---------|
| **Queued** | Waiting to be picked up by a worker |
| **Generating Link** | Building the docgen URL for this apartment |
| **Generating PDF** | Waiting for docgen to render the PDF |
| **Downloading PDF** | Fetching the rendered PDF from the server |
| **Done** | PDF successfully downloaded and held in memory |
| **Error** | Something went wrong — hover the badge to see the error |

## Expected Input & Output

### Input
```
Apartment range: 45169 – 45340
→ No file uploads required
→ Each apartment maps to a unique docgen URL
```

### Output
```
Individual: apartment-{number}.pdf
ZIP archive: apartments-{from}-{to}.zip
  ├── apartment-45169.pdf
  ├── apartment-45170.pdf
  └── ...
```

## How It Works (Technical)

Each apartment job goes through these steps server-side via `/api/pdf-proxy?apt={number}`:

1. **URL construction** — the apartment number is substituted into the docgen template URL pointing to `tekuchiapps.com/100avenueroad/…`
2. **Polling** — the proxy fetches the docgen page every **4 seconds**, scanning the HTML for a PDF download link (anchor `.pdf` href, "Click Here to download", meta-refresh, iframe src, etc.)
3. **PDF fetch** — once a download link is found, the proxy fetches the raw PDF bytes and streams them back to the browser
4. **Timeout** — if no PDF link appears within **10 minutes**, the job fails with a timeout error

The browser runs the chosen number of concurrent workers. Each worker picks the next queued apartment, waits for the server to return the PDF, then moves on to the next one.

The ZIP is built using `STORE` mode (no recompression) — since PDFs are already compressed internally, this makes ZIP generation near-instant regardless of how many files are included.

## Tips & Tricks

1. **Start small** — run "First 10" before committing to the full range, to confirm everything is working
2. **Download the ZIP mid-run** — you don't have to wait for all jobs to finish; click "Download ZIP" any time to grab the PDFs that are already done
3. **Retry failures** — transient network errors are common; use "Retry Failed" before assuming a PDF is unavailable
4. **Don't close the tab** — PDFs are held in browser memory; closing or refreshing the page loses all downloaded blobs
5. **Tune concurrency** — start at 3–5 and increase if jobs are completing without errors; back off if you see a spike in failures

## Limitations

- Maximum **500 apartments** per run
- Valid apartment numbers: **45169–45340** only
- PDFs are stored in browser memory — very large batches (100+ PDFs) may use significant RAM
- If the browser tab is closed or refreshed, all blobs are lost and the run must be restarted
- PDF generation depends on the external docgen service; downtime or rate-limiting on that service will cause failures
- No persistent storage — there is no history of previous runs

## Common Use Cases

- **Bulk PDF export** — download all apartment overview PDFs for an entire building in one go
- **Selective export** — use the range inputs to target a specific floor or block of units
- **Re-download after content updates** — re-run the same range after apartment data has been updated on the source site

## Troubleshooting

### "HTTP 504 — Timeout: PDF generation took too long"
- The docgen service took more than 10 minutes for this apartment
- Use "Retry Failed" — it often succeeds on a second attempt
- Check if `docgen.tsrvc.com` is reachable

### "HTTP 502 — PDF fetch failed"
- The PDF link was found but the download itself failed
- Use "Retry Failed"

### "Cancelled by user"
- You clicked "Stop Jobs" while this apartment was in progress
- Re-run or use "Retry Failed" to process it

### Jobs stuck on "Generating PDF" for a long time
- The docgen service may be slow or temporarily unavailable
- Wait for the 10-minute timeout, then retry
- Try reducing concurrency to avoid overwhelming the service

### ZIP is empty or missing apartments
- Only **Done** jobs are included in the ZIP
- Retry any failed jobs first, then download the ZIP again
