'use client';

// BLUEPRINT MIRROR
// Mirrors blueprint PNG images horizontally, vertically, or both.
// Text and labels in the image are detected via pixel analysis and re-stamped
// in their correct (unmirrored) orientation so they remain readable.
// INPUT : PNG/JPEG blueprints (drag & drop, multiple supported)
// OUTPUT: Mirrored PNGs with text preserved (individual download or ZIP)

import { useState, useCallback, useRef } from 'react';
import {
    FlipHorizontal2,
    FlipVertical2,
    UploadCloud,
    Download,
    Trash2,
    X,
    Loader2,
    CheckCircle2,
    ArrowLeftRight,
    ChevronRight,
    PackageOpen,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DocsBanner } from '@/components/docs-banner';
import JSZip from 'jszip';

// ─── Types ────────────────────────────────────────────────────────────────────

type MirrorDirection = 'horizontal' | 'vertical' | 'both';

interface BlueprintFile {
    id: string;
    file: File;
    previewUrl: string;
}

interface MirroredResult {
    id: string;
    name: string;
    originalUrl: string;
    mirroredUrl: string;
    width: number;
    height: number;
    textRegionsFound: number;
}

interface Rect { x: number; y: number; w: number; h: number; }

// ─── Text detection & re-stamp ────────────────────────────────────────────────
//
// Strategy:
//   1. Convert image to greyscale in a temp canvas.
//   2. Threshold: pixels darker than DARK_THRESH are "ink", others are "paper".
//   3. Run a union-find connected-components pass on ink pixels (4-connectivity).
//   4. Filter components by size and aspect ratio to isolate glyph-like blobs.
//   5. Group nearby blobs into "text line" bounding boxes with padding.
//   6. On the already-flipped canvas, overwrite each text-region position
//      with the corresponding patch taken from the ORIGINAL (unflipped) image.
//
// Tuning constants – adjust if blueprints have very light/dark ink:
const DARK_THRESH       = 160;  // 0-255: pixels with luminance below this are "ink"
const MIN_BLOB_AREA     = 6;    // ignore specks smaller than this (px²)
const MAX_BLOB_AREA     = 4000; // ignore large shapes (lines, borders)
const MAX_BLOB_AR       = 10;   // max aspect ratio (w/h or h/w) for a single glyph
const GROUP_GAP         = 16;   // merge blobs that are closer than this (px)
const TEXT_PAD          = 4;    // extra padding around each detected text group (px)

function loadImageToCanvas(src: string): Promise<{ canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            resolve({ canvas, ctx, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = src;
    });
}

function detectTextRegions(ctx: CanvasRenderingContext2D, w: number, h: number): Rect[] {
    const { data } = ctx.getImageData(0, 0, w, h);

    // --- 1. Build binary ink map ---
    const ink = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        ink[i] = lum < DARK_THRESH ? 1 : 0;
    }

    // --- 2. Connected components (union-find) ---
    const label = new Int32Array(w * h).fill(-1);
    const parent: number[] = [];

    function find(x: number): number {
        while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
        return x;
    }
    function union(a: number, b: number) {
        a = find(a); b = find(b);
        if (a !== b) parent[b] = a;
    }

    let nextLabel = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (!ink[idx]) continue;
            const top  = y > 0 ? label[(y - 1) * w + x] : -1;
            const left = x > 0 ? label[y * w + x - 1]   : -1;

            if (top < 0 && left < 0) {
                label[idx] = nextLabel;
                parent.push(nextLabel);
                nextLabel++;
            } else if (top >= 0 && left < 0) {
                label[idx] = find(top);
            } else if (top < 0 && left >= 0) {
                label[idx] = find(left);
            } else {
                const rt = find(top), rl = find(left);
                union(rt, rl);
                label[idx] = find(rt);
            }
        }
    }

    // --- 3. Collect component bounding boxes ---
    const boxes = new Map<number, { x1: number; y1: number; x2: number; y2: number; count: number }>();
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            if (label[idx] < 0) continue;
            const root = find(label[idx]);
            const b = boxes.get(root);
            if (!b) {
                boxes.set(root, { x1: x, y1: y, x2: x, y2: y, count: 1 });
            } else {
                if (x < b.x1) b.x1 = x;
                if (y < b.y1) b.y1 = y;
                if (x > b.x2) b.x2 = x;
                if (y > b.y2) b.y2 = y;
                b.count++;
            }
        }
    }

    // --- 4. Filter glyph-like blobs ---
    const glyphs: Rect[] = [];
    for (const b of boxes.values()) {
        const bw = b.x2 - b.x1 + 1;
        const bh = b.y2 - b.y1 + 1;
        const area = b.count;
        if (area < MIN_BLOB_AREA || area > MAX_BLOB_AREA) continue;
        const ar = Math.max(bw / bh, bh / bw);
        if (ar > MAX_BLOB_AR) continue;
        glyphs.push({ x: b.x1, y: b.y1, w: bw, h: bh });
    }

    if (glyphs.length === 0) return [];

    // --- 5. Group nearby glyphs into text-line rectangles ---
    // Sort by y then x, then greedily merge glyphs within GROUP_GAP of each other
    glyphs.sort((a, b) => a.y - b.y || a.x - b.x);

    const merged: Rect[] = [];
    const used = new Uint8Array(glyphs.length);

    for (let i = 0; i < glyphs.length; i++) {
        if (used[i]) continue;
        let { x, y, w: gw, h: gh } = glyphs[i];
        let x2 = x + gw, y2 = y + gh;
        used[i] = 1;
        let changed = true;
        while (changed) {
            changed = false;
            for (let j = 0; j < glyphs.length; j++) {
                if (used[j]) continue;
                const g = glyphs[j];
                const gx2 = g.x + g.w, gy2 = g.y + g.h;
                // Check proximity (expand current box by GROUP_GAP and test overlap)
                if (
                    g.x <= x2 + GROUP_GAP &&
                    gx2 >= x - GROUP_GAP &&
                    g.y <= y2 + GROUP_GAP &&
                    gy2 >= y - GROUP_GAP
                ) {
                    if (g.x < x)   x  = g.x;
                    if (g.y < y)   y  = g.y;
                    if (gx2 > x2) x2 = gx2;
                    if (gy2 > y2) y2 = gy2;
                    used[j] = 1;
                    changed = true;
                }
            }
        }
        merged.push({ x, y, w: x2 - x, h: y2 - y });
    }

    // --- 6. Add padding and clamp to image bounds ---
    return merged.map(r => ({
        x: Math.max(0, r.x - TEXT_PAD),
        y: Math.max(0, r.y - TEXT_PAD),
        w: Math.min(w - Math.max(0, r.x - TEXT_PAD), r.w + TEXT_PAD * 2),
        h: Math.min(h - Math.max(0, r.y - TEXT_PAD), r.h + TEXT_PAD * 2),
    }));
}

/**
 * Given the already-flipped canvas and the original canvas, re-stamp every
 * detected text region from the original back onto the flipped image so the
 * text reads correctly.
 */
function restampText(
    flippedCtx: CanvasRenderingContext2D,
    originalCtx: CanvasRenderingContext2D,
    textRegions: Rect[],
    W: number,
    H: number,
    direction: MirrorDirection,
) {
    for (const r of textRegions) {
        // Where does this region land after the flip?
        let destX = r.x;
        let destY = r.y;
        if (direction === 'horizontal' || direction === 'both') {
            destX = W - r.x - r.w;
        }
        if (direction === 'vertical' || direction === 'both') {
            destY = H - r.y - r.h;
        }

        // Extract the original (unflipped) patch
        const patch = originalCtx.getImageData(r.x, r.y, r.w, r.h);

        // Stamp it onto the flipped canvas at the mirrored position
        flippedCtx.putImageData(patch, destX, destY);
    }
}

async function processWithTextPreservation(
    originalDataUrl: string,
    flippedDataUrl: string,
    direction: MirrorDirection,
): Promise<{ dataUrl: string; textRegionsFound: number }> {
    const [orig, flipped] = await Promise.all([
        loadImageToCanvas(originalDataUrl),
        loadImageToCanvas(flippedDataUrl),
    ]);

    // Detect text on the original
    const regions = detectTextRegions(orig.ctx, orig.w, orig.h);

    // Re-stamp onto the flipped canvas
    restampText(flipped.ctx, orig.ctx, regions, orig.w, orig.h, direction);

    return {
        dataUrl: flipped.canvas.toDataURL('image/png'),
        textRegionsFound: regions.length,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function DirectionCard({
    selected, onClick, icon, label, description,
}: {
    selected: boolean; onClick: () => void;
    icon: React.ReactNode; label: string; description: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all text-left w-full
                ${selected
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg scale-[1.02]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'
                }`}
        >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selected ? 'bg-white/15' : 'bg-slate-100'}`}>
                {icon}
            </div>
            <div className="text-center">
                <p className={`text-sm font-black ${selected ? 'text-white' : 'text-slate-800'}`}>{label}</p>
                <p className={`text-[11px] mt-0.5 leading-relaxed ${selected ? 'text-white/70' : 'text-slate-400'}`}>{description}</p>
            </div>
            {selected && (
                <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center self-end mt-auto">
                    <CheckCircle2 size={12} className="text-white" />
                </div>
            )}
        </button>
    );
}

function BlueprintThumb({ bp, onRemove }: { bp: BlueprintFile; onRemove: (id: string) => void }) {
    return (
        <div className="group relative flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-400 transition-all">
            <div className="w-full aspect-video bg-slate-100 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bp.previewUrl} alt={bp.file.name} className="w-full h-full object-contain" />
            </div>
            <p className="text-[10px] font-bold text-slate-600 truncate w-full text-center" title={bp.file.name}>
                {bp.file.name}
            </p>
            <button
                onClick={() => onRemove(bp.id)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200"
            >
                <X size={12} />
            </button>
        </div>
    );
}

function ResultCard({ result }: { result: MirroredResult }) {
    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = result.mirroredUrl;
        const base = result.name.replace(/\.[^/.]+$/, '');
        a.download = `mirrored_${base}.png`;
        a.click();
    };

    return (
        <Card className="border border-slate-200/60 shadow-sm bg-white overflow-hidden">
            <div className="grid grid-cols-2 divide-x divide-slate-100">
                <div className="p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Original</p>
                    <div className="aspect-video bg-slate-50 rounded-lg overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.originalUrl} alt="original" className="w-full h-full object-contain" />
                    </div>
                </div>
                <div className="p-3 space-y-2">
                    <div className="flex items-center gap-2">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Mirrored</p>
                        {result.textRegionsFound > 0 && (
                            <span className="text-[8px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full border border-blue-100">
                                {result.textRegionsFound} text region{result.textRegionsFound !== 1 ? 's' : ''} preserved
                            </span>
                        )}
                    </div>
                    <div className="aspect-video bg-slate-50 rounded-lg overflow-hidden">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={result.mirroredUrl} alt="mirrored" className="w-full h-full object-contain" />
                    </div>
                </div>
            </div>
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between bg-white">
                <div className="min-w-0 flex-1 mr-3">
                    <p className="text-xs font-bold text-slate-800 truncate">{result.name}</p>
                    <p className="text-[10px] text-slate-400">{result.width} × {result.height}px</p>
                </div>
                <Button
                    size="sm"
                    onClick={handleDownload}
                    className="bg-slate-900 hover:bg-slate-700 text-white h-8 px-4 rounded-lg gap-1.5 flex-none"
                >
                    <Download size={12} />
                    Download
                </Button>
            </div>
        </Card>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlueprintMirrorPage() {
    const [blueprints, setBlueprints] = useState<BlueprintFile[]>([]);
    const [direction, setDirection] = useState<MirrorDirection>('horizontal');
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults] = useState<MirroredResult[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // ── File management ────────────────────────────────────────────────────

    const addFiles = useCallback((fileList: FileList | File[]) => {
        const accepted = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (accepted.length === 0) { toast.error('Only image files are supported.'); return; }
        const newItems: BlueprintFile[] = accepted.map(f => ({
            id: uid(), file: f, previewUrl: URL.createObjectURL(f),
        }));
        setBlueprints(prev => [...prev, ...newItems]);
        toast.success(`Added ${accepted.length} blueprint${accepted.length !== 1 ? 's' : ''}`);
    }, []);

    const removeBlueprint = useCallback((id: string) => {
        setBlueprints(prev => {
            const target = prev.find(b => b.id === id);
            if (target) URL.revokeObjectURL(target.previewUrl);
            return prev.filter(b => b.id !== id);
        });
    }, []);

    const clearAll = useCallback(() => {
        blueprints.forEach(b => URL.revokeObjectURL(b.previewUrl));
        setBlueprints([]);
        setResults([]);
    }, [blueprints]);

    // ── Drag & Drop ────────────────────────────────────────────────────────

    const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop      = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    };
    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = '';
    };

    // ── Processing ─────────────────────────────────────────────────────────

    const handleMirror = async () => {
        if (blueprints.length === 0) { toast.error('Add at least one blueprint first.'); return; }

        setIsProcessing(true);
        setResults([]);

        try {
            // Step 1 — server-side pixel flip
            const formData = new FormData();
            formData.append('direction', direction);
            blueprints.forEach(bp => formData.append('files', bp.file, bp.file.name));

            const res = await fetch('/api/blueprint-mirror', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok || !data.results) throw new Error(data.error ?? 'Server error');

            // Step 2 — client-side text detection & re-stamp
            const mapped: MirroredResult[] = await Promise.all(
                (data.results as { name: string; dataUrl: string; width: number; height: number }[]).map(
                    async (r, i) => {
                        const originalUrl = blueprints[i]?.previewUrl ?? '';
                        const { dataUrl: finalUrl, textRegionsFound } = await processWithTextPreservation(
                            originalUrl,
                            r.dataUrl,
                            direction,
                        );
                        return {
                            id: uid(),
                            name: r.name,
                            originalUrl,
                            mirroredUrl: finalUrl,
                            width: r.width,
                            height: r.height,
                            textRegionsFound,
                        };
                    }
                )
            );

            setResults(mapped);
            const totalText = mapped.reduce((s, r) => s + r.textRegionsFound, 0);
            toast.success(
                `Mirrored ${mapped.length} blueprint${mapped.length !== 1 ? 's' : ''}` +
                (totalText > 0 ? ` — ${totalText} text region${totalText !== 1 ? 's' : ''} preserved` : '')
            );
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Processing failed.';
            toast.error(msg);
        } finally {
            setIsProcessing(false);
        }
    };

    // ── Download all as ZIP ────────────────────────────────────────────────

    const handleDownloadAll = async () => {
        if (results.length === 0) return;
        const zip = new JSZip();
        for (const r of results) {
            const base64 = r.mirroredUrl.split(',')[1];
            const base = r.name.replace(/\.[^/.]+$/, '');
            zip.file(`mirrored_${base}.png`, base64, { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'mirrored_blueprints.zip'; a.click();
        URL.revokeObjectURL(url);
    };

    // ── Render ─────────────────────────────────────────────────────────────

    const hasFiles   = blueprints.length > 0;
    const hasResults = results.length > 0;

    return (
        <div className="p-8 mx-auto space-y-8 font-sans h-full overflow-y-auto pb-20">

            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Blueprint Mirror</h1>
                    <p className="text-slate-500 font-medium">Flip blueprints while keeping text and labels readable</p>
                </div>
                {hasFiles && (
                    <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400 hover:text-red-500 gap-1.5">
                        <Trash2 size={14} /> Clear all
                    </Button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* ── Left: controls ───────────────────────────────────────── */}
                <div className="lg:col-span-1 space-y-6">

                    {/* Step 1 */}
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 1</p>
                                <h2 className="text-sm font-black text-slate-800">Choose mirror direction</h2>
                            </div>
                            <div className="grid grid-cols-3 gap-3">
                                <DirectionCard
                                    selected={direction === 'horizontal'} onClick={() => setDirection('horizontal')}
                                    icon={<FlipHorizontal2 size={22} className={direction === 'horizontal' ? 'text-white' : 'text-slate-600'} />}
                                    label="Horizontal" description="Mirror left ↔ right"
                                />
                                <DirectionCard
                                    selected={direction === 'vertical'} onClick={() => setDirection('vertical')}
                                    icon={<FlipVertical2 size={22} className={direction === 'vertical' ? 'text-white' : 'text-slate-600'} />}
                                    label="Vertical" description="Flip top ↕ bottom"
                                />
                                <DirectionCard
                                    selected={direction === 'both'} onClick={() => setDirection('both')}
                                    icon={<ArrowLeftRight size={22} className={direction === 'both' ? 'text-white' : 'text-slate-600'} />}
                                    label="Both" description="Flip in all axes"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Step 2 */}
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-4">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 2</p>
                                <h2 className="text-sm font-black text-slate-800">Drop your blueprints</h2>
                            </div>
                            <div
                                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all py-8 px-4
                                    ${isDragging
                                        ? 'border-slate-900 bg-slate-900/5 scale-[1.02]'
                                        : 'border-slate-200 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'
                                    }`}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDragging ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
                                    <UploadCloud size={22} />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-slate-700">{isDragging ? 'Drop to add' : 'Drop blueprints here'}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">or click to browse — PNG, JPEG, WEBP</p>
                                </div>
                                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileInput} />
                            </div>
                            {hasFiles && (
                                <p className="text-[11px] text-slate-500 font-medium text-center">
                                    {blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''} queued
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    {/* Step 3 */}
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 3</p>
                                <h2 className="text-sm font-black text-slate-800">Mirror blueprints</h2>
                            </div>
                            <Button
                                onClick={handleMirror}
                                disabled={!hasFiles || isProcessing}
                                className="w-full h-12 bg-slate-900 hover:bg-slate-700 text-white font-bold rounded-xl transition-all gap-2"
                            >
                                {isProcessing ? (
                                    <><Loader2 size={16} className="animate-spin" /> Processing...</>
                                ) : (
                                    <>
                                        <FlipHorizontal2 size={16} />
                                        Mirror {hasFiles ? `${blueprints.length} Blueprint${blueprints.length !== 1 ? 's' : ''}` : 'Blueprints'}
                                        <ChevronRight size={14} className="opacity-50" />
                                    </>
                                )}
                            </Button>
                            {hasResults && (
                                <Button
                                    variant="outline" onClick={handleDownloadAll}
                                    className="w-full h-10 rounded-xl gap-2 border-slate-200 text-slate-700 hover:text-slate-900"
                                >
                                    <PackageOpen size={14} /> Download All as ZIP
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* How it works */}
                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">How text is preserved</p>
                        <p className="text-[11px] text-blue-800 leading-relaxed font-medium">
                            After flipping, the tool scans the original image for clusters of dark pixels that match glyph
                            proportions (your text and labels). Those regions are copied from the original and re-stamped
                            at their correct position on the flipped blueprint, so they remain unmirrored and readable.
                        </p>
                    </div>
                </div>

                {/* ── Right: queue + results ──────────────────────────────── */}
                <div className="lg:col-span-2 space-y-6">

                    {hasFiles && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Queued ({blueprints.length})</h3>
                                <div className="h-[1px] flex-grow bg-slate-100" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {blueprints.map(bp => <BlueprintThumb key={bp.id} bp={bp} onRemove={removeBlueprint} />)}
                            </div>
                        </div>
                    )}

                    {!hasFiles && !hasResults && (
                        <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-500">
                            <FlipHorizontal2 size={56} className="mb-5 text-slate-200" />
                            <p className="text-base font-black text-slate-400">No blueprints yet</p>
                            <p className="text-sm text-slate-300 mt-1">Drop your PNG blueprints on the left to get started</p>
                        </div>
                    )}

                    {hasResults && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Results ({results.length})</h3>
                                    <div className="h-[1px] w-20 bg-slate-100" />
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ready</span>
                                    </div>
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium capitalize">
                                    Mode: <strong className="text-slate-600">{direction}</strong>
                                </span>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                                {results.map(r => <ResultCard key={r.id} result={r} />)}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <DocsBanner
                docFile="08_BLUEPRINT_MIRROR"
                explanation="Mirror blueprint PNG images horizontally, vertically, or both. Text and labels are automatically detected and preserved in their correct orientation."
            />
        </div>
    );
}
