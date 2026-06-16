import base64
import fitz  # PyMuPDF
from typing import List

from fastapi import APIRouter, UploadFile, File

router = APIRouter(prefix="/thumbnail", tags=["thumbnail"])

# Final container dimensions
TARGET_W = 661
TARGET_H = 931


@router.post("/")
async def create_thumbnails(files: List[UploadFile] = File(...)):
    """
    Accepts one or more PDF uploads and returns a base64-encoded JPEG
    thumbnail (661×931, object-fit: cover) for the first page of each.
    """
    results = []

    for file in files:
        pdf_bytes = await file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")

        if len(doc) > 0:
            page = doc[0]
            rect = page.rect

            # 1. Calculate ratios for both width and height
            ratio_w = TARGET_W / rect.width
            ratio_h = TARGET_H / rect.height

            # 2. Use MAX to ensure the canvas is completely filled (object-fit: cover)
            scaling_factor = max(ratio_w, ratio_h)
            mat = fitz.Matrix(scaling_factor, scaling_factor)

            # 3. Render the PDF page
            pix = page.get_pixmap(matrix=mat, colorspace=fitz.csRGB)

            # 4. Create the blank canvas
            final_canvas = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, TARGET_W, TARGET_H))
            final_canvas.clear_with(255)

            # 5. Centre the image on the canvas
            x_offset = int((TARGET_W - pix.width) / 2)
            y_offset = int((TARGET_H - pix.height) / 2)
            pix.set_origin(x_offset, y_offset)

            # 6. Stamp the image (parts outside 661×931 are cropped off)
            final_canvas.copy(pix, pix.irect)

            # 7. Encode to JPEG bytes → base64
            img_data    = final_canvas.tobytes("jpg")
            base64_img  = base64.b64encode(img_data).decode("utf-8")

            results.append({
                "fileName":  file.filename,
                "imageData": f"data:image/jpeg;base64,{base64_img}",
            })

    return {"thumbnails": results}
