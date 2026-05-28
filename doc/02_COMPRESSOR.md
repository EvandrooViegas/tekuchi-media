# Media Compressor

## What It Does

The Media Compressor reduces file sizes for images, videos, and PDFs while maintaining visual quality. It supports batch processing with automatic compression detection, showing before/after file sizes and compression percentages for each file.

## What You Need

### Required
- **Media Files**: Images, videos, or PDFs to compress
- The compressor automatically detects file type and applies optimal compression

### Supported Formats

**Images**
- JPEG (.jpg, .jpeg)
- PNG (.png)
- WebP (.webp)

**Videos**
- MP4 (.mp4)
- MOV (.mov)
- AVI (.avi)
- MKV (.mkv)

**Documents**
- PDF (.pdf)

## How to Use

### Step 1: Upload Area
1. Go to `/compressor`
2. Click or drag files into the **Upload Area** (left panel)
3. Multiple files can be added at once
4. Files appear in the upload queue list
5. Click the **X** to remove individual files

### Step 2: Upload Files
1. Click **"Upload Pending Files"** button
2. Progress bars show upload status for each file
3. Status changes from "pending" → "uploading" → "success"
4. Wait for all uploads to complete

### Step 3: Process Files
1. Click **"Run Converter"** button
2. The Python compression engine processes files
3. A loading spinner shows processing is active
4. Processing typically takes seconds to minutes depending on file size

### Step 4: View Results
1. Processed files appear in the **Processed Files** table
2. View compression statistics:
   - **Original Size**: Starting file size in MB/KB
   - **Final Size**: Compressed file size in MB/KB
   - **Reduction %**: Percentage reduction (shown in green if reduced)
   - **Status**: Success, Already Optimal, or Error
3. Multiple output formats shown for each input file

### Step 5: Download
1. Each file shows output blocks with:
   - File format label (JPG, MP4, PDF, etc.)
   - Thumbnail/preview of the output
   - **DL** button to download individual file
2. Click **Download** to save to your computer

### Live Monitoring
1. **Live Terminal** tab shows real-time compression logs
2. Watch processing details as files are compressed
3. Errors or warnings appear in red text

## Expected Input & Output

### Input Format
```
File Types: JPG, PNG, WebP, MP4, MOV, AVI, MKV, PDF
Maximum File Size: Typically up to 2GB per file
Multiple Files: Yes, batch processing supported
```

### Output Format
```
Format: Original format (auto-detected)
Size: Reduced by 20-80% depending on file type
Quality: Maintained at high visual quality
Naming: Original filename with format preserved
```

### Compression Statistics

#### Images
- JPEG: 30-50% reduction (quality maintained)
- PNG: 20-40% reduction (lossless)
- WebP: 50-70% reduction (modern format)

#### Videos
- MP4/MOV: 40-60% reduction (H.264/H.265 codec)
- Quality: Maintained at 1080p or higher

#### PDFs
- Typical: 30-50% reduction
- Quality: Text and images preserved

## Workflow

```
1. Add Files → 2. Upload → 3. Run Converter → 4. View Results → 5. Download
```

### Queue Management
- **On Queue**: File waiting to be processed
- **Processing**: File currently being compressed
- **Success**: File successfully compressed
- **Already Optimal**: File is already optimal size, original kept
- **Error**: Compression failed, check error message

## Tips & Tricks

1. **Batch Processing**: Upload multiple files at once for faster workflow
2. **Resubmit**: After processing, you can add more files and run again
3. **File Viewing**: Hover over output files to see preview
4. **Gallery View**: Videos with thumbnails show "View Gallery" button
5. **Clear History**: All processed files remain visible until page refresh
6. **Terminal Logs**: Check Live Terminal tab for detailed processing info

## Limitations

- Very small files (< 50KB) may not compress further
- Encrypted/protected files cannot be processed
- Unusual or corrupted files may fail compression
- Video codec support depends on server configuration
- Maximum concurrent files: Typically 5-10 files at once

## Common Use Cases

- **Web Optimization**: Reduce image sizes for faster website loading
- **Email Attachments**: Compress files to fit email size limits
- **Cloud Storage**: Reduce storage space usage
- **Video Distribution**: Compress video for easier sharing
- **Document Archiving**: Reduce PDF file sizes for archival
- **Batch Processing**: Compress entire folders of media
