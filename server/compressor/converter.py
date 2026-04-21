# -*- coding: utf-8 -*-
import sys, json, shutil, argparse, subprocess, time, logging, configparser
from functools import lru_cache
from pathlib import Path
from datetime import datetime, timedelta

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR  = Path(__file__).parent
CONFIG_FILE = SCRIPT_DIR.parent.parent / "config.ini"
LOG_FILE    = SCRIPT_DIR / "log.json"
LOG_TEXT    = SCRIPT_DIR / "converter.log"
CANCEL_FILE = SCRIPT_DIR / "cancel_requests.txt"

def load_config():
    if not CONFIG_FILE.exists():
        sys.exit(1)
    cfg = configparser.ConfigParser()
    cfg.read(str(CONFIG_FILE), encoding="utf-8")
    return cfg

def resolve_path(raw):
    p = Path(raw.strip())
    return p if p.is_absolute() else SCRIPT_DIR / p

_cfg = load_config()
INBOX_DIR      = resolve_path(_cfg.get("paths", "inbox",      fallback="TODO"))
PROCESSING_DIR = resolve_path(_cfg.get("paths", "processing", fallback="processing"))
CONVERTED_DIR  = resolve_path(_cfg.get("paths", "converted",  fallback="Processed"))
ARCHIVE_DIR    = resolve_path(_cfg.get("paths", "archive",    fallback="Processed_Sources"))
TEMP_DIR       = resolve_path(_cfg.get("paths", "temp",       fallback=".tmp"))

IMAGE_TARGET_H   = _cfg.getint("images",  "target_height", fallback=1080)
VIDEO_MAX_W      = _cfg.getint("video",   "max_width",     fallback=1920)
VIDEO_MAX_H      = _cfg.getint("video",   "max_height",    fallback=1080)
MIN_FILE_AGE_S   = _cfg.getint("general", "min_file_age_s", fallback=5)
DEFAULT_INTERVAL = _cfg.getint("general", "interval",       fallback=900)
LOG_RETENTION_DAYS = 3

VIDEO_EXTS = {".mov", ".mp4", ".avi", ".mkv", ".m4v"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tiff", ".tif", ".bmp", ".webp", ".heic", ".heif"}
PDF_EXTS   = {".pdf"}
ALL_EXTS   = VIDEO_EXTS | IMAGE_EXTS | PDF_EXTS

# ── FFmpeg Settings (Balanced Speed & Quality) ────────────────────────────────
MP4_OPTS_VIDEO = [
    "-vf", f"scale={VIDEO_MAX_W}:{VIDEO_MAX_H}:force_original_aspect_ratio=decrease,pad={VIDEO_MAX_W}:{VIDEO_MAX_H}:(ow-iw)/2:(oh-ih)/2",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-b:v", "2M",
    "-movflags", "+faststart", "-pix_fmt", "yuv420p",
]
MP4_OPTS_AUDIO = ["-c:a", "aac", "-b:a", "192k"]

WEBM_OPTS_VIDEO = [
    "-vf", f"scale={VIDEO_MAX_W}:{VIDEO_MAX_H}:force_original_aspect_ratio=decrease,pad={VIDEO_MAX_W}:{VIDEO_MAX_H}:(ow-iw)/2:(oh-ih)/2",
    "-c:v", "libvpx-vp9", "-crf", "35", "-b:v", "0", 
    "-quality", "realtime", "-speed", "5", "-row-mt", "1",
]
WEBM_OPTS_AUDIO = ["-c:a", "libopus", "-b:a", "128k"]

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s %(message)s", datefmt="%Y-%m-%d %H:%M",
                    handlers=[logging.FileHandler(str(LOG_TEXT), encoding="utf-8"), logging.StreamHandler(sys.stdout)])
log = logging.getLogger(__name__)

# ── Maintenance & Logs ────────────────────────────────────────────────────────
def trim_logs():
    """Restored from original: Keeps logs from last 3 days."""
    try:
        cutoff = (datetime.now() - timedelta(days=LOG_RETENTION_DAYS)).isoformat()
        data = load_log()
        data["jobs"] = [j for j in data["jobs"] if j.get("timestamp", "") >= cutoff]
        save_log(data)
        
        if LOG_TEXT.exists():
            cutoff_dt = datetime.now() - timedelta(days=LOG_RETENTION_DAYS)
            lines = LOG_TEXT.read_text(encoding="utf-8").splitlines(keepends=True)
            kept = [l for l in lines if len(l) < 16 or datetime.strptime(l[:16], "%Y-%m-%d %H:%M") >= cutoff_dt]
            LOG_TEXT.write_text("".join(kept), encoding="utf-8")
    except: pass

def load_log():
    if LOG_FILE.exists():
        try: return json.loads(LOG_FILE.read_text(encoding="utf-8"))
        except: pass
    return {"jobs": []}

def save_log(data):
    tmp = LOG_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2), encoding="utf-8")
    tmp.replace(LOG_FILE)

def append_job(filename, kind, status, outputs=None, error=None, duration_s=None, extra=None):
    data = load_log()
    now = datetime.now().isoformat()
    clean_name = Path(filename).name.strip()
    target_idx = -1
    for i in range(len(data["jobs"])-1, -1, -1):
        if Path(data["jobs"][i]["file"]).name.strip() == clean_name:
            if data["jobs"][i]["status"] not in ("success", "error", "Cancelled by user"):
                target_idx = i
            break
    if target_idx >= 0:
        job = data["jobs"][target_idx]
        job.update({"status": status, "timestamp": now, "outputs": outputs or job.get("outputs", []), "error": error})
        if duration_s: job["duration_s"] = round(duration_s, 1)
        if extra: job.update(extra)
    else:
        entry = {"file": clean_name, "kind": kind, "status": status, "timestamp": now, "outputs": outputs or [], "error": error}
        if duration_s: entry["duration_s"] = round(duration_s, 1)
        if extra: entry.update(extra)
        data["jobs"].append(entry)
    save_log(data)

# ── Core Engine ───────────────────────────────────────────────────────────────
def run_cmd(cmd, job_name=None):
    """Deadlock-proof runner: captures info commands, silences heavy encodes."""
    kwargs = {"creationflags": 0x08000000} if sys.platform == "win32" else {}
    if job_name is None:
        result = subprocess.run(cmd, capture_output=True, text=True, **kwargs)
        if result.returncode != 0: raise RuntimeError(result.stderr[-1000:])
        return result.stdout
    else:
        p = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, **kwargs)
        while p.poll() is None:
            time.sleep(1)
            if Path(CANCEL_FILE).exists() and job_name in Path(CANCEL_FILE).read_text():
                p.kill(); raise RuntimeError("Cancelled by user")
        if p.returncode != 0: raise RuntimeError("Process failed")
        return ""
@lru_cache(maxsize=1)
def ffmpeg_bin():
    # We point directly to your C drive installation first
    paths = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        "ffmpeg" # fall back to system path
    ]
    for p in paths:
        if Path(p).exists() or shutil.which(p):
            return p
    raise FileNotFoundError("ffmpeg.exe not found. Check C:\\ffmpeg\\bin\\")

@lru_cache(maxsize=1)
def ffprobe_bin():
    # Usually in the same folder as ffmpeg
    p = Path(ffmpeg_bin()).with_name("ffprobe.exe")
    if p.exists():
        return str(p)
    return "ffprobe"

@lru_cache(maxsize=1)
def ghostscript_bin():
    # Use the version you have (10.07.0)
    paths = [
        r"C:\Program Files\gs\gs10.07.0\bin\gswin64c.exe",
        r"C:\Program Files\gs\gs10.04.0\bin\gswin64c.exe",
        "gswin64c"
    ]
    for p in paths:
        if Path(p).exists() or shutil.which(p):
            return p
    raise FileNotFoundError("Ghostscript not found.")
# ── Processors ────────────────────────────────────────────────────────────────
def extract_thumbnails(src, out_dir, stem):
    """Restored: Extracts 10 JPG thumbnails."""
    gen = []
    for i in range(2, 12):
        out = out_dir / f"{stem}_thumb_{i:02d}s.jpg"
        try:
            run_cmd([ffmpeg_bin(), "-y", "-ss", str(i), "-i", str(src), "-vframes", "1", 
                     "-vf", f"scale={VIDEO_MAX_W}:{VIDEO_MAX_H}:force_original_aspect_ratio=decrease,pad={VIDEO_MAX_W}:{VIDEO_MAX_H}:(ow-iw)/2:(oh-ih)/2",
                     "-q:v", "2", str(out)])
            gen.append(out)
        except: pass
    return gen

def process_video(src):
    subdir = relative_subdir(src, PROCESSING_DIR)
    stem = src.stem
    t = datetime.now().strftime("%Y%m%d_%H%M%S")
    job_name = str(subdir / src.name)
    
    log.info("[VIDEO] %s", src.name)
    t0 = time.time()
    
    # 1. Track original size
    orig_kb = src.stat().st_size // 1024

    with TempWorkspace(src, subdir) as ws:
        mp4_tmp = ws.path / f"{stem}_{t}.mp4"
        webm_tmp = ws.path / f"{stem}_{t}.webm"
        
        try:
            # 2. Encode MP4
            append_job(job_name, "video", "Encoding MP4...")
            audio = "audio" in run_cmd([ffprobe_bin(), "-i", str(src), "-show_streams", "-select_streams", "a", "-loglevel", "error"])
            run_cmd([ffmpeg_bin(), "-y", "-i", str(src)] + MP4_OPTS_VIDEO + (MP4_OPTS_AUDIO if audio else ["-an"]) + [str(mp4_tmp)], job_name)
            
            # 3. Encode WebM
            append_job(job_name, "video", "Encoding WebM...")
            run_cmd([ffmpeg_bin(), "-y", "-i", str(src)] + WEBM_OPTS_VIDEO + (WEBM_OPTS_AUDIO if audio else ["-an"]) + [str(webm_tmp)], job_name)
            
            # 4. Generate Thumbnails
            append_job(job_name, "video", "Generating Thumbnails...")
            thumbs = extract_thumbnails(src, ws.path, stem)
            
            # 5. NEW: Safely calculate final size only if files exist
            final_kb = 0
            if mp4_tmp.exists():
                final_kb += mp4_tmp.stat().st_size // 1024
            if webm_tmp.exists():
                final_kb += webm_tmp.stat().st_size // 1024
            
            # 6. Commit and Archive
            final = ws.commit([mp4_tmp, webm_tmp] + thumbs)
            _archive(src)
            
            dur = time.time() - t0
            append_job(
                job_name, 
                "video", 
                "success", 
                outputs=[str(f.relative_to(CONVERTED_DIR)) for f in final], 
                duration_s=dur,
                extra={
                    "orig_kb": orig_kb, 
                    "final_kb": final_kb,
                    "thumb_count": len(thumbs)
                }
            )
            log.info("  Done in %.1fs (%dKB -> %dKB)", dur, orig_kb, final_kb)
            
        except Exception as e:
            dur = time.time() - t0
            append_job(job_name, "video", "error", error=str(e), duration_s=dur)
            log.error("  FAILED: %s", e)

def process_image(src):
    subdir = relative_subdir(src, PROCESSING_DIR); stem = src.stem; t = datetime.now().strftime("%Y%m%d_%H%M%S")
    job_name = str(subdir / src.name); log.info("[IMAGE] %s", src.name); t0 = time.time()
    orig_kb = src.stat().st_size // 1024

    with TempWorkspace(src, subdir) as ws:
        try:
            append_job(job_name, "image", "Processing...")
            dim = run_cmd([ffprobe_bin(), "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", str(src)])
            w, h = map(int, dim.strip().split(","))
            
            is_png = src.suffix.lower() == ".png"
            out_tmp = ws.path / f"{stem[:30]}_{t}{'.png' if is_png else '.jpg'}" # Shorten output name too

            # If image is ALREADY target size or smaller, don't upscale/resize
            if h <= IMAGE_TARGET_H:
                shutil.copy2(str(src), str(out_tmp))
            else:
                scale = IMAGE_TARGET_H / h
                new_w = int(w * scale); new_w -= new_w % 2
                run_cmd([ffmpeg_bin(), "-y", "-i", str(src), "-vf", f"scale={new_w}:{IMAGE_TARGET_H}", "-q:v", "2", str(out_tmp)], job_name)
            
            # Pillow Deep Compression (Works for AVIF if Pillow is updated)
            try:
                from PIL import Image
                img = Image.open(str(out_tmp))
                if is_png: img.save(str(out_tmp), optimize=True, compress_level=9)
                else: img.convert("RGB").save(str(out_tmp), quality=92, optimize=True)
            except: pass

            # Smart Overwrite
            final_size = out_tmp.stat().st_size
            status_msg = "success"
            if final_size >= src.stat().st_size:
                out_tmp.unlink(); shutil.copy2(str(src), str(out_tmp))
                final_kb = orig_kb; status_msg = "Original kept (optimal)"
            else:
                final_kb = final_size // 1024

            final = ws.commit([out_tmp]); _archive(src); dur = time.time() - t0
            append_job(job_name, "image", status_msg, outputs=[str(f.relative_to(CONVERTED_DIR)) for f in final], duration_s=dur, extra={"orig_kb": orig_kb, "final_kb": final_kb})
        except Exception as e:
            append_job(job_name, "image", "error", error=str(e))
def process_pdf(src):
    subdir = relative_subdir(src, PROCESSING_DIR)
    stem = src.stem
    t = ts() # Now works because of the helper above
    job_name = str(subdir / src.name)
    
    log.info("[PDF]   %s", src.name)
    t0 = time.time()
    orig_kb = src.stat().st_size // 1024

    with TempWorkspace(src, subdir) as ws:
        out_tmp = ws.path / f"{stem}_{t}.pdf"
        try:
            append_job(job_name, "pdf", "Optimizing...")
            
            # Full Ghostscript Command for maximum compression
            run_cmd([
                ghostscript_bin(), 
                "-sDEVICE=pdfwrite", 
                "-dCompatibilityLevel=1.5", 
                "-dNOPAUSE", "-dQUIET", "-dBATCH",
                "-dColorImageResolution=150", 
                "-dGrayImageResolution=150", 
                "-dMonoImageResolution=150",
                "-dDownsampleColorImages=true", 
                "-dDownsampleGrayImages=true", 
                "-dDownsampleMonoImages=true",
                "-dColorImageDownsampleType=/Average", 
                "-dGrayImageDownsampleType=/Average",
                "-dAutoFilterColorImages=false", 
                "-dColorImageFilter=/DCTEncode", 
                "-dEmbedAllFonts=true",
                "-dSubsetFonts=true", 
                "-dCompressFonts=true", 
                "-dFastWebView=true", 
                "-sOutputFile=" + str(out_tmp), 
                str(src)
            ], job_name)

            # Smart Overwrite Logic
            final_size = out_tmp.stat().st_size
            status_msg = "success"
            
            if final_size >= src.stat().st_size:
                out_tmp.unlink()
                shutil.copy2(str(src), str(out_tmp))
                final_kb = orig_kb
                status_msg = "Original kept (optimal)"
            else:
                final_kb = final_size // 1024

            final = ws.commit([out_tmp])
            _archive(src)
            dur = time.time() - t0
            
            append_job(
                job_name, 
                "pdf", 
                status_msg, 
                outputs=[str(f.relative_to(CONVERTED_DIR)) for f in final], 
                duration_s=dur, 
                extra={"orig_kb": orig_kb, "final_kb": final_kb}
            )
            log.info("  Done in %.1fs (%dKB -> %dKB)", dur, orig_kb, final_kb)
            
        except Exception as e:
            append_job(job_name, "pdf", "error", error=str(e))
            log.error("  FAILED: %s", e)
# ── Filesystem Helpers ────────────────────────────────────────────────────────
def ts():
    return datetime.now().strftime("%Y%m%d_%H%M%S")
def relative_subdir(p, root): return p.parent.relative_to(root)
def mirror_dir(subdir, root): d = root / subdir; d.mkdir(parents=True, exist_ok=True); return d
def prune_empty_dirs(root):
    for d in sorted(root.rglob("*"), reverse=True):
        if d.is_dir() and d != root:
            try: d.rmdir()
            except: pass

class TempWorkspace:
    def __init__(self, src, subdir):
        self.src = src
        self.subdir = subdir
        # Limit folder name to 20 chars + timestamp to prevent WinError 3
        short_name = src.stem[:20] 
        self.path = TEMP_DIR / f"{short_name}_{int(time.time())}"
        self.com = False

    def __enter__(self): 
        self.path.mkdir(parents=True, exist_ok=True)
        return self

    def __exit__(self, t, v, b): 
        if not self.com: 
            shutil.rmtree(str(self.path), ignore_errors=True)

    def commit(self, files):
        out = mirror_dir(self.subdir, CONVERTED_DIR)
        res = []
        for f in files:
            target = out / f.name
            if target.exists(): 
                target = out / f"{f.stem}_{int(time.time())}{f.suffix}"
            shutil.move(str(f), str(target))
            res.append(target)
        self.com = True 
        return res
def _archive(src):
    out = mirror_dir(relative_subdir(src, PROCESSING_DIR), ARCHIVE_DIR)
    target = out / src.name
    if target.exists(): target = out / f"{src.stem}_{int(time.time())}{src.suffix}"
    shutil.move(str(src), str(target)); prune_empty_dirs(PROCESSING_DIR)

# ── Main Loop ─────────────────────────────────────────────────────────────────
def run_once():
    if CANCEL_FILE.exists(): CANCEL_FILE.write_text("")
    files = [f for f in INBOX_DIR.rglob("*") if f.is_file() and f.suffix.lower() in ALL_EXTS and (time.time()-f.stat().st_mtime)>MIN_FILE_AGE_S]
    if not files: return
    for f in files:
        kind = "video" if f.suffix.lower() in VIDEO_EXTS else "image" if f.suffix.lower() in IMAGE_EXTS else "pdf"
        target = mirror_dir(relative_subdir(f, INBOX_DIR), PROCESSING_DIR) / f.name
        if not target.exists():
            shutil.move(str(f), str(target)); prune_empty_dirs(INBOX_DIR)
            if kind == "video": process_video(target)
            elif kind == "image": process_image(target)
            else: process_pdf(target)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--watch", action="store_true"); args = parser.parse_args()
    for d in [INBOX_DIR, PROCESSING_DIR, CONVERTED_DIR, ARCHIVE_DIR, TEMP_DIR]: d.mkdir(parents=True, exist_ok=True)
    log.info("Converter Active. Inbox: %s", INBOX_DIR)
    if args.watch:
        while True: trim_logs(); run_once(); time.sleep(DEFAULT_INTERVAL)
    else: trim_logs(); run_once()