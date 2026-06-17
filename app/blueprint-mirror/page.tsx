'use client';

// BLUEPRINT MIRROR
// Mirrors blueprint PNG images horizontally, vertically, or both.
// User can mark text regions on each blueprint before mirroring —
// those patches are copied from the original and stamped at the correct
// mirrored position so labels stay readable.

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    FlipHorizontal2, FlipVertical2, UploadCloud, Download,
    Trash2, X, Loader2, CheckCircle2, ArrowLeftRight,
    ChevronRight, PackageOpen, RectangleHorizontal,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DocsBanner } from '@/components/docs-banner';
import JSZip from 'jszip';

type MirrorDirection = 'horizontal' | 'vertical' | 'both';
interface Rect { x: number; y: number; w: number; h: number; }

interface BlueprintFile {
    id: string;
    file: File;
    previewUrl: string;
    labelRegions: Rect[];   // user-drawn text regions in image-space pixels
}

interface MirroredResult {
    id: string; name: string;
    originalUrl: string; mirroredUrl: string;
    width: number; height: number;
}

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function loadImageToCanvas(src: string): Promise<{
    canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number;
}> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0);
            resolve({ canvas, ctx, w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = reject;
        img.src = src;
    });
}

// Copy each marked region from the original and stamp it at the mirrored destination
async function applyRegionStamps(
    originalUrl: string,
    flippedDataUrl: string,
    regions: Rect[],
    direction: MirrorDirection,
): Promise<string> {
    if (regions.length === 0) return flippedDataUrl;
    const [orig, flipped] = await Promise.all([
        loadImageToCanvas(originalUrl),
        loadImageToCanvas(flippedDataUrl),
    ]);
    const W = orig.w, H = orig.h;
    for (const r of regions) {
        const sx = Math.max(0, r.x), sy = Math.max(0, r.y);
        const sw = Math.min(W - sx, r.w), sh = Math.min(H - sy, r.h);
        if (sw <= 0 || sh <= 0) continue;
        let destX = sx, destY = sy;
        if (direction === 'horizontal' || direction === 'both') destX = W - sx - sw;
        if (direction === 'vertical'   || direction === 'both') destY = H - sy - sh;
        flipped.ctx.putImageData(orig.ctx.getImageData(sx, sy, sw, sh), destX, destY);
    }
    return flipped.canvas.toDataURL('image/png');
}

// ─── Region Painter modal ─────────────────────────────────────────────────────

function RegionPainter({ blueprint, onSave, onClose }: {
    blueprint: BlueprintFile;
    onSave: (id: string, regions: Rect[]) => void;
    onClose: () => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [regions, setRegions] = useState<Rect[]>([...blueprint.labelRegions]);
    const [drawing, setDrawing] = useState(false);
    const [start, setStart]     = useState({ x: 0, y: 0 });
    const imgRef   = useRef<HTMLImageElement | null>(null);
    const scaleRef = useRef({ x: 1, y: 1, offX: 0, offY: 0 });

    useEffect(() => {
        const img = new Image();
        img.onload = () => { imgRef.current = img; redraw(regions, null); };
        img.src = blueprint.previewUrl;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [blueprint.previewUrl]);

    function redraw(rects: Rect[], live: Rect | null) {
        const canvas = canvasRef.current; const img = imgRef.current;
        if (!canvas || !img) return;
        const mW = canvas.offsetWidth || 900, mH = canvas.offsetHeight || 600;
        const sc = Math.min(mW / img.naturalWidth, mH / img.naturalHeight, 1);
        const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
        const ox = (mW - dw) / 2, oy = (mH - dh) / 2;
        canvas.width = mW; canvas.height = mH;
        scaleRef.current = { x: sc, y: sc, offX: ox, offY: oy };
        const ctx = canvas.getContext('2d')!;
        ctx.clearRect(0, 0, mW, mH);
        ctx.drawImage(img, ox, oy, dw, dh);

        // ── Draw saved regions (image-space coords → display coords) ──────────
        rects.forEach((r, i) => {
            const rx = ox + r.x * sc, ry = oy + r.y * sc;
            const rw = r.w * sc, rh = r.h * sc;

            // Semi-transparent fill
            ctx.fillStyle = 'rgba(59,130,246,0.12)';
            ctx.fillRect(rx, ry, rw, rh);

            // Solid blue border
            ctx.setLineDash([]);
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(rx, ry, rw, rh);

            // Number badge
            const badgeW = 22, badgeH = 18;
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.roundRect(rx + 2, ry + 2, badgeW, badgeH, 3);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 11px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(`${i + 1}`, rx + 2 + badgeW / 2, ry + 2 + badgeH / 2);
        });

        // ── Draw live selection box (already in display-space coords) ─────────
        if (live) {
            const { x, y, w, h } = live;
            if (w < 2 || h < 2) return;

            // Dark overlay outside the selection
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            // top strip
            ctx.fillRect(ox, oy, dw, Math.max(0, y - oy));
            // bottom strip
            ctx.fillRect(ox, y + h, dw, Math.max(0, oy + dh - y - h));
            // left strip
            ctx.fillRect(ox, y, Math.max(0, x - ox), h);
            // right strip
            ctx.fillRect(x + w, y, Math.max(0, ox + dw - x - w), h);

            // Bright white border
            ctx.setLineDash([]);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, w, h);

            // Inset orange dashed border for contrast on light backgrounds
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            ctx.setLineDash([]);

            // Corner handles
            const hs = 7; // handle size
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#f97316';
            ctx.lineWidth = 1.5;
            for (const [hx, hy] of [
                [x, y], [x + w, y], [x, y + h], [x + w, y + h],
                [x + w / 2, y], [x + w / 2, y + h],
                [x, y + h / 2], [x + w, y + h / 2],
            ] as [number, number][]) {
                ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
                ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
            }

            // Dimension label — show pixel size in image space
            const imgW = Math.round(w / sc);
            const imgH = Math.round(h / sc);
            const label = `${imgW} × ${imgH} px`;
            ctx.font = 'bold 12px sans-serif';
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            const textPad = 5;
            const labelW = ctx.measureText(label).width + textPad * 2;
            const labelH = 20;
            // Position above selection, clamped to canvas
            const lx = Math.min(x, mW - labelW - 4);
            const ly = y - labelH - 4 < 0 ? y + h + 4 : y - labelH - 4;
            ctx.fillStyle = 'rgba(249,115,22,0.92)';
            ctx.beginPath();
            ctx.roundRect(lx, ly, labelW, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(label, lx + textPad, ly + labelH - 5);
        }
    }

    function pos(e: React.MouseEvent<HTMLCanvasElement>) {
        const r = canvasRef.current!.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
    }
    function onDown(e: React.MouseEvent<HTMLCanvasElement>) { setDrawing(true); setStart(pos(e)); }
    function onMove(e: React.MouseEvent<HTMLCanvasElement>) {
        if (!drawing) return;
        const p = pos(e);
        redraw(regions, { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) });
    }
    function onUp(e: React.MouseEvent<HTMLCanvasElement>) {
        if (!drawing) return; setDrawing(false);
        const p = pos(e); const s = scaleRef.current;
        const ix = Math.round((Math.min(start.x, p.x) - s.offX) / s.x);
        const iy = Math.round((Math.min(start.y, p.y) - s.offY) / s.y);
        const iw = Math.round(Math.abs(p.x - start.x) / s.x);
        const ih = Math.round(Math.abs(p.y - start.y) / s.y);
        if (iw > 6 && ih > 6) {
            const updated = [...regions, { x: ix, y: iy, w: iw, h: ih }];
            setRegions(updated); redraw(updated, null);
        } else { redraw(regions, null); }
    }
    function remove(i: number) {
        const u = regions.filter((_, idx) => idx !== i);
        setRegions(u); redraw(u, null);
    }

    return (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] flex flex-col overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                    <div>
                        <h2 className="text-sm font-black text-slate-800">Mark Text Regions — {blueprint.file.name}</h2>
                        <p className="text-[11px] text-slate-400 mt-0.5">Drag to draw a box around each label. Click a region badge to remove it.</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
                </div>
                <div className="flex-1 overflow-hidden bg-slate-100 min-h-0">
                    <canvas ref={canvasRef} className="w-full h-full" style={{ cursor: 'crosshair', display: 'block', minHeight: 400 }}
                        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp}
                        onMouseLeave={() => { if (drawing) { setDrawing(false); redraw(regions, null); } }} />
                </div>
                <div className="p-4 border-t flex items-center justify-between gap-4 bg-white">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                        {regions.length === 0
                            ? <span className="text-[11px] text-slate-400">No regions drawn yet</span>
                            : regions.map((_, i) => (
                                <button key={i} onClick={() => remove(i)}
                                    className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200 px-2 py-1 rounded-full hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors">
                                    Region {i + 1} <X size={9} />
                                </button>
                            ))
                        }
                    </div>
                    <div className="flex gap-2 flex-none">
                        <Button variant="outline" size="sm" onClick={onClose} className="rounded-lg">Cancel</Button>
                        <Button size="sm" onClick={() => { onSave(blueprint.id, regions); onClose(); }} className="bg-slate-900 text-white rounded-lg gap-1.5">
                            <CheckCircle2 size={13} /> Save {regions.length} region{regions.length !== 1 ? 's' : ''}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DirectionCard({ selected, onClick, icon, label, description }: {
    selected: boolean; onClick: () => void; icon: React.ReactNode; label: string; description: string;
}) {
    return (
        <button type="button" onClick={onClick}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all w-full ${selected ? 'border-slate-900 bg-slate-900 text-white shadow-lg scale-[1.02]' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${selected ? 'bg-white/15' : 'bg-slate-100'}`}>{icon}</div>
            <div className="text-center">
                <p className={`text-sm font-black ${selected ? 'text-white' : 'text-slate-800'}`}>{label}</p>
                <p className={`text-[11px] mt-0.5 leading-relaxed ${selected ? 'text-white/70' : 'text-slate-400'}`}>{description}</p>
            </div>
            {selected && <div className="w-5 h-5 rounded-full bg-emerald-400 flex items-center justify-center self-end mt-auto"><CheckCircle2 size={12} className="text-white" /></div>}
        </button>
    );
}

function BlueprintThumb({ bp, onRemove, onMark }: {
    bp: BlueprintFile; onRemove: (id: string) => void; onMark: (bp: BlueprintFile) => void;
}) {
    return (
        <div className="group relative flex flex-col gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-400 transition-all">
            <div className="w-full aspect-video bg-slate-100 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bp.previewUrl} alt={bp.file.name} className="w-full h-full object-contain" />
            </div>
            <p className="text-[10px] font-bold text-slate-600 truncate text-center" title={bp.file.name}>{bp.file.name}</p>
            <button onClick={() => onMark(bp)}
                className={`flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded-lg transition-colors w-full ${bp.labelRegions.length > 0 ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                <RectangleHorizontal size={11} />
                {bp.labelRegions.length > 0 ? `${bp.labelRegions.length} text region${bp.labelRegions.length !== 1 ? 's' : ''}` : 'Mark text regions'}
            </button>
            <button onClick={() => onRemove(bp.id)}
                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-200">
                <X size={12} />
            </button>
        </div>
    );
}

function ResultCard({ result }: { result: MirroredResult }) {
    const handleDownload = () => {
        const a = document.createElement('a');
        a.href = result.mirroredUrl;
        a.download = `mirrored_${result.name.replace(/\.[^/.]+$/, '')}.png`;
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
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Mirrored</p>
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
                <Button size="sm" onClick={handleDownload} className="bg-slate-900 hover:bg-slate-700 text-white h-8 px-4 rounded-lg gap-1.5 flex-none">
                    <Download size={12} /> Download
                </Button>
            </div>
        </Card>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BlueprintMirrorPage() {
    const [blueprints, setBlueprints]     = useState<BlueprintFile[]>([]);
    const [direction, setDirection]       = useState<MirrorDirection>('horizontal');
    const [isProcessing, setIsProcessing] = useState(false);
    const [results, setResults]           = useState<MirroredResult[]>([]);
    const [isDragging, setIsDragging]     = useState(false);
    const [paintingBp, setPaintingBp]     = useState<BlueprintFile | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = useCallback((fileList: FileList | File[]) => {
        const accepted = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (accepted.length === 0) { toast.error('Only image files are supported.'); return; }
        setBlueprints(prev => [...prev, ...accepted.map(f => ({ id: uid(), file: f, previewUrl: URL.createObjectURL(f), labelRegions: [] }))]);
        toast.success(`Added ${accepted.length} blueprint${accepted.length !== 1 ? 's' : ''}`);
    }, []);

    const removeBlueprint = useCallback((id: string) => {
        setBlueprints(prev => { const t = prev.find(b => b.id === id); if (t) URL.revokeObjectURL(t.previewUrl); return prev.filter(b => b.id !== id); });
    }, []);

    const clearAll = useCallback(() => {
        blueprints.forEach(b => URL.revokeObjectURL(b.previewUrl));
        setBlueprints([]); setResults([]);
    }, [blueprints]);

    const saveRegions = useCallback((id: string, regions: Rect[]) => {
        setBlueprints(prev => prev.map(b => b.id === id ? { ...b, labelRegions: regions } : b));
    }, []);

    const handleDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const handleDragLeave = () => setIsDragging(false);
    const handleDrop      = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files) addFiles(e.dataTransfer.files); };
    const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; };

    const handleMirror = async () => {
        if (blueprints.length === 0) { toast.error('Add at least one blueprint first.'); return; }
        setIsProcessing(true); setResults([]);
        try {
            const formData = new FormData();
            formData.append('direction', direction);
            blueprints.forEach(bp => formData.append('files', bp.file, bp.file.name));
            const res  = await fetch('/api/blueprint-mirror', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok || !data.results) throw new Error(data.error ?? 'Server error');
            const mapped: MirroredResult[] = await Promise.all(
                (data.results as { name: string; dataUrl: string; width: number; height: number }[]).map(async (r, i) => {
                    const bp = blueprints[i];
                    const finalUrl = await applyRegionStamps(bp?.previewUrl ?? '', r.dataUrl, bp?.labelRegions ?? [], direction);
                    return { id: uid(), name: r.name, originalUrl: bp?.previewUrl ?? '', mirroredUrl: finalUrl, width: r.width, height: r.height };
                })
            );
            setResults(mapped);
            const totalRegions = blueprints.reduce((s, b) => s + b.labelRegions.length, 0);
            toast.success(`Mirrored ${mapped.length} blueprint${mapped.length !== 1 ? 's' : ''}${totalRegions > 0 ? ` — ${totalRegions} text region${totalRegions !== 1 ? 's' : ''} preserved` : ''}`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Processing failed.');
        } finally { setIsProcessing(false); }
    };

    const handleDownloadAll = async () => {
        if (results.length === 0) return;
        const zip = new JSZip();
        for (const r of results) zip.file(`mirrored_${r.name.replace(/\.[^/.]+$/, '')}.png`, r.mirroredUrl.split(',')[1], { base64: true });
        const blob = await zip.generateAsync({ type: 'blob' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'mirrored_blueprints.zip'; a.click();
        URL.revokeObjectURL(url);
    };

    const hasFiles = blueprints.length > 0, hasResults = results.length > 0;

    return (
        <div className="p-8 mx-auto space-y-8 font-sans h-full overflow-y-auto pb-20">
            {paintingBp && <RegionPainter blueprint={paintingBp} onSave={saveRegions} onClose={() => setPaintingBp(null)} />}

            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Blueprint Mirror</h1>
                    <p className="text-slate-500 font-medium">Flip blueprints — mark text regions to keep labels readable</p>
                </div>
                {hasFiles && <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400 hover:text-red-500 gap-1.5"><Trash2 size={14} /> Clear all</Button>}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-4">
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 1</p><h2 className="text-sm font-black text-slate-800">Choose mirror direction</h2></div>
                            <div className="grid grid-cols-3 gap-3">
                                <DirectionCard selected={direction === 'horizontal'} onClick={() => setDirection('horizontal')} icon={<FlipHorizontal2 size={22} className={direction === 'horizontal' ? 'text-white' : 'text-slate-600'} />} label="Horizontal" description="Mirror left ↔ right" />
                                <DirectionCard selected={direction === 'vertical'} onClick={() => setDirection('vertical')} icon={<FlipVertical2 size={22} className={direction === 'vertical' ? 'text-white' : 'text-slate-600'} />} label="Vertical" description="Flip top ↕ bottom" />
                                <DirectionCard selected={direction === 'both'} onClick={() => setDirection('both')} icon={<ArrowLeftRight size={22} className={direction === 'both' ? 'text-white' : 'text-slate-600'} />} label="Both" description="Flip in all axes" />
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-4">
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 2</p><h2 className="text-sm font-black text-slate-800">Drop your blueprints</h2></div>
                            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer transition-all py-8 px-4 ${isDragging ? 'border-slate-900 bg-slate-900/5 scale-[1.02]' : 'border-slate-200 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'}`}>
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${isDragging ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}><UploadCloud size={22} /></div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-slate-700">{isDragging ? 'Drop to add' : 'Drop blueprints here'}</p>
                                    <p className="text-[11px] text-slate-400 mt-0.5">or click to browse — PNG, JPEG, WEBP</p>
                                </div>
                                <input ref={fileInputRef} type="file" multiple accept="image/*" className="hidden" onChange={handleFileInput} />
                            </div>
                            {hasFiles && <p className="text-[11px] text-slate-500 font-medium text-center">{blueprints.length} blueprint{blueprints.length !== 1 ? 's' : ''} queued</p>}
                        </CardContent>
                    </Card>

                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-3">
                            <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 3</p><h2 className="text-sm font-black text-slate-800">Mirror blueprints</h2></div>
                            <Button onClick={handleMirror} disabled={!hasFiles || isProcessing} className="w-full h-12 bg-slate-900 hover:bg-slate-700 text-white font-bold rounded-xl gap-2">
                                {isProcessing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><FlipHorizontal2 size={16} /> Mirror {hasFiles ? `${blueprints.length} Blueprint${blueprints.length !== 1 ? 's' : ''}` : 'Blueprints'} <ChevronRight size={14} className="opacity-50" /></>}
                            </Button>
                            {hasResults && <Button variant="outline" onClick={handleDownloadAll} className="w-full h-10 rounded-xl gap-2 border-slate-200 text-slate-700 hover:text-slate-900"><PackageOpen size={14} /> Download All as ZIP</Button>}
                        </CardContent>
                    </Card>

                    <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-blue-400">How text is preserved</p>
                        <p className="text-[11px] text-blue-800 leading-relaxed font-medium">After uploading, click <strong>"Mark text regions"</strong> on each blueprint thumbnail. Draw boxes around labels and room names. Those exact pixel regions are copied from the original and placed at the correct position on the flipped image.</p>
                    </div>
                </div>

                <div className="lg:col-span-2 space-y-6">
                    {hasFiles && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3"><h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Queued ({blueprints.length})</h3><div className="h-[1px] flex-grow bg-slate-100" /></div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {blueprints.map(bp => <BlueprintThumb key={bp.id} bp={bp} onRemove={removeBlueprint} onMark={bp => setPaintingBp(bp)} />)}
                            </div>
                        </div>
                    )}
                    {!hasFiles && !hasResults && (
                        <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in duration-500">
                            <FlipHorizontal2 size={56} className="mb-5 text-slate-200" />
                            <p className="text-base font-black text-slate-400">No blueprints yet</p>
                            <p className="text-sm text-slate-300 mt-1">Drop your blueprints on the left to get started</p>
                        </div>
                    )}
                    {hasResults && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Results ({results.length})</h3>
                                    <div className="h-[1px] w-20 bg-slate-100" />
                                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ready</span></div>
                                </div>
                                <span className="text-[10px] text-slate-400 font-medium capitalize">Mode: <strong className="text-slate-600">{direction}</strong></span>
                            </div>
                            <div className="grid grid-cols-1 gap-4">{results.map(r => <ResultCard key={r.id} result={r} />)}</div>
                        </div>
                    )}
                </div>
            </div>

            <DocsBanner docFile="08_BLUEPRINT_MIRROR" explanation="Mirror blueprint PNG images horizontally, vertically, or both. Mark text regions to keep labels readable after the flip." />
        </div>
    );
}
