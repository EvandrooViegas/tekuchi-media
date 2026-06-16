import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// BLUEPRINT MIRROR — TEXT CORRECTION ROUTE
//
// Pipeline:
//   1. Receive original PNG + flipped PNG + direction
//   2. Run Tesseract OCR on the ORIGINAL image → get word bboxes + text
//   3. For each word: compute where it lands in the flipped image (mirrored coords)
//   4. On the flipped image canvas, erase the mirrored-text area (fill with
//      sampled background), then stamp the original word patch from the original
//      image at the correct position
//   5. Return the corrected PNG as base64
//
// This is deterministic — no AI coordinate guessing.

type Direction = 'horizontal' | 'vertical' | 'both';

interface WordBox {
    text: string;
    x: number;
    y: number;
    w: number;
    h: number;
    confidence: number;
}

async function runOCR(imageBuffer: Buffer): Promise<WordBox[]> {
    // Tesseract.js — runs entirely in Node, no external service
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWorker } = require('tesseract.js');
    const worker = await createWorker('eng');

    // Convert buffer to base64 data URL for Tesseract
    const base64 = imageBuffer.toString('base64');
    const dataUrl = `data:image/png;base64,${base64}`;

    const { data } = await worker.recognize(dataUrl);
    await worker.terminate();

    // Collect word-level bounding boxes
    const words: WordBox[] = [];
    for (const block of data.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
            for (const line of para.lines ?? []) {
                for (const word of line.words ?? []) {
                    if (!word.text?.trim() || word.confidence < 30) continue;
                    words.push({
                        text: word.text.trim(),
                        x: word.bbox.x0,
                        y: word.bbox.y0,
                        w: word.bbox.x1 - word.bbox.x0,
                        h: word.bbox.y1 - word.bbox.y0,
                        confidence: word.confidence,
                    });
                }
            }
        }
    }
    return words;
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const originalFile = formData.get('original') as File | null;
        const flippedFile  = formData.get('flipped')  as File | null;
        const direction    = (formData.get('direction') as Direction) ?? 'horizontal';

        if (!originalFile || !flippedFile) {
            return NextResponse.json({ error: 'original and flipped files required' }, { status: 400 });
        }

        const originalBuf = Buffer.from(await originalFile.arrayBuffer());
        const flippedBuf  = Buffer.from(await flippedFile.arrayBuffer());

        // Get image dimensions
        const meta = await sharp(originalBuf).metadata();
        const W = meta.width!;
        const H = meta.height!;

        console.log(`[blueprint-ai] image ${W}×${H}, running OCR...`);

        // Run OCR on original
        const words = await runOCR(originalBuf);
        console.log(`[blueprint-ai] OCR found ${words.length} words`);

        if (words.length === 0) {
            // No text found — return flipped image unchanged
            return NextResponse.json({
                dataUrl: `data:image/png;base64,${flippedBuf.toString('base64')}`,
                wordsFixed: 0,
            });
        }

        // Build corrected image using sharp composite:
        // Start with the flipped image, then overlay each word patch from the
        // original at the correct (un-mirrored) destination position.
        const compositeOps: sharp.OverlayOptions[] = [];

        for (const word of words) {
            // Clamp source region to image bounds
            const sx = Math.max(0, word.x);
            const sy = Math.max(0, word.y);
            const sw = Math.min(W - sx, word.w);
            const sh = Math.min(H - sy, word.h);
            if (sw <= 0 || sh <= 0) continue;

            // Where does this region land in the flipped image?
            let destX = sx;
            let destY = sy;
            if (direction === 'horizontal' || direction === 'both') destX = W - sx - sw;
            if (direction === 'vertical'   || direction === 'both') destY = H - sy - sh;

            // Extract the word patch from the original image
            const patch = await sharp(originalBuf)
                .extract({ left: sx, top: sy, width: sw, height: sh })
                .png()
                .toBuffer();

            compositeOps.push({
                input: patch,
                left: destX,
                top: destY,
            });
        }

        // Composite all word patches onto the flipped image in one pass
        const correctedBuf = await sharp(flippedBuf)
            .composite(compositeOps)
            .png()
            .toBuffer();

        return NextResponse.json({
            dataUrl: `data:image/png;base64,${correctedBuf.toString('base64')}`,
            wordsFixed: words.length,
        });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[blueprint-ai] Error:', msg);

        // If Tesseract isn't installed yet, return a helpful message
        if (msg.includes("Cannot find module 'tesseract.js'")) {
            return NextResponse.json({
                error: 'tesseract.js is not installed. Run: npm install tesseract.js --save-exact',
            }, { status: 500 });
        }

        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
