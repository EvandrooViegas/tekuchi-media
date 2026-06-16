# PDF Thumbnailer

## What It Does

The PDF Thumbnailer extracts the first page of PDF documents and converts them to high-resolution JPEG thumbnails. It's ideal for creating book covers, document previews, or visual galleries from PDF files. All thumbnails are generated in a 3:4 aspect ratio (book cover proportions).

## What You Need

### Required
- **PDF Files**: One or multiple PDF documents

### Requirements
- PDF files must be readable and not password-protected
- First page will be extracted (must exist)
- Any file size supported

## How to Use

### Step 1: Upload PDFs
1. Go to `/thumbnailer`
2. Click or drag PDF files into the drop zone
3. Upload area shows:
   - Upload icon and "Drop PDFs here" text
   - "Select one or multiple documents" subtitle
4. Multiple files can be added in one operation
5. File name displays in the upload area

### Step 2: Processing
1. System begins processing immediately after file(s) selected
2. Spinner icon shows "Processing Files..." state
3. Conversion typically takes 2-10 seconds per file
4. Processing happens automatically (no additional button needed)

### Step 3: View Results
1. **"Recent Generations"** section populates below upload area
2. Results display in a responsive grid layout:
   - Mobile: 1 column
   - Tablet: 2 columns
   - Desktop: 3 columns
3. Each thumbnail card shows:
   - High-resolution JPEG preview
   - Green "READY" badge in top-right
   - PDF filename
   - Generation timestamp (HH:MM format)
   - Download button

### Step 4: Download
1. Click the **download icon** (↓) on any thumbnail card
2. File downloads to your computer
3. Filename format: `thumb_{cleaned-filename}.jpg`
4. Examples:
   - Input: `annual-report.pdf` → Output: `thumb_annual-report.jpg`
   - Input: `Book 2024!.pdf` → Output: `thumb_book_2024.jpg`

### Step 5: Clear History (Optional)
1. Click **"Clear All"** button (top-right, red button)
2. Confirm clearing all thumbnails
3. Recent generations list clears
4. Upload area returns to empty state

## Expected Input & Output

### Input Format
```
PDF Files: Standard PDF format
├── Any size (typically 1MB - 500MB)
├── Single or multiple files
└── First page must be readable

File Naming: Any name with .pdf extension
Examples:
├── document.pdf
├── Annual-Report-2024.pdf
└── Book Chapter_1.pdf
```

### Output Format
```
Format: JPEG image file
Aspect Ratio: 3:4 (book cover proportions)
Resolution: High-resolution suitable for galleries
File Size: Typically 50KB - 500KB per thumbnail

Naming Convention: thumb_{cleaned-filename}.jpg
├── Special characters replaced with underscores
├── .pdf extension removed
└── Example: "Annual Report 2024!.pdf" → "thumb_annual_report_2024.jpg"
```

### Image Specifications

| Property | Value |
|----------|-------|
| Format | JPEG |
| Aspect Ratio | 3:4 (portrait/book cover) |
| Quality | High resolution |
| Color Space | RGB |
| Source | First page of PDF only |

## Grid Display

### Single Card Contains
1. **Image Preview** (3:4 aspect ratio)
2. **"READY" Badge** (top-right corner, green)
3. **Filename** (truncated if long, shows full name on hover)
4. **Timestamp** (generation time in local time)
5. **Download Button** (bottom-right, opens download)

## Naming Logic

The system cleans filenames as follows:
```
Input:  "My Document's File (2024!).pdf"
         ↓ (convert to lowercase)
         ↓ (replace special chars with underscore)
         ↓ (remove .pdf extension)
Output: "thumb_my_document_s_file_2024.jpg"
```

## Tips & Tricks

1. **Batch Upload**: Drop multiple PDFs at once for faster processing
2. **Quick Redownload**: History persists until page refresh
3. **Mobile Friendly**: Grid layout adapts to any screen size
4. **High Quality**: Thumbnails are high-resolution, suitable for print
5. **Aspect Ratio**: 3:4 ratio matches standard book cover dimensions
6. **Fast Processing**: Most PDFs process in under 5 seconds

## Limitations

- Only first page is extracted (multi-page PDFs: only cover)
- Password-protected or encrypted PDFs cannot be processed
- Scanned PDFs (image-only) work but may have lower quality
- Very large PDFs (>500MB) may take longer to process
- Malformed PDFs may fail to process
- Special fonts in PDFs may not render perfectly

## Common Use Cases

- **Book Library**: Create covers for book catalog
- **Document Gallery**: Generate previews for document management
- **E-Reader Store**: Create thumbnail images for book sales sites
- **Legal Archives**: Quick visual reference for legal documents
- **Report Previews**: Visual summaries for report management system
- **Content Management**: Automated thumbnail generation for CMS
- **Portfolio Building**: Create visual gallery from PDF portfolio pieces

## File Size Considerations

### Typical Output Sizes
- Simple text PDF: 50-100 KB
- PDF with images: 200-500 KB
- High-quality graphics: 300-800 KB
- Scanned documents: 100-400 KB

### Total Batch Examples
- 10 documents: ~300KB total
- 50 documents: ~1.5MB total
- 100 documents: ~3MB total

## Workflow Examples

### Example 1: Book Cover Gallery
```
1. Upload 20 PDF book files
2. All processed automatically
3. Download all thumbnails
4. Use for bookstore website
```

### Example 2: Legal Document Archive
```
1. Drop contract PDFs
2. Generate cover thumbnails
3. Store with document index
4. Quick visual document lookup
```

### Example 3: Report Management
```
1. Process monthly reports (50 PDFs)
2. Create visual reference gallery
3. Archive with timestamp
4. Quick report identification
```

## Troubleshooting

### "Failed to generate thumbnail"
- PDF may be encrypted or corrupted
- Check if PDF opens in your PDF reader
- Try regenerating

### Thumbnail looks blurry
- Some scanned PDFs have inherently low resolution
- This reflects the original PDF quality
- Use high-resolution PDF sources for best results

### No download link appears
- Check browser console for errors
- Try refreshing the page
- Attempt upload again

### Processing takes too long
- Large PDFs (>100MB) may take 30+ seconds
- Check internet connection
- Try smaller PDFs first

## Browser Compatibility

Works on all modern browsers:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile browsers (iOS Safari, Chrome Mobile)

## Storage & History

- Thumbnails stored as Base64 in browser memory
- History clears when page refreshes
- Download to save permanently
- No automatic deletion (manual clear only)
