# PDF Comparer

## What It Does

The PDF Comparer analyzes two PDF documents side-by-side and identifies all differences between them. It detects text changes, image modifications, and formatting differences, then highlights them in an interactive list for easy navigation.

## What You Need

### Required
- **Document A (Original)**: Your baseline PDF file
- **Document B (Revised)**: The updated PDF file to compare against

### File Requirements
- Both files must be in PDF format (.pdf)
- File size: Typically handles files up to several hundred MB
- Documents can have any number of pages

## How to Use

### Step 1: Upload Documents
1. Go to `/comparer`
2. Click or drag your original PDF into the **"Original (A)"** upload area
3. Click or drag your revised PDF into the **"Revised (B)"** upload area
4. File names appear below each area when selected

### Step 2: Compare
1. Click the **"Compare & Navigate"** button
2. The system analyzes both documents
3. Results appear showing all detected changes

### Step 3: Review Changes
1. A sidebar lists all detected changes with types (text or image)
2. Changes are color-coded:
   - **Orange**: Text changes
   - **Purple**: Image changes
3. Click any change in the sidebar to jump to that page in both viewers
4. Both documents auto-scroll to the relevant page

### Step 4: Examine Results
1. Use the page navigation controls in each viewer
2. Left and right arrows move through pages
3. Direct page number input jumps to specific pages
4. Zoom controls adjust view size

## Expected Input & Output

### Input Format
```
Document A (PDF) + Document B (PDF)
→ Both files can be named anything
→ Any page count
→ Any content (text, images, mixed)
```

### Output Format
```json
{
  "changes": [
    {
      "type": "text",
      "section": "Página 1",
      "description": "Updated company name from 'Tekuchi' to 'Tekuchi Media'"
    },
    {
      "type": "image",
      "section": "Página 2",
      "description": "Logo image replaced with new version"
    }
  ]
}
```

## Expected Change Types

### Text Changes
- Modified text content
- Added or removed text
- Text formatting changes
- Font or size modifications

### Image Changes
- Added or removed images
- Image replacement
- Position changes
- Size modifications

## Tips & Tricks

1. **Large Documents**: For PDFs over 100 MB, comparison may take a few seconds
2. **Whitespace Matters**: Minor whitespace changes are detected (leading spaces, line breaks)
3. **Direct Navigation**: Click any change to jump directly to that section
4. **Full-Screen Mode**: Use browser full-screen for better viewing
5. **Printing**: Both viewers support PDF printing via browser print

## Limitations

- Cannot compare PDFs with encryption or password protection
- Very large documents (>500MB) may have performance issues
- Scanned PDFs (image-only) have limited text detection
- Some custom fonts may not be recognized properly

## Common Use Cases

- **Document Reviews**: Track changes in contracts or agreements
- **Version Control**: Compare document drafts across versions
- **Quality Assurance**: Verify published PDFs match originals
- **Legal Reviews**: Identify all modifications in legal documents
- **Report Updates**: See what changed between report versions
