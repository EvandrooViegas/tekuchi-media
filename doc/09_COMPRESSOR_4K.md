# Media Compressor — 4K Output

## What It Does

When the Media Compressor receives an image whose dimensions are 3840×2160 or larger (i.e. either axis meets the 4K threshold), it automatically produces **two output files** instead of one:

| Output | Resolution | Filename suffix |
|--------|-----------|-----------------|
| HD version | 1920×1080 | `_1080p` |
| 4K version | 3840×2160 | `_4k` |

Both files are placed inside a named subfolder under `PROCESSED/`, organised by the original filename.

## Output Structure

Given an input file named `42_12_1.jpg`:

```
PROCESSED/
└── 42_12_1.jpg/
    ├── 42_12_1_1080p.jpg
    └── 42_12_1_4k.jpg
```

For a standard image below the 4K threshold (e.g. `banner.jpg` at 1280×720):

```
PROCESSED/
└── banner.jpg/
    └── banner_1080p.jpg
```

Every image now gets its own subfolder regardless of whether a 4K version is generated. This keeps the `PROCESSED` directory clean and makes it easy to locate all variants of a specific source file.

## When Is the 4K Version Generated?

The 4K output is created when **either dimension** of the source image meets or exceeds the 4K threshold:

- Width ≥ 3840 px, **or**
- Height ≥ 2160 px

This means ultra-wide or portrait-oriented sources that are large enough also receive a 4K variant scaled to 2160px on their longest axis.

## How the Scaling Works

Both outputs use ffmpeg for the resize and Pillow for the final optimisation pass:

- **1080p**: height scaled to 1080px, width calculated proportionally and rounded to the nearest even number
- **4K**: height scaled to 2160px, same proportional width calculation
- If the source is already at or below the target height for a given output, the original is copied unchanged (no upscaling)
- After resizing, Pillow applies lossless compression for PNG or quality-92 optimisation for JPEG

## Keep-Original Guard

The "Already Optimal" status (where the original file is kept because compression would make it larger) only applies to images **below** the 4K threshold. For 4K-capable sources, both outputs are always written regardless of file size comparison, since the two versions serve different use cases.

## Workflow

```
Upload image → Run Converter
    ↓
Is source ≥ 3840×2160?
    ├── YES → Generate _1080p  +  _4k  →  PROCESSED/{name}/
    └── NO  → Generate _1080p only    →  PROCESSED/{name}/
```

## Viewing Results in the UI

The **Processed Files** table in the compressor UI shows one row per source file. The **Outputs** column lists all generated files — for 4K sources you will see two download buttons, one for each resolution variant.

## Tips

- Source files are archived to `PROCESSED_SOURCES/` after processing, so originals are always preserved
- If you need a specific crop or aspect ratio beyond simple scaling, use the **Image Resizer** tool which provides center/top/bottom crop variants
- The subfolder naming uses the full original filename including extension (e.g. `42_12_1.jpg/`) so the folder name visually maps back to the source file
