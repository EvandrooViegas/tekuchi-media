# pip install fastapi uvicorn pymupdf opencv-python numpy python-multipart
from fastapi import FastAPI, UploadFile, File, Response
import fitz  # PyMuPDF
import cv2
import numpy as np
import base64
from typing import List, Dict

app = FastAPI()

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
            
            # 1. Calculate the 'Fit' factor
            ratio_w = TARGET_W / rect.width
            ratio_h = TARGET_H / rect.height
            scaling_factor = min(ratio_w, ratio_h)
            
            # 2. Render the PDF page to an image
            mat = fitz.Matrix(scaling_factor, scaling_factor)
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)
            
            # 3. Create the blank white canvas (661x931)
            # We use an IRect to define the exact boundaries
            final_canvas = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, TARGET_W, TARGET_H))
            final_canvas.clear_with(255) # Fill with white
            
            # 4. Calculate the center position
            x_offset = int((TARGET_W - pix.width) / 2)
            y_offset = int((TARGET_H - pix.height) / 2)
            
            # 5. THE FIX: Shift the rendered image's internal coordinates
            pix.set_origin(x_offset, y_offset)
            
            # 6. Paste the shifted image onto the white canvas
            final_canvas.copy(pix, pix.irect)
            
            # 7. Convert to JPG bytes
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