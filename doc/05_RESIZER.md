# Image Resizer & Cropper

## What It Does

The Image Resizer creates multiple cropped versions of images in HD dimensions (1920x1080, 3840x2160, 800x450, etc.). It intelligently crops images from three perspectives (center, top-weighted, bottom-weighted) to create optimized versions for different use cases. It supports both automated batch processing and manual direct upload.

## What You Need

### Required
- **Image Files**: Any image format (JPG, PNG, WebP, etc.)
- **Target Resolution**: Choose from preset options or customize

### Automation Requirements (Optional)
- Images placed in a monitored TODO folder
- System watches folder and processes on demand

## Operating Modes

### Mode 1: Automation (Batch Processing)
Automatically process images from a folder when you click "Run Batch"

### Mode 2: Manual (Direct Upload)
Upload images directly and select dimensions for processing

## How to Use - Automation Mode

### Step 1: Access Automation Tab
1. Go to `/resizer`
2. Click the **"Automation"** tab
3. View:
   - **Inbox Count**: Number of images ready to process
   - **In Queue**: Live preview of pending images
   - **Status Indicator**: Shows watcher is active

### Step 2: Check Queue
1. The **"In Queue"** card shows thumbnails of pending images
2. Green border indicates active files
3. "TODO" label shows processing status

### Step 3: Run Batch
1. Click **"Run Batch Processor"** button
2. Button changes to "Processing..." with spinner
3. System processes all queued images into:
   - **1920x1080** (HD Standard) - 3 crop variants
   - **3840x2160** (4K Ultra) - 3 crop variants
   - **800x450** (Small Wide) - 3 crop variants
4. Originals automatically moved to ORIGINALS folder

### Step 4: View History
1. After processing, **"Recently Processed Folders"** section appears
2. Scroll horizontally through processed items
3. Each card shows:
   - Thumbnail preview of original
   - Folder name
   - "Folder Organized" status
4. Click any card to view all crop variants

### Step 5: Inspect Results
1. Modal opens showing processed images
2. **"Source Image"** section shows original
3. Three columns show crop variants:
   - **Center Balanced Crop** - Equal padding all sides
   - **Top Weighted Crop** - Emphasizes top portion
   - **Bottom Weighted Crop** - Emphasizes bottom portion
4. Each shows compression stats (if compressed)
5. **"Download HD"** button downloads individual variant

## How to Use - Manual Mode

### Step 1: Access Manual Tab
1. Go to `/resizer`
2. Click the **"Manual"** tab

### Step 2: Upload Images
1. Click or drag image files into the upload area
2. Multiple images can be selected at once
3. Files load with automatic dimension selection prompt

### Step 3: Select Dimensions
1. Modal appears: "Select Export Size"
2. Choose from preset options:
   - **1920x1080** (HD Standard)
   - **3840x2160** (4K Ultra)
   - **800x450** (Small Wide)
   - **800x534** (Small Portrait)
3. Click selected dimension to start processing
4. Note: Images smaller than selected resolution become originals

### Step 4: Processing
1. Spinner shows upload progress
2. System processes images into 3 crop variants
3. Processing typically takes seconds to minutes

### Step 5: View Results
1. Processed images appear in list below upload area
2. Each entry shows:
   - Thumbnail from center crop
   - Image filename
   - Green status: "Ready (1920x1080)" or dimension selected
   - Click to view full details

### Step 6: Inspect Results
1. Click any processed image to open detail modal
2. Shows:
   - **Source Image** (original - if available)
   - **Center Balanced Crop**
   - **Top Weighted Crop**
   - **Bottom Weighted Crop**
3. Each section shows:
   - Preview of crop
   - Compression stats
   - **"Download HD"** button

### Step 7: Download
1. Click **"Download HD"** on any crop variant
2. File names follow format: `HD_{CROPTYPE}_{imagename}.jpg`
3. Examples:
   - `HD_center_photo.jpg`
   - `HD_top_landscape.jpg`
   - `HD_bottom_city.jpg`

## Expected Input & Output

### Input Format
```
Image Files: JPG, PNG, WebP, etc.
Size: Any resolution (from mobile to ultra-HD)
Naming: Any filename
Quantity: Single or batch
```

### Output Format
```
Format: JPEG (1920x1080, 3840x2160, or 800x450)
Structure:
├── 1920x1080/
│   ├── center/
│   │   └── image.jpg
│   ├── top/
│   │   └── image.jpg
│   └── bottom/
│       └── image.jpg
├── 3840x2160/ (optional)
│   └── same structure
├── 800x450/ (optional)
│   └── same structure
└── ORIGINALS/
    └── image.jpg

Naming: {targetRes}/{cropType}/{original-filename}.jpg
File Size: Varies by dimension, typically 100KB-2MB per variant
```

## Crop Types Explained

| Crop Type | Purpose | Best For |
|-----------|---------|----------|
| **Center** | Balanced view with equal margins | Safe default choice |
| **Top** | Emphasizes upper portion of image | Landscapes, skies, headers |
| **Bottom** | Emphasizes lower portion of image | Ground, products, subjects |

## Presets Available

### Automation (Fixed Dimensions)
- **1920x1080** (HD) - Standard HD resolution
- **3840x2160** (4K) - Ultra HD resolution
- **800x450** (Small) - Mobile/web thumbnail
- All processed with center/top/bottom crops

### Manual Selection (Flexible)
- **1920x1080** (HD Standard)
- **3840x2160** (4K Ultra)
- **800x450** (Small Wide)
- **800x534** (Small Portrait)

## Special Handling

### Images Smaller Than Target
- **Behavior**: Returned as originals (not upscaled)
- **Toast Message**: "Some images were returned as originals (too small for target)"
- **Result**: Original files kept unchanged in ORIGINALS folder

### Compression Stats
- Each crop variant shows compression ratio
- Format: "COMPRESSED: 45%" or similar
- Indicates quality optimization applied

## Tips & Tricks

1. **Batch Efficiency**: Process many images at once in automation mode
2. **Multiple Dimensions**: Process same images multiple times for different uses
3. **Three Perspectives**: Each crop emphasizes different image area for flexibility
4. **Quality Control**: Preview all crops before downloading final versions
5. **Automation Advantage**: Set it and forget it with folder watching
6. **Manual Control**: Direct upload gives immediate dimension selection

## Limitations

- Images smaller than target dimension stay as originals
- Very large images (>100MP) may take longer to process
- Video files not supported (images only)
- Animated GIFs lose animation (converted to static JPEG)
- Very wide/tall aspect ratio images may have odd crops

## Common Use Cases

- **Social Media**: Create multiple sizes for different platforms
- **Website Optimization**: HD, 4K, and mobile thumbnails
- **E-Commerce**: Product images in multiple zoom levels
- **Portfolio**: Different crops emphasizing different aspects
- **Content Syndication**: Multiple crop options for flexibility
- **Archive Processing**: Bulk convert folder of images

## Folder Structure (Automation)

```
TODO/
├── image1.jpg
├── image2.png
└── image3.webp
        ↓ (click Run Batch)
        ↓
OUTPUT/
├── 1920x1080/
│   ├── center/
│   ├── top/
│   └── bottom/
├── 3840x2160/
│   ├── center/
│   ├── top/
│   └── bottom/
├── 800x450/
│   ├── center/
│   ├── top/
│   └── bottom/
└── ORIGINALS/
```

## Server Logs

Available in the **"Server Logs"** tab:
- Real-time processing messages
- Error messages in red
- Success confirmations
- Useful for troubleshooting batch operations
