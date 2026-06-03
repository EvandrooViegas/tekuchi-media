// app/api/(pdf-bulk)/pdf-proxy/route.ts
// Server-side proxy to fetch the PDF from docgen.tsrvc.com
// This avoids CORS issues on the browser and handles the polling logic.
import { NextRequest, NextResponse } from "next/server";

const DOCGEN_BASE = "https://docgen.tsrvc.com/get-pdf";
const APARTMENT_URL_TEMPLATE =
  "https://tekuchiapps.com/100avenueroad/development/apartments/the-apartments-overview/1/{apt}/print/share/1";

// How long to wait between polls (ms)
const POLL_INTERVAL_MS = 4000;
// Maximum total wait time per apartment (ms) — 10 minutes
const MAX_WAIT_MS = 10 * 60 * 1000;

/**
 * GET /api/pdf-proxy?apt=45169
 *
 * Returns the raw PDF bytes once generated.
 * Streams the status via a Server-Sent Events response or returns the binary directly.
 *
 * We use a simple polling approach:
 *   1. Load the docgen page.
 *   2. Parse the HTML for a download link (the site shows "Click Here to download" once done).
 *   3. Fetch that link and return the PDF bytes.
 */
export async function GET(req: NextRequest) {
  const aptStr = req.nextUrl.searchParams.get("apt");
  if (!aptStr) {
    return NextResponse.json({ error: "Missing apt parameter" }, { status: 400 });
  }

  const aptNumber = parseInt(aptStr, 10);
  if (isNaN(aptNumber)) {
    return NextResponse.json({ error: "Invalid apt number" }, { status: 400 });
  }

  const apartmentUrl = APARTMENT_URL_TEMPLATE.replace("{apt}", String(aptNumber));
  const docgenUrl = `${DOCGEN_BASE}?url=${encodeURIComponent(apartmentUrl)}`;

  const startTime = Date.now();

  // Poll until the download link appears
  while (Date.now() - startTime < MAX_WAIT_MS) {
    try {
      const pageRes = await fetch(docgenUrl, {
        headers: {
          // Mimic a real browser to avoid bot-detection
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        },
        // Don't throw on non-2xx — we'll check the body
        redirect: "follow",
      });

      if (!pageRes.ok) {
        // Service unavailable or rate-limited — wait and retry
        await sleep(POLL_INTERVAL_MS);
        continue;
      }

      const html = await pageRes.text();

      // Look for a direct PDF link or a "Click Here to download" anchor.
      // Typical docgen responses contain something like:
      //   <a href="https://...download...pdf">Click Here to download</a>
      //   or a meta-refresh with the PDF url
      //   or an <iframe src="...pdf...">
      const pdfUrl = extractPdfUrl(html, docgenUrl);

      if (pdfUrl) {
        // Download the actual PDF
        const pdfRes = await fetch(pdfUrl, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          },
          redirect: "follow",
        });

        if (!pdfRes.ok) {
          return NextResponse.json(
            { error: `PDF fetch failed: ${pdfRes.status}` },
            { status: 502 }
          );
        }

        const pdfBuffer = await pdfRes.arrayBuffer();

        return new NextResponse(pdfBuffer, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="apartment-${aptNumber}.pdf"`,
            "Content-Length": String(pdfBuffer.byteLength),
          },
        });
      }

      // Not ready yet — wait before next poll
      await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      console.error(`[pdf-proxy] Error fetching apt ${aptNumber}:`, err);
      await sleep(POLL_INTERVAL_MS);
    }
  }

  return NextResponse.json(
    { error: "Timeout: PDF generation took too long" },
    { status: 504 }
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Attempt to extract the PDF download URL from the docgen HTML page.
 * The page typically shows a "Click Here to download" link once ready.
 */
function extractPdfUrl(html: string, pageUrl: string): string | null {
  // Strategy 1: anchor with .pdf href
  const anchorMatch = html.match(
    /href=["']([^"']*\.pdf[^"']*)["']/i
  );
  if (anchorMatch) return resolveUrl(anchorMatch[1], pageUrl);

  // Strategy 2: "Click Here to download" link (any href)
  const clickHereMatch = html.match(
    /href=["']([^"']+)["'][^>]*>[\s\S]{0,80}?click here to download/i
  );
  if (clickHereMatch) return resolveUrl(clickHereMatch[1], pageUrl);

  // Strategy 3: meta refresh redirect pointing to a pdf
  const metaMatch = html.match(
    /<meta[^>]+http-equiv=["']refresh["'][^>]+content=["'][^;]+;\s*url=([^"']+)/i
  );
  if (metaMatch) {
    const target = metaMatch[1].trim();
    if (target.toLowerCase().includes("pdf") || target.startsWith("http")) {
      return resolveUrl(target, pageUrl);
    }
  }

  // Strategy 4: iframe/embed src pointing to a pdf
  const iframeMatch = html.match(
    /<(?:iframe|embed)[^>]+src=["']([^"']*\.pdf[^"']*)["']/i
  );
  if (iframeMatch) return resolveUrl(iframeMatch[1], pageUrl);

  // Strategy 5: Any URL in the page containing "download" and "pdf"
  const downloadMatch = html.match(
    /https?:\/\/[^\s"'<>]+download[^\s"'<>]*\.pdf/i
  );
  if (downloadMatch) return downloadMatch[0];

  return null;
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
