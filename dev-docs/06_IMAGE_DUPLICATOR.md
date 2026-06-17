# Image Duplicator

**Route:** `/image-duplicator`  
**API route:** `app/api/image-duplicator/process/route.ts` (Node-only, no Python)

---

## What It Does

Given a CSV mapping file (`original_id, copy_id`) and a set of source images, creates renamed copies of each image according to the mappings. Returns all outputs (originals + copies) as a single ZIP download.

---

## CSV Format

```
original_id, copy_id
1,7
2,4
3,5
3,6
```

- IDs are matched case-insensitively against uploaded image filenames (without extension)
- One original can map to multiple copies (rows `3,5` and `3,6` both copy from `3.*`)
- Extension is preserved from the original file

---

## Client (`app/image-duplicator/page.tsx`)

### State

```ts
csvFile: File | null
imageFiles: File[]
isProcessing: boolean
processingResult: ProcessingResult | null
isDraggingCsv: boolean
isDraggingImages: boolean
```

The page has two phases — upload form and results view — toggled by `processingResult !== null`.

### Upload

Images are appended to FormData with indexed keys: `image_0`, `image_1`, `image_2`, etc. The API reads them with an index-incrementing loop.

```ts
formData.append("csv", csvFile);
imageFiles.forEach((file, index) => {
  formData.append(`image_${index}`, file);
});
```

### Download

The API returns a `downloadUrl` as a base64 data URI (`data:application/zip;base64,...`). A temporary `<a>` element triggers the browser download.

---

## API Route (`app/api/image-duplicator/process/route.ts`)

This is a **pure Node.js route** — no Python involved. All processing happens in the Next.js API handler.

### Processing steps

```
1. Parse CSV → CsvRow[] { originalId, copyId }
2. Collect uploaded images into a Map<string, { buffer, extension, originalName }>
   key = basename.toLowerCase() (filename without extension, lowercase)
3. Create temp directory: public/temp/duplicated_{timestamp}/
4. Save all originals to temp dir (filename = originalName)
5. For each CSV row:
   - Look up originalId in the map (case-insensitive)
   - If not found → status: 'missing'
   - If found → write buffer as {copyId}.{extension}
6. Create ZIP from temp dir (using archiver, excludes *.csv files)
7. Base64-encode ZIP → data URL
8. Return { success, totalMappings, successfulCopies, failedCopies, results[], downloadUrl }
```

### ZIP creation with `archiver`

```ts
async function createZipFromFolder(folderPath: string): Promise<Buffer> {
  const { default: archiver } = await import("archiver");
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    archive.on("data", chunk => chunks.push(chunk));
    archive.on("end", () => resolve(Buffer.concat(chunks)));
    archive.glob("**/*", {
      cwd: folderPath,
      ignore: ["**/*.csv"],
      filter: (filepath) => imageExtensions.includes(ext),
    });
    archive.finalize();
  });
}
```

`archiver` is loaded with a dynamic `import()` inside the function — this avoids issues with module resolution in some environments.

### Temp directory cleanup

The temp directory at `public/temp/duplicated_{timestamp}/` is **not cleaned up automatically**. In production you'd want a periodic cleanup job for the `public/temp/` directory. This was an intentional simplification — files are transient and the directory is not publicly accessible by meaningful paths.

---

## Error Cases

| Scenario | Result |
|---|---|
| CSV row references an ID not in uploaded images | `status: 'missing'` in results |
| File write failure | `status: 'error'` with error message |
| Invalid CSV (no rows) | 400 response |
| No images uploaded | 400 response |

Even with failures, the ZIP is still created and returned (with whatever files were successfully written). The results table shows the full breakdown.
