# pip install fastapi uvicorn pymupdf opencv-python numpy python-multipart
from fastapi import FastAPI, UploadFile, File, Response
import fitz  # PyMuPDF
import cv2
import numpy as np
import base64
from typing import List, Dict
import configparser
import os
import shutil
import uuid
from datetime import datetime
from pathlib import Path

app = FastAPI()

# --- Load Shared Config ---
config = configparser.ConfigParser()

# 1. Get the directory of main.py (server/comparer)
current_dir = os.path.dirname(os.path.abspath(__file__))

# 2. Go up two levels to the root (comparer -> server -> root)
root_dir = os.path.abspath(os.path.join(current_dir, "..", ".."))

# 3. Target the config file at the root
config_path = os.path.join(root_dir, "config.ini")

# Debug print (optional, helps you see exactly where it's looking)
print(f"Looking for config at: {config_path}")

if not os.path.exists(config_path):
    raise FileNotFoundError(f"Could not find config.ini at {config_path}")

config.read(config_path)

# Verify 'paths' exists
if 'paths' not in config:
    raise KeyError(f"The config file at {config_path} is missing the [paths] section.")

CROP_INBOX = config['paths']['cropper_inbox']
CROP_PROCESSED = config['paths']['cropper_processed']

def compare_word_lists(str1: List[str], str2: List[str]):
    # A simple but effective method to categorize text changes
    added = [w for w in str2 if w not in str1]
    removed = [w for w in str1 if w not in str2]
    
    if added or removed:
        description = "Text changed."
        if removed: description += f" Text '{' '.join(removed[:3])}...' was REMOVED."
        if added: description += f" Text '{' '.join(added[:3])}...' was ADDED."
        return description
    return None

@app.get("/folder-status")
async def get_folder_status():
    if not os.path.exists(CROP_INBOX):
        return {"count": 0, "files": [], "error": f"Path {CROP_INBOX} not found"}
    
    # Filter for standard image extensions
    valid_exts = ('.png', '.jpg', '.jpeg', '.webp')
    files = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts)]
    return {"count": len(files), "files": files}

@app.get("/local-preview")
async def get_local_preview(filename: str, isProcessed: bool = False):
    # 1. Select the correct base directory
    base_path = CROP_PROCESSED if isProcessed else CROP_INBOX
    
    # 2. Clean the incoming filename
    # This replaces web forward-slashes with system-specific slashes (e.g., \ on Windows)
    clean_filename = filename.replace("/", os.sep).replace("\\", os.sep)
    
    # 3. Create the absolute path
    file_path = os.path.normpath(os.path.join(base_path, clean_filename))
    
    # DEBUG: Check your Python terminal to see if this path is correct
    if not os.path.exists(file_path):
        print(f"DEBUG: File not found -> {file_path}")
        return Response(status_code=404)
    
    img = cv2.imread(file_path)
    if img is None:
        return Response(status_code=400)
    
    # 4. Generate the preview
    h, w = img.shape[:2]
    preview_w = 300
    preview_h = int(h * (preview_w / w))
    preview = cv2.resize(img, (preview_w, preview_h))
    
    _, buffer = cv2.imencode('.jpg', preview)
    return Response(content=buffer.tobytes(), media_type="image/jpeg")

@app.get("/processed-history")
async def get_processed_history():
    if not os.path.exists(CROP_PROCESSED):
        return {"history": []}
    
    history = []
    # Get all folders, newest first
    try:
        folders = sorted(
            [d for d in os.listdir(CROP_PROCESSED) if os.path.isdir(os.path.join(CROP_PROCESSED, d))],
            key=lambda d: os.path.getmtime(os.path.join(CROP_PROCESSED, d)),
            reverse=True
        )

        for folder in folders[:15]: # Show a few more for the horizontal scroll
            folder_path = os.path.join(CROP_PROCESSED, folder)
            # We want to identify the CENTER image to use as a key, 
            # and the ORIGINAL image for the thumbnail
            center_imgs = [f for f in os.listdir(folder_path) if f.startswith("center_")]
            if center_imgs:
                history.append({
                    "folder": folder,
                    "preview": center_imgs[0] # Keeping 'center_' as the reference filename
                })
    except Exception as e:
        print(f"History Error: {e}")
            
    return {"history": history}

@app.get("/full-resolution")
async def get_full_resolution(filename: str, isProcessed: bool = False):
    """Serves the full-sized image for viewing and downloading."""
    base_path = CROP_PROCESSED if isProcessed else CROP_INBOX
    safe_filename = filename.replace("/", os.sep).replace("\\", os.sep)
    file_path = os.path.normpath(os.path.join(base_path, safe_filename))
    
    if not os.path.exists(file_path):
        return Response(status_code=404)
    
    # We use standard FileResponse here because we don't need OpenCV 
    # to process/resize anything; we just want the raw HD file.
    from fastapi.responses import FileResponse
    return FileResponse(file_path)

@app.post("/run-batch")
async def run_batch():
    valid_exts = ('.png', '.jpg', '.jpeg', '.webp')
    files = [f for f in os.listdir(CROP_INBOX) if f.lower().endswith(valid_exts)]
    processed_count = 0
    
    for filename in files:
        file_path = os.path.join(CROP_INBOX, filename)
        img = cv2.imread(file_path)
        if img is None: continue

        # --- SMART NAMING LOGIC ---
        base_name = os.path.splitext(filename)[0]
        folder_name = base_name
        counter = 1
        
        # Check if folder exists, if so, append _1, _2, etc.
        while os.path.exists(os.path.join(CROP_PROCESSED, folder_name)):
            folder_name = f"{base_name}_{counter}"
            counter += 1
            
        output_folder = os.path.join(CROP_PROCESSED, folder_name)
        os.makedirs(output_folder, exist_ok=True)

        # Processing (Same as before)
        h, w = img.shape[:2]
        aspect = 1920/1080
        if (w/h) > aspect:
            new_h, new_w = h, int(h * aspect)
        else:
            new_w, new_h = w, int(w / aspect)
        cx, cy = (w - new_w) // 2, (h - new_h) // 2
        
        center_crop = cv2.resize(img[cy:cy+new_h, cx:cx+new_w], (1920, 1080))
        top_crop = cv2.resize(img[0:new_h, cx:cx+new_w], (1920, 1080))

        # Save using the same unique folder_name as the file prefix
        cv2.imwrite(os.path.join(output_folder, f"center_{folder_name}.jpg"), center_crop)
        cv2.imwrite(os.path.join(output_folder, f"top_{folder_name}.jpg"), top_crop)
        shutil.move(file_path, os.path.join(output_folder, f"original_{filename}"))
        
        processed_count += 1

    return {"status": "success", "processed": processed_count}
@app.post("/thumbnail")
async def create_thumbnails(files: List[UploadFile] = File(...)):
    results = []
    
    # Final container dimensions
    TARGET_W = 661
    TARGET_H = 931
    
    for file in files:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        if len(doc) > 0:
            page = doc[0]
            rect = page.rect
            
            # 1. Calculate ratios for both width and height
            ratio_w = TARGET_W / rect.width
            ratio_h = TARGET_H / rect.height
            
            # 2. Use MAX to ensure the canvas is completely filled.
            # This acts exactly like CSS `object-fit: cover`.
            scaling_factor = max(ratio_w, ratio_h)
            mat = fitz.Matrix(scaling_factor, scaling_factor)
            
            # 3. Create the rendered image of the PDF page
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            
            # 4. Create the blank canvas (661x931)
            final_canvas = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, TARGET_W, TARGET_H))
            
            # We still clear with white just in case of transparent PDFs, 
            # though it will be completely covered by the image.
            final_canvas.clear_with(255) 
            
            # 5. Calculate the center position
            # Because we used max(), pix.width/height are now equal to OR larger than TARGET.
            # This makes the offset negative, which perfectly centers the crop.
            x_offset = int((TARGET_W - pix.width) / 2)
            y_offset = int((TARGET_H - pix.height) / 2)
            
            # 6. Shift the image coordinates
            pix.set_origin(x_offset, y_offset)
            
            # 7. Stamp the image. The parts hanging outside the 661x931 canvas are cropped off.
            final_canvas.copy(pix, pix.irect)
            
            # 8. Convert to JPG bytes
            img_data = final_canvas.tobytes("jpg")
            
            base64_img = base64.b64encode(img_data).decode('utf-8')
            results.append({
                "fileName": file.filename,
                "imageData": f"data:image/jpeg;base64,{base64_img}"
            })
            
    return {"thumbnails": results}

@app.get("/ping")
async def ping():
    return {"ping": "pong"}


@app.post("/resize-image")
async def resize_image(files: List[UploadFile] = File(...)):
    all_results = []
    
    for file in files:
        try:
            contents = await file.read()
            nparr = np.frombuffer(contents, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if img is None:
                continue
            
            h, w = img.shape[:2]
            target_w, target_h = 1920, 1080
            target_aspect = target_w / target_h
            input_aspect = w / h

            if input_aspect > target_aspect:
                new_h, new_w = h, int(h * target_aspect)
            else:
                new_w, new_h = w, int(w / target_aspect)

            # Center Crop
            cy, cx = (h - new_h) // 2, (w - new_w) // 2
            center_final = cv2.resize(img[cy:cy+new_h, cx:cx+new_w], (target_w, target_h))

            # Top Crop
            top_final = cv2.resize(img[0:new_h, cx:cx+new_w], (target_w, target_h))

            # Internal helper to encode
            def encode_img(cv_img):
                _, buffer = cv2.imencode('.jpg', cv_img, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
                return f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

            all_results.append({
                "fileName": file.filename,
                "centerCrop": encode_img(center_final),
                "topCrop": encode_img(top_final)
            })
        except Exception as e:
            print(f"Error processing {file.filename}: {e}")
            continue

    return {"results": all_results}

@app.post("/compare")
async def compare_docs(file1: UploadFile = File(...), file2: UploadFile = File(...)):
    doc1_bytes = await file1.read()
    doc2_bytes = await file2.read()
    
    doc1 = fitz.open(stream=doc1_bytes, filetype="pdf")
    doc2 = fitz.open(stream=doc2_bytes, filetype="pdf")
    
    changes = []
    
    # We compare page-by-page. For multi-page, we assume page order matches.
    for page_num in range(min(len(doc1), len(doc2))):
        page1 = doc1[page_num]
        page2 = doc2[page_num]
        label = f"Página {page_num + 1}"

        # --- STEP 1: COMPARE TEXT STRUCTURE (Non-AI, very accurate) ---
        # get_text("words") extracts (x0, y0, x1, y1, "word", block_no, line_no, word_no)
        # We only care about the strings for this comparison.
        str1 = [w[4] for w in page1.get_text("words")]
        str2 = [w[4] for w in page2.get_text("words")]

        if str1 != str2:
            # Analyze the change to generate a specific description
            description = compare_word_lists(str1, str2)
            if description:
                changes.append({
                    "section": label,
                    "type": "text",
                    "description": description
                })

        # --- STEP 2: COMPARE PIXELS (Catching Visual/Image Changes) ---
        # Render pages to high-res images (using matrix=fitz.Matrix(2, 2) is highly recommended for accuracy)
        pix1 = page1.get_pixmap()
        pix2 = page2.get_pixmap()
        
        # Convert fitz pixmaps to numpy arrays for OpenCV processing
        img1 = np.frombuffer(pix1.samples, dtype=np.uint8).reshape((pix1.height, pix1.width, 3))
        img2 = np.frombuffer(pix2.samples, dtype=np.uint8).reshape((pix2.height, pix2.width, 3))

        # We must align the images. If shapes differ, resize.
        if img1.shape != img2.shape:
            img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        # Perform absolute pixel subtraction
        diff = cv2.absdiff(img1, img2)
        gray = cv2.cvtColor(diff, cv2.COLOR_BGR2GRAY)
        
        # Create a binary threshold to isolate true changes and ignore noise.
        # Threshold of 25 is chosen to catch subtle changes.
        _, thresh = cv2.threshold(gray, 25, 255, cv2.THRESH_BINARY)
        
        # We determine if there's a significant visual difference remaining.
        if np.count_nonzero(thresh) > 500: # Threshold in pixels to ignore noise
            
            # --- STEP 3: INTELLIGENT DISCRIMINATION (Categorization) ---
            
            # Case A: Visual changes exist, but TEXT is identical.
            # This is a pure image or color change.
            if str1 == str2:
                # We can't say if it's inversion or color shift without AI,
                # but we can definitively say it's NOT a text change.
                changes.append({
                    "section": label,
                    "type": "image",
                    "description": "Visual change detected (Image, color, or inversion) but text layer is identical."
                })
                
            # Case B: If both text and pixels differ, the user already knows 
            # about the text change from Step 1. We prioritize reporting text changes.
            # We skip adding a duplicate "Visual discrepancy" entry if possible.

    return {"summary": f"Detected {len(changes)} specific differences.", "changes": changes}
    # At the bottom of main.py
if __name__ == "__main__":
    import uvicorn
    # This line starts the server and keeps it running
    uvicorn.run(app, host="0.0.0.0", port=8000)