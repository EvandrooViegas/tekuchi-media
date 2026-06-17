# Architecture — API Patterns, Config, Shared Components

---

## API Route Conventions

All routes live under `app/api/`. Next.js App Router uses **Route Handlers** — files named `route.ts` inside a folder whose path becomes the URL.

### Route Groups

Folders wrapped in `(parens)` are **route groups** — they affect file organisation but have zero effect on the URL. This is used purely to keep related routes together:

```
app/api/(compressor)/upload/route.ts   →  /api/upload
app/api/(compressor)/run/route.ts      →  /api/run
app/api/(compressor)/logs/route.ts     →  /api/logs
```

### Pattern 1 — Proxy to Python

Most routes do nothing but forward the request to the Python FastAPI server:

```ts
import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const response = await fetch(`${PYTHON_API_URL}/some-endpoint`, {
      method: 'POST',
      body: formData,
      // DO NOT set Content-Type manually — let fetch set the multipart boundary
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'upstream error' }, { status: response.status });
    }
    return NextResponse.json(await response.json());
  } catch (error) {
    return NextResponse.json({ error: 'Proxy unreachable' }, { status: 502 });
  }
}
```

**Important:** never set `Content-Type: multipart/form-data` manually. The browser/Node's `fetch` adds the correct boundary automatically when you pass a `FormData` body. Setting it manually breaks the boundary.

### Pattern 2 — Node-native (no Python)

Some routes do their own processing in Node:

```ts
import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  const buffer = Buffer.from(await file.arrayBuffer());
  // ... sharp, archiver, etc.
  return NextResponse.json({ result: '...' });
}
```

### Pattern 3 — Disk file serving

For serving processed files from the filesystem (media/download):

```ts
import { getProcessorPaths } from '@/lib/config';
import path from 'path';
import { promises as fs } from 'fs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');         // may include subdirectory
  const paths = getProcessorPaths();
  const filePath = path.join(paths.processed, filename);  // join handles subdirs
  const fileBuffer = await fs.readFile(filePath);
  return new NextResponse(fileBuffer, { headers: { 'Content-Type': '...' } });
}
```

Key detail: `filename` can be a relative path like `42_12_1.jpg/42_12_1_1080p.jpg` (subfolder + file). `path.join` handles this correctly. **Never strip the path to just the basename** — that was the source of a previous bug where processed files couldn't be found.

---

## `lib/config.ts`

```ts
export function getProcessorPaths(): {
  inbox: string;
  processed: string;
  archive: string;
  processing: string;
  cropper_inbox: string;
  cropper_processed: string;
}

export const PYTHON_API_URL: string;
```

### How `%(base_path)s` interpolation works

Python's `configparser` supports `%(key)s` interpolation natively. The Node `ini` package does not. The solution in `lib/config.ts` is a JavaScript `Proxy`:

```ts
const handler = {
  get(target: any, prop: string) {
    const value = target[prop];
    if (typeof value === 'string' && value.includes('%(base_path)s')) {
      return value.replace(/%\(base_path\)s/g, basePath);
    }
    return value;
  }
};
const interpolatedPaths = new Proxy(rawConfig.paths || {}, handler);
```

Every property access on `interpolatedPaths` triggers the proxy, which replaces `%(base_path)s` on the fly.

### `PYTHON_API_URL`

```ts
export const PYTHON_API_URL = process.env.PYTHON_API_URL ?? 'http://localhost:8000';
```

Override in production by setting the `PYTHON_API_URL` environment variable.

---

## Shared UI Components (`components/ui/`)

Built with **shadcn** conventions on top of `radix-ui`. All component files use `class-variance-authority` (CVA) for variant management and `tailwind-merge` via the `cn()` utility.

### `cn()` utility (`lib/utils.ts`)

```ts
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Standard Tailwind class merger. Use it everywhere you conditionally apply classes.

### Key components

**Button** — 6 variants × 7 sizes. Default is `rounded-none` (square corners) — this is intentional per the design system. To get rounded corners pass a `className` override like `rounded-xl`.

```tsx
<Button variant="outline" size="sm" className="rounded-lg">Cancel</Button>
```

**Card** — shell component. Accepts a `size="sm"` prop. By default uses `ring-1 ring-foreground/10` instead of a visible border. Pages typically override with `border border-slate-200/60 shadow-sm`.

**Dialog** — used in `MediaPreview` for the lightbox. Uses Radix `Dialog.Root`.

**Tabs** — used in Compressor (Processed Files / Live Terminal) and Resizer (Automation / Manual / Server Logs). Radix-based.

**Sonner (Toaster)** — `<Toaster />` is mounted once in `app/layout.tsx`. Use `toast()`, `toast.success()`, `toast.error()`, `toast.warning()` anywhere in client components — no provider needed at the component level.

### `components/docs-banner.tsx`

```tsx
<DocsBanner docFile="02_COMPRESSOR" explanation="One-line description of the tool." />
```

Renders a "Documentation Guide →" footer link pointing to `/docs?file=02_COMPRESSOR`. Add this to the bottom of every new tool page.

---

## Layout (`app/layout.tsx`)

```tsx
<div className="flex flex-col h-screen overflow-hidden">
  <Navbar />                                    {/* flex-none — fixed height */}
  <main className="flex-grow overflow-y-auto">  {/* scrollable area */}
    {children}
  </main>
</div>
<Toaster />
```

Pages get the full remaining viewport height via `flex-grow`. Most pages add `h-full overflow-y-auto pb-20` on their root div to handle their own scrolling.

**Fonts:** Figtree (`--font-sans`, body text), Noto Sans (`--font-heading`), Geist Sans + Mono (CSS variables available).

---

## Navbar (`app/navbar.tsx`)

Three dropdown groups clicked to open, outside-click to close:

```
NAV_GROUPS = [
  { label: 'Media',     items: [Compressor, Resizer, Thumbnailer] },
  { label: 'Images',    items: [Image Duplicator, Blueprint Mirror] },
  { label: 'Utilities', items: [Font Converter, PDF Comparer, PDF Bulk Downloader] },
]
```

Adding a tool:
1. Add it to the correct `items` array in `NAV_GROUPS`
2. Import the icon from `lucide-react`

---

## Adding a New API Route

### Proxy example

```ts
// app/api/(my-tool)/my-endpoint/route.ts
import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  const formData = await req.formData();
  const response = await fetch(`${PYTHON_API_URL}/my-python-endpoint`, {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    return NextResponse.json({ error: 'upstream error' }, { status: response.status });
  }
  return NextResponse.json(await response.json());
}
```

### Node-native with Tesseract / worker_threads

If your route uses `tesseract.js` or any package that spawns `worker_threads`, you MUST:

1. Add `export const runtime = 'nodejs'` and `export const dynamic = 'force-dynamic'` at the top of the route file.
2. Add the package to `serverExternalPackages` in `next.config.ts` so webpack doesn't try to bundle it.
3. Use `require()` (not `import`) for the package inside the handler function, and resolve its worker path with `process.cwd()`:

```ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const { createWorker } = require('tesseract.js');
  const workerPath = `${process.cwd()}/node_modules/tesseract.js/src/worker-script/node/index.js`;
  const worker = await createWorker('eng', 1, { workerPath });
  // ...
}
```

Why `process.cwd()` instead of `require.resolve()`? Next.js's Turbopack intercepts `require.resolve` and returns a virtual path string — not a real filesystem path. `process.cwd()` always returns the real working directory.

---

## Error Handling Patterns

All API routes follow this shape — never let unhandled errors bubble up:

```ts
export async function POST(request: NextRequest) {
  try {
    // ... work
    return NextResponse.json({ result });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[route-name] Error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

Use `502` when the Python server is unreachable (connection refused), `500` for Node-side errors, `400` for bad input.
