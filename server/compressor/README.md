# media-converter

Drop files into TODO\ — videos, images, and PDFs are converted automatically.

```
TODO\                 <- drop files here (videos, images, PDFs, subfolders)
processing\           <- in-flight files (do not touch)
Processed\            <- converted outputs
Processed_Sources\    <- original files after conversion
.tmp\                 <- temporary workspace (auto-cleaned)
converter.py          <- the engine
config.ini            <- all settings (paths, quality, interval)
start-converter.bat   <- double-click to start manually
VideoConverter.xml    <- import into Task Scheduler for auto-start on login
dashboard.html        <- browser monitor (open with: python -m http.server 8080)
converter.log         <- plain text log
log.json              <- structured log (read by dashboard)
```

---

## Requirements

| Tool        | Install |
|-------------|---------|
| Python 3.8+ | https://python.org — check "Add to PATH" during install |
| Pillow      | `pip install Pillow` |
| FFmpeg      | https://www.gyan.dev/ffmpeg/builds/ → extract to C:\ffmpeg, add C:\ffmpeg\bin to PATH |
| Ghostscript | https://www.ghostscript.com/releases/gsdnld.html → install normally |

---

## config.ini

All settings live in config.ini. Edit this file — never edit converter.py directly.

```ini
[paths]
; Paths can be local or network (\\server\share\folder or \\192.168.1.10\share)
inbox      = TODO
processing = processing
converted  = Processed
archive    = Processed_Sources
temp       = .tmp

[images]
target_height = 1080   ; images are always scaled to this height, width is proportional

[video]
max_width  = 1920
max_height = 1080

[general]
min_file_age_s = 5     ; ignore files newer than this (prevents picking up mid-copy files)
interval       = 900   ; watch mode poll interval in seconds (900 = 15 min)
```

---

## What gets converted

| Input | Output |
|-------|--------|
| .mov, .mp4, .avi, .mkv, .m4v | .mp4 (H.264) + .webm (VP9) at 1920x1080 |
| .jpg, .jpeg, .png, .tiff, .bmp, .webp, .heic | resized to 1080px height + lossless compression |
| .pdf | optimised via Ghostscript (kept original if GS makes it larger) |

Subfolders are preserved — `TODO\wedding\clip.mov` → `Processed\wedding\clip_20250302.mp4`

---

## Auto-start on Windows login (recommended)

### Option A — Task Scheduler (silent, no window)
1. Edit `VideoConverter.xml` — update the path to match your folder
2. Open **Task Scheduler** → right panel → **Import Task...** → select `VideoConverter.xml` → OK

Verify it's running:
```
tasklist | findstr pythonw
```

### Option B — Startup folder (simpler)
1. Press `Win+R` → type `shell:startup` → Enter
2. Copy `start-converter.bat` into that folder

---

## Manual usage

```bat
cd C:\video-converter

python converter.py              # run once
python converter.py --watch      # watch mode (uses interval from config.ini)
python converter.py --recover    # return stuck files from processing\ to TODO\
```

---

## Dashboard

```bat
cd C:\video-converter
python -m http.server 8080
```
Open http://localhost:8080/dashboard.html — auto-refreshes every 30s.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `python not found` | Re-install Python, check "Add to PATH" |
| `ffmpeg not found` | Add `C:\ffmpeg\bin` to PATH, restart terminal |
| `Ghostscript not found` | Add `C:\Program Files\gs\gsX.X.X\bin` to PATH |
| Files not being picked up | Check `converter.log` — file may be too new (min_file_age_s) |
| Stuck files in processing\ | Run `python converter.py --recover` |
