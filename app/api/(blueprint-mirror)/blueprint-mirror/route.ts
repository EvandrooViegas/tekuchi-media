import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

// Force Node.js runtime — Tesseract uses worker_threads which requires
// real filesystem access. This also prevents Next.js from bundling the file.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// BLUEPRINT MIRROR API
//
// Full pipeline (server-side, no AI guessing):
//   1. Receive PNG/JPEG + direction
//   2. Run Tesseract OCR on the original → get every word's exact pixel bbox
//   3. Flip the original image with sharp
//   4. For each word bbox: extract that patch from the ORIGINAL (correct pixels),
//      compute its destination on the flipped image, composite it there
//   5. Return the corrected PNG
//
// Result: geometry is mirrored, text reads correctly.

type Direction = 'horizontal' | 'vertical' | 'both';

interface WordBox {
    x: number; y: number; w: number; h: number;
}

async function getWordBoxes(buffer: Buffer): Promise<WordBox[]> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createWorker } = require('tesseract.js');

    const workerPath = `${process.cwd()}/node_modules/tesseract.js/src/worker-script/node/index.js`;

    // Preprocess the image for better OCR on blueprints:
    // 1. Convert to greyscale
    // 2. Upscale 2x — Tesseract works best at 300+ DPI, blueprints are often low-res
    // 3. Sharpen to make thin text crisper
    // 4. Boost contrast so light grey labels become clearly dark
    const meta = await sharp(buffer).metadata();
    const processedBuf = await sharp(buffer)
        .greyscale()
        .resize(meta.width! * 2, meta.height! * 2, { kernel: 'lanczos3' })
        .sharpen({ sigma: 1.5 })
        .normalise()                  // stretch contrast to full 0-255 range
        .linear(1.5, -30)             // further boost: multiply + subtract
        .toColorspace('b-w')          // ensure true black/white output
        .png()
        .toBuffer();

    const worker = await createWorker('eng', 1, {
        workerPath,
        logger: () => {},
        errorHandler: () => {},
    });

    // PSM 11 = sparse text — find as much text as possible without assuming layout
    await worker.setParameters({ tessedit_pageseg_mode: '11' });

    const { data } = await worker.recognize(processedBuf);
    await worker.terminate();

    // This version of Tesseract.js returns coordinates in the TSV string.
    // TSV columns: level, page, block, par, line, word, left, top, width, height, conf, text
    const scale = 0.5;
    const boxes: WordBox[] = [];

    if (data.tsv) {
        console.log('[blueprint-mirror] TSV sample (first 500 chars):', data.tsv.substring(0, 500));
        const lines = data.tsv.split('\n');
        for (const line of lines) {
            const cols = line.split('\t');
            if (cols.length < 12) continue;
            const level = parseInt(cols[0]);
            if (level !== 5) continue; // level 5 = word
            const conf  = parseFloat(cols[10]);
            const text  = cols[11]?.trim();
            if (!text || conf < 15) continue;
            const x = parseInt(cols[6]);
            const y = parseInt(cols[7]);
            const w = parseInt(cols[8]);
            const h = parseInt(cols[9]);
            if (w < 3 || h < 3 || isNaN(x) || isNaN(y)) continue;
            boxes.push({
                x: Math.round(x * scale),
                y: Math.round(y * scale),
                w: Math.round(w * scale),
                h: Math.round(h * scale),
            });
        }
    }

    console.log(`[blueprint-mirror] parsed ${boxes.length} word box(es) from TSV`);

    return boxes;
}

export async function POST(request: NextRequest) {
    try {
        const formData  = await request.formData();
        const direction = (formData.get('direction') as Direction) ?? 'horizontal';
        const files     = formData.getAll('files') as File[];

        if (!files || files.length === 0) {
            return NextResponse.json({ error: 'No files provided' }, { status: 400 });
        }
        if (!['horizontal', 'vertical', 'both'].includes(direction)) {
            return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
        }

        const results: { name: string; dataUrl: string; width: number; height: number }[] = [];

        for (const file of files) {
            const originalBuf = Buffer.from(await file.arrayBuffer());

            // Get original dimensions
            const meta = await sharp(originalBuf).metadata();
            const W = meta.width!;
            const H = meta.height!;

            console.log(`[blueprint-mirror] ${file.name} ${W}×${H}, running OCR…`);

            // Step 1: OCR on original
            let wordBoxes: WordBox[] = [];
            try {
                wordBoxes = await getWordBoxes(originalBuf);
                console.log(`[blueprint-mirror] found ${wordBoxes.length} word(s)`);
            } catch (ocrErr) {
                console.warn(`[blueprint-mirror] OCR failed, skipping text fix:`, ocrErr);
            }

            // Step 2: flip the original image
            let flipped = sharp(originalBuf);
            if (direction === 'horizontal') flipped = flipped.flop();
            else if (direction === 'vertical') flipped = flipped.flip();
            else { flipped = flipped.flop().flip(); }

            const flippedBuf = await flipped.png().toBuffer();

            // Step 3: restamp each word patch from original onto flipped image
            if (wordBoxes.length > 0) {
                const compositeOps: sharp.OverlayOptions[] = [];

                for (const box of wordBoxes) {
                    // Clamp source to image bounds
                    const sx = Math.max(0, box.x);
                    const sy = Math.max(0, box.y);
                    const sw = Math.min(W - sx, box.w);
                    const sh = Math.min(H - sy, box.h);
                    if (sw <= 0 || sh <= 0) continue;

                    // Where does this box land after the flip?
                    let destX = sx;
                    let destY = sy;
                    if (direction === 'horizontal' || direction === 'both') destX = W - sx - sw;
                    if (direction === 'vertical'   || direction === 'both') destY = H - sy - sh;

                    // Extract clean patch from original
                    const patch = await sharp(originalBuf)
                        .extract({ left: sx, top: sy, width: sw, height: sh })
                        .png()
                        .toBuffer();

                    compositeOps.push({ input: patch, left: destX, top: destY });
                }

                const correctedBuf = await sharp(flippedBuf)
                    .composite(compositeOps)
                    .png()
                    .toBuffer();

                const { width, height } = await sharp(correctedBuf).metadata();
                results.push({
                    name:    file.name,
                    dataUrl: `data:image/png;base64,${correctedBuf.toString('base64')}`,
                    width:   width!,
                    height:  height!,
                });
            } else {
                // No OCR results — return plain flip
                const { data, info } = await sharp(flippedBuf).toBuffer({ resolveWithObject: true });
                results.push({
                    name:    file.name,
                    dataUrl: `data:image/png;base64,${data.toString('base64')}`,
                    width:   info.width,
                    height:  info.height,
                });
            }
        }

        return NextResponse.json({ results });
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[blueprint-mirror] Error:', msg);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
