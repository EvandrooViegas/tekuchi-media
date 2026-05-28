# Font Converter

## What It Does

The Font Converter transforms font files from OpenType or TrueType formats into multiple web-ready and desktop formats. It generates a ZIP file containing the same font in five different formats, allowing you to use the font across all platforms and browsers.

## What You Need

### Required
- **Font Files**: OpenType or TrueType fonts

### Supported Input Formats
- **.OTF** (OpenType Font)
- **.TTF** (TrueType Font)

### Output Formats Provided
- **TTF** - TrueType format (standard desktop fonts)
- **WOFF** - Web Open Font Format (compressed web version)
- **WOFF2** - Web Open Font Format 2 (Brotli-compressed, modern)
- **SVG** - Scalable Vector Graphics (legacy iOS support)
- **EOT** - Embedded OpenType (IE ≤ 8 legacy support)

## How to Use

### Step 1: Drop Fonts
1. Go to `/font-converter`
2. Click or drag your font files into the drop zone
3. You can drop multiple fonts at once
4. File names appear in the queue list below the drop zone

### Step 2: Review Queue
The queue shows:
- **File Name**: Font file being converted
- **Status Badge**: Shows current state
  - Gray "Ready to convert" - Pending
  - Blue spinning loader - Currently converting
  - Green checkmark - Conversion complete
  - Red X - Conversion failed
- **Format Badges**: Successfully converted formats (colored by type)

### Step 3: Convert
1. The **"Convert X font(s)"** button appears when fonts are queued
2. Click to start conversion
3. Button changes to "Converting..." with spinner during processing
4. Conversion typically takes 5-30 seconds per font

### Step 4: Download Results
1. Upon completion, a green **"Download ZIP"** button appears
2. Click to download `{fontname}_fonts.zip`
3. ZIP file contains all 5 format variants

### Step 5: Manage Queue
- **Remove Individual Font**: Click X button on any card
- **Clear All**: Click "Clear All" button in top-right to remove all fonts
- Removing fonts immediately clears them from the list

## Expected Input & Output

### Input Format
```
Font File: .OTF or .TTF
File Size: Typically 50KB - 5MB
Multiple Fonts: Yes, all converted in batch
```

### Output Format
```
Format: ZIP archive containing:
  ├── fontname.ttf
  ├── fontname.woff
  ├── fontname.woff2
  ├── fontname.svg
  └── fontname.eot

Naming Convention: {original-filename}_fonts.zip
```

### Format Legend

| Format | Usage | Browser Support | File Size |
|--------|-------|-----------------|-----------|
| **TTF** | TrueType / OpenType | Desktop, legacy | Largest |
| **WOFF** | Web Open Font (compressed) | All modern browsers | Medium |
| **WOFF2** | Web Open Font 2 (Brotli) | Modern browsers, 80%+ coverage | Smallest |
| **SVG** | Scalable Vector Graphics | Legacy iOS Safari | Medium |
| **EOT** | Embedded OpenType | Internet Explorer ≤ 8 | Medium |

## Web Usage Example

```css
@font-face {
  font-family: 'CustomFont';
  src: url('font.eot'); /* IE 9 */
  src: url('font.eot?#iefix') format('embedded-opentype'), /* IE 6-8 */
       url('font.woff2') format('woff2'), /* Modern browsers */
       url('font.woff') format('woff'), /* Older browsers */
       url('font.ttf') format('truetype'), /* Safari, Android */
       url('font.svg#font') format('svg'); /* Legacy iOS */
}
```

## Tips & Tricks

1. **Multiple Fonts**: Drop multiple fonts to convert them all at once
2. **Batch Efficiency**: Converting 5+ fonts takes only slightly longer than 1
3. **Format Selection**: For web, typically only WOFF2 and WOFF are needed
4. **Variable Fonts**: Some variable fonts convert to all 5 formats
5. **Font Licensing**: Verify font is allowed to be converted before redistributing

## Limitations

- Only OTF and TTF input formats supported
- Variable fonts may not convert to all 5 formats (check status badges)
- Some fonts with complex features may fail conversion
- Encrypted or DRM-protected fonts cannot be converted
- Very large fonts (>10MB) may fail or timeout
- Output files maintain original font metrics and kerning

## Common Use Cases

- **Web Development**: Convert fonts for website use
- **Multi-Platform Support**: Prepare fonts for desktop, web, and mobile
- **Legacy Browser Support**: Generate EOT for old IE versions
- **Font Distribution**: Create universal font package for teams
- **Backup Formats**: Maintain multiple format copies for flexibility
- **Mobile Apps**: Prepare fonts for iOS and Android applications

## File Size Comparison

For typical font file:
- **Original TTF**: 100 KB
- **WOFF**: 45 KB (55% reduction)
- **WOFF2**: 35 KB (65% reduction)
- **SVG**: 80 KB (20% increase - vector format)
- **EOT**: 50 KB (50% reduction)

**Recommendation**: Use WOFF2 as primary with WOFF fallback for 99% browser coverage.
