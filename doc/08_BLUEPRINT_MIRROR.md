# Blueprint Mirror

## What It Does

The Blueprint Mirror flips blueprint PNG images horizontally, vertically, or in both directions at once. It supports dropping multiple blueprints in a single batch and automatically detects text and label regions in each image, re-stamping them in their correct (unmirrored) orientation so they remain readable after the flip.

## What You Need

- **Blueprint images**: PNG, JPEG, or WebP files
- **Multiple files**: Supported — drop as many as needed at once

## How to Use

### Step 1: Choose mirror direction

Select one of three modes before uploading:

| Mode | Effect |
|------|--------|
| **Horizontal** | Mirrors left ↔ right (most common for blueprints) |
| **Vertical** | Flips top ↕ bottom |
| **Both** | Applies both flips simultaneously |

The selected mode is highlighted. You can change it before processing — no need to re-upload files.

### Step 2: Drop your blueprints

Drag and drop one or more image files onto the drop zone, or click it to open a file browser. Accepted formats: PNG, JPEG, WEBP.

Queued blueprints appear as thumbnails on the right. You can remove individual files with the ✕ button before running.

### Step 3: Mirror

Click **"Mirror Blueprints"**. The tool:

1. Sends files to the server for pixel-level flipping
2. Runs client-side text detection on each image
3. Re-stamps detected text regions from the original onto the flipped result

Results appear as side-by-side **Original / Mirrored** cards. Each card shows how many text regions were detected and preserved (shown as a blue badge).

### Step 4: Download

- **Individual**: Click **Download** on any result card — saves as `mirrored_{filename}.png`
- **Batch**: Click **Download All as ZIP** — packages all results into `mirrored_blueprints.zip`

## How Text Preservation Works

After the server flips the raw pixels, a client-side canvas analysis pass runs on the original image:

1. **Ink detection** — pixels with luminance below 160 are marked as "ink"
2. **Connected components** — a union-find pass groups ink pixels into blobs
3. **Glyph filtering** — blobs are filtered by size (6–4000 px²) and aspect ratio to keep only glyph-shaped clusters, discarding long lines and noise
4. **Line grouping** — nearby glyphs within 16px of each other are merged into text-line bounding boxes
5. **Re-stamp** — each text region is copied from the original (unflipped) image and placed at the geometrically correct position on the flipped canvas

The number of preserved regions is shown in the result card badge.

## Expected Input & Output

### Input
```
Formats  : PNG, JPEG, WEBP
Quantity : Multiple files supported
Content  : Blueprints with dark lines on light background
           Text/labels should be high-contrast for best detection
```

### Output
```
Format   : PNG (always — preserves full quality)
Naming   : mirrored_{original_name}.png
Structure: flat — one output per input file
```

## Limitations

- Text detection is heuristic (pixel luminance + shape analysis), not OCR. It works well for clean, high-contrast printed labels on a light background.
- Very light grey text, coloured text, or text on a dark or patterned background may not be detected.
- If text is detected incorrectly (e.g. a fine line grouping as text), the visible effect is that a small rectangular patch from the original is stamped over the flipped area — usually not noticeable.
- Processing is entirely in the browser after the initial server flip, so very large images (> 20MP) may take a few seconds for the text analysis pass.

## Tips

- **Horizontal** is the most common mode — most blueprint reversals are left-right mirrors
- If text is still appearing mirrored, the label contrast may be too low. Try increasing contrast in your source image before uploading
- For blueprints where text is a separate layer in your design tool, keep the two-layer workflow: mirror the base image here, then re-apply text on top
- The ZIP download is the fastest way to collect all results when processing a large batch
