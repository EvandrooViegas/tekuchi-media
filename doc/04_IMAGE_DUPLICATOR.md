# Image Duplicator

## What It Does

The Image Duplicator creates multiple copies of image files based on mappings defined in a CSV file. It's ideal for workflows where you need one image file to be referenced by multiple IDs, automatically preserving the original file extension for each copy.

## What You Need

### Required
1. **CSV Mapping File**: Text file with duplication instructions
2. **Original Images**: Image files to be duplicated

### Supported Image Formats
- Any standard image format supported (JPG, PNG, GIF, WebP, BMP, etc.)
- Files keep their original extension in the output

## CSV Format

### File Structure
```
original_id, copy_id
1,7
1,8
2,4
3,5
3,6
```

### Rules
- First column: ID of the original image file
- Second column: ID for the copy (new filename)
- One mapping per line
- CSV header: `original_id, copy_id`
- Spacing around commas is okay
- Original file should be named: `{original_id}.ext` (e.g., `1.jpg`)
- Copy will be created as: `{copy_id}.ext` (e.g., `7.jpg`)

### Examples

**Input CSV:**
```
1,7
2,4
3,5
3,6
```

**Files Uploaded:**
- 1.jpg
- 2.jpg
- 3.jpg

**Output (ZIP contains):**
- 7.jpg (copy of 1.jpg)
- 4.jpg (copy of 2.jpg)
- 5.jpg (copy of 3.jpg)
- 6.jpg (copy of 3.jpg)

## How to Use

### Step 1: Prepare CSV File
1. Create a text file or use spreadsheet (Excel, Google Sheets)
2. Add two columns: `original_id, copy_id`
3. List each duplication mapping on a new line
4. Save as `.csv` file

### Step 2: Upload CSV
1. Go to `/image-duplicator`
2. In section **"1. Upload CSV File"**
3. Click or drag your CSV file into the upload area
4. File name appears below the upload area
5. Blue information box shows the expected CSV format

### Step 3: Upload Images
1. In section **"2. Upload Original Images"**
2. Click or drag your image files into the upload area
3. Multiple images can be added at once
4. Images appear in the scrollable list below
5. Remove individual images with the "Remove" button

### Step 4: Review Summary
1. Right side panel shows "Summary"
2. Displays selected CSV filename
3. Shows number of images uploaded
4. Badge shows "Ready" (green) or "Incomplete" (gray)
5. All inputs must be complete before processing

### Step 5: Process
1. Click **"Process & Duplicate Images"** button
2. Processing status shows with spinner
3. Wait for completion message

### Step 6: View Results
1. Processing complete screen shows statistics:
   - **Total Mappings**: All copy instructions in CSV
   - **Successful**: Number of successfully created copies
   - **Failed**: Number of failed copies with reasons
2. Color-coded boxes show success/failure breakdown
3. **Red alert box** (if any failures) lists all failures
4. Detailed results table shows row-by-row status

### Step 7: Download
1. Click **"Download Results (ZIP)"** button
2. ZIP file contains all successfully created copies
3. File named: `duplicated-images.zip`

### Start Over
1. Click **"Start Over"** button to clear results
2. Process new files or retry with fixes

## Expected Input & Output

### Input Format
```
CSV File: original_id, copy_id
├── Header row (optional)
├── 1,7
├── 2,4
└── ...

Image Files: Any format, named as {id}.ext
├── 1.jpg
├── 2.jpg
└── 3.png
```

### Output Format
```
ZIP Archive: duplicated-images.zip
├── 7.jpg (copy of 1.jpg)
├── 4.jpg (copy of 2.jpg)
├── 5.jpg (copy of 3.png - extension preserved!)
└── ...
```

## Result Messages

| Status | Meaning |
|--------|---------|
| **Success** | Copy created successfully with original extension preserved |
| **Missing** | Original ID not found in uploaded images |
| **Error** | Error occurred during duplication process |

## Tips & Tricks

1. **Excel Compatibility**: Save Excel files as CSV (File → Save As → CSV)
2. **Extension Preservation**: Original extension automatically applied to all copies
3. **Bulk Operations**: One CSV can reference multiple images multiple times
4. **Same File Multiple Copies**: One original ID can map to many copy IDs
5. **Large Batches**: Can handle hundreds of mappings in one batch
6. **Retry Failed**: Fix errors in CSV/images and retry failed mappings

## Limitations

- Original image must exist for duplication to succeed
- Original IDs must match uploaded filenames (exact match)
- Cannot create new image files, only duplicate existing ones
- Maximum file size depends on server configuration
- CSV must use Unix line endings (LF) for best compatibility
- Special characters in filenames should be avoided

## Common Use Cases

- **Product Galleries**: Same product image with different product IDs
- **Multi-Language Sites**: Share images across different language versions
- **Content Syndication**: Distribute same image to multiple partners
- **Database Updates**: Map images to multiple record IDs
- **Asset Management**: Create aliases for digital assets
- **Batch Attribution**: Apply same image to multiple items

## Troubleshooting

### "Original file missing for ID 5"
- Check that a file named `5.jpg` (or with original extension) is uploaded
- Filename must match original_id exactly
- Check for case sensitivity

### "CSV format error"
- Ensure two columns: `original_id, copy_id`
- Each row is one mapping
- No extra blank rows

### No download link appears
- Check "Failed" count - if non-zero, some copies didn't create
- Review the failure reasons in red box
- Fix issues and retry

## File Extension Handling

The system automatically:
1. Reads original file extension from input image
2. Preserves extension on all copies
3. Handles mixed extensions in batch (some JPG, some PNG)
4. Maintains file type integrity

**Example:** If `3.jpg` maps to copies `5` and `6`, both copies become `5.jpg` and `6.jpg`
