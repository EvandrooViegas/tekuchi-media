'use client';

// FLOORPLAN EXTRACTOR
// Extracts ONLY the floor-plan drawing from each PDF page.
// Uses PyMuPDF vector-path data to locate the drawing precisely,
// then removes the background completely (transparent PNG).

import { useState, useCallback, useRef } from 'react';
import {
    UploadCloud, Download, Trash2, X, Loader2,
    PackageOpen, FileText, ChevronRight, Layers,
    ZoomIn,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DocsBanner } from '@/components/docs-banner';
import JSZip from 'jszip';

interface PlanCrop {
    label: string;
    dataUrl: string;
    width: number;
    height: number;
}

interface PageResult {
    source_file: string;
    page: number;
    name: string;
    duplex: boolean;
    plans: PlanCrop[];
    warning?: string;
}

interface QueuedFile { id: string; file: File; }

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Lightbox ─────────────────────────────────────────────────────────────────

function Lightbox({ plan, onClose }: { plan: PlanCrop; onClose: () => void }) {
    return (
        <div
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6"
            onClick={onClose}
        >
            <div
                className="relative max-w-5xl w-full max-h-[90vh] flex flex-col gap-3"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-sm">{plan.label}</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => {
                                const a = document.createElement('a');
                                a.href = plan.dataUrl;
                                a.download = `${plan.label}.png`;
                                a.click();
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg transition-colors"
                        >
                            <Download size={13} /> Download PNG
                        </button>
                        <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/60 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                </div>
                {/* Checkerboard background for transparency */}
                <div
                    className="rounded-xl overflow-hidden flex items-center justify-center"
                    style={{
                        backgroundImage: 'repeating-conic-gradient(#374151 0% 25%, #1f2937 0% 50%)',
                        backgroundSize: '20px 20px',
                        maxHeight: 'calc(90vh - 60px)',
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={plan.dataUrl}
                        alt={plan.label}
                        className="max-w-full max-h-full object-contain"
                        style={{ maxHeight: 'calc(90vh - 80px)' }}
                    />
                </div>
                <p className="text-white/40 text-[10px] text-center">{plan.width} × {plan.height}px · Click outside to close</p>
            </div>
        </div>
    );
}

// ─── Plan tile ────────────────────────────────────────────────────────────────

function PlanTile({ plan, onOpen }: { plan: PlanCrop; onOpen: (p: PlanCrop) => void }) {
    return (
        <div
            className="group relative cursor-pointer rounded-xl overflow-hidden border border-slate-200/60 shadow-sm hover:shadow-lg hover:border-slate-400 transition-all duration-200 bg-white"
            onClick={() => onOpen(plan)}
        >
            {/* Checkerboard to show transparency */}
            <div
                className="w-full flex items-center justify-center p-6"
                style={{
                    backgroundImage: 'repeating-conic-gradient(#e2e8f0 0% 25%, #f8fafc 0% 50%)',
                    backgroundSize: '16px 16px',
                    minHeight: '220px',
                }}
            >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={plan.dataUrl}
                    alt={plan.label}
                    className="max-h-[280px] max-w-full object-contain drop-shadow-xl group-hover:scale-[1.02] transition-transform duration-200"
                />
            </div>

            {/* Hover overlay */}
            <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                <div className="bg-slate-900/80 text-white rounded-full p-2">
                    <ZoomIn size={18} />
                </div>
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-slate-100 px-4 py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-800 truncate">{plan.label}</p>
                    <p className="text-[10px] text-slate-400">{plan.width} × {plan.height}px</p>
                </div>
                <button
                    onClick={e => {
                        e.stopPropagation();
                        const a = document.createElement('a');
                        a.href = plan.dataUrl;
                        a.download = `${plan.label}.png`;
                        a.click();
                    }}
                    className="flex-none p-1.5 rounded-lg bg-slate-100 hover:bg-slate-900 hover:text-white text-slate-500 transition-all"
                    title="Download PNG"
                >
                    <Download size={14} />
                </button>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FloorplanExtractorPage() {
    const [queue, setQueue]               = useState<QueuedFile[]>([]);
    const [results, setResults]           = useState<PageResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragging, setIsDragging]     = useState(false);
    const [isZipping, setIsZipping]       = useState(false);
    const [lightbox, setLightbox]         = useState<PlanCrop | null>(null);

    // Progress
    const [currentPage, setCurrentPage]     = useState(0);
    const [totalPages, setTotalPages]       = useState(0);
    const [currentSource, setCurrentSource] = useState('');

    // Session tracking for stop functionality
    const [sessionId, setSessionId]         = useState<string | null>(null);
    const [isStopping, setIsStopping]       = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    const addFiles = useCallback((list: FileList | File[]) => {
        const pdfs = Array.from(list).filter(
            f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
        );
        if (pdfs.length === 0) { toast.error('Only PDF files are supported.'); return; }
        setQueue(prev => [...prev, ...pdfs.map(f => ({ id: uid(), file: f }))]);
        toast.success(`Added ${pdfs.length} PDF${pdfs.length !== 1 ? 's' : ''}`);
    }, []);

    const removeFile = (id: string) => setQueue(prev => prev.filter(f => f.id !== id));

    const clearAll = () => {
        setQueue([]); setResults([]);
        setCurrentPage(0); setTotalPages(0);
    };

    const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
    const onDragLeave = () => setIsDragging(false);
    const onDrop      = (e: React.DragEvent) => {
        e.preventDefault(); setIsDragging(false);
        if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
    };
    const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) addFiles(e.target.files);
        e.target.value = '';
    };

    const handleStop = async () => {
        if (!sessionId) return;
        setIsStopping(true);
        
        try {
            // Abort the client-side fetch
            abortControllerRef.current?.abort();

            // Notify server to stop processing
            await fetch('/api/floorplan', {
                method: 'DELETE',
                body: JSON.stringify({ sessionId }),
                headers: { 'Content-Type': 'application/json' },
            }).catch(() => {}); // Ignore errors

            toast.warning('Extraction stopped');
        } catch (error) {
            console.error('Stop error:', error);
        } finally {
            setIsStopping(false);
            setSessionId(null);
            setIsProcessing(false);
        }
    };

    const handleExtract = async () => {
        if (queue.length === 0) { toast.error('Add at least one PDF first.'); return; }
        setIsProcessing(true);
        setResults([]);
        setCurrentPage(0); setTotalPages(0); setCurrentSource('');
        setSessionId(null);
        setIsStopping(false);

        try {
            const formData = new FormData();
            queue.forEach(qf => formData.append('files', qf.file, qf.file.name));

            // Create new AbortController for this extraction
            abortControllerRef.current = new AbortController();

            const response = await fetch('/api/floorplan', {
                method: 'POST',
                body: formData,
                signal: abortControllerRef.current.signal,
            });

            // Extract session ID from response headers
            const newSessionId = response.headers.get('X-Session-Id');
            if (newSessionId) setSessionId(newSessionId);

            if (!response.ok || !response.body) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error ?? `Server error ${response.status}`);
            }

            const reader  = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer    = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });

                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';

                for (const part of parts) {
                    const line = part.trim();
                    if (!line.startsWith('data:')) continue;
                    try {
                        const evt = JSON.parse(line.slice(5).trim());
                        if (evt.type === 'progress') {
                            setCurrentPage(evt.page);
                            setTotalPages(evt.total);
                            setCurrentSource(evt.source ?? '');
                        } else if (evt.type === 'result' && evt.plans?.length > 0) {
                            setResults(prev => [...prev, evt as PageResult]);
                        } else if (evt.type === 'done') {
                            const n = evt.total_plans as number;
                            if (n === 0) toast.warning('No floor-plans detected in these PDFs.');
                            else toast.success(`Extracted ${n} floor-plan${n !== 1 ? 's' : ''}`);
                        } else if (evt.type === 'error') {
                            toast.error(evt.message);
                        }
                    } catch { /* malformed chunk */ }
                }
            }
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') {
                // User stopped the extraction, don't show error
                return;
            }
            toast.error(err instanceof Error ? err.message : 'Extraction failed.');
        } finally {
            setIsProcessing(false);
            setSessionId(null);
            abortControllerRef.current = null;
        }
    };

    const handleDownloadAll = async () => {
        const allPlans = results.flatMap(r => r.plans);
        if (allPlans.length === 0) return;
        setIsZipping(true);
        try {
            const zip = new JSZip();
            for (const p of allPlans) zip.file(`${p.label}.png`, p.dataUrl.split(',')[1], { base64: true });
            const blob = await zip.generateAsync({ type: 'blob' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            a.href = url; a.download = 'floorplans.zip'; a.click();
            URL.revokeObjectURL(url);
        } finally { setIsZipping(false); }
    };

    const allPlans   = results.flatMap(r => r.plans);
    const hasFiles   = queue.length > 0;
    const hasResults = allPlans.length > 0;
    const progressPct = totalPages > 0 ? Math.round((currentPage / totalPages) * 100) : 0;

    return (
        <div className="p-8 mx-auto space-y-8 font-sans h-full overflow-y-auto pb-20">

            {lightbox && <Lightbox plan={lightbox} onClose={() => setLightbox(null)} />}

            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Floorplan Extractor</h1>
                    <p className="text-slate-500 font-medium">Extract floor-plan drawings from PDFs as transparent PNGs</p>
                </div>
                {(hasFiles || hasResults) && !isProcessing && (
                    <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400 hover:text-red-500 gap-1.5">
                        <Trash2 size={14} /> Clear all
                    </Button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">

                {/* ── Left sidebar ── */}
                <div className="lg:col-span-1 space-y-5">

                    {/* Drop zone */}
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-4">
                            <div>
                                <h2 className="text-sm font-black text-slate-800">Upload PDFs</h2>
                            </div>
                            <div
                                onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
                                onClick={() => fileInputRef.current?.click()}
                                className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-all py-6 px-3
                                    ${isDragging ? 'border-slate-900 bg-slate-900/5' : 'border-slate-200 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'}`}
                            >
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isDragging ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-400'}`}>
                                    <UploadCloud size={18} />
                                </div>
                                <p className="text-xs font-bold text-slate-600 text-center">{isDragging ? 'Drop to add' : 'Drop PDFs or click'}</p>
                                <input ref={fileInputRef} type="file" multiple accept="application/pdf,.pdf" className="hidden" onChange={onFileInput} />
                            </div>

                            {hasFiles && (
                                <div className="space-y-1.5">
                                    {queue.map(qf => (
                                        <div key={qf.id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                                            <FileText size={12} className="text-slate-400 flex-none" />
                                            <span className="text-[11px] font-medium text-slate-700 truncate flex-1">{qf.file.name}</span>
                                            <button onClick={() => removeFile(qf.id)} className="text-slate-300 hover:text-red-400 flex-none transition-colors">
                                                <X size={11} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Extract */}
                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-3">
                            <div>
                                <h2 className="text-sm font-black text-slate-800">Extract</h2>
                            </div>
                            {isProcessing ? (
                                <Button onClick={handleStop} disabled={isStopping}
                                    className="w-full h-11 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl gap-2">
                                    {isStopping
                                        ? <><Loader2 size={15} className="animate-spin" /> Stopping…</>
                                        : <>
                                            <X size={15} /> Stop Extraction
                                          </>
                                    }
                                </Button>
                            ) : (
                                <Button onClick={handleExtract} disabled={!hasFiles || isProcessing}
                                    className="w-full h-11 bg-slate-900 hover:bg-slate-700 text-white font-bold rounded-xl gap-2">
                                    <><Layers size={15} /> Extract <ChevronRight size={13} className="opacity-50" /></>
                                </Button>
                            )}
                            {hasResults && !isProcessing && (
                                <Button variant="outline" onClick={handleDownloadAll} disabled={isZipping}
                                    className="w-full h-9 rounded-xl gap-1.5 border-slate-200 text-slate-700 text-xs">
                                    {isZipping
                                        ? <><Loader2 size={13} className="animate-spin" /> Building…</>
                                        : <><PackageOpen size={13} /> Download All ({allPlans.length}) ZIP</>
                                    }
                                </Button>
                            )}
                        </CardContent>
                    </Card>

                    {/* Progress */}
                    {isProcessing && (
                        <div className="p-4 bg-slate-900 rounded-xl space-y-3 animate-in fade-in duration-200">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Processing</p>
                                <span className="text-xs font-black text-slate-300">{progressPct}%</span>
                            </div>
                            <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-emerald-400 rounded-full transition-all duration-300" style={{ width: `${progressPct}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 truncate">
                                {currentSource} · page {currentPage}/{totalPages}
                            </p>
                            {allPlans.length > 0 && (
                                <p className="text-[10px] text-emerald-400 font-bold">{allPlans.length} plan{allPlans.length !== 1 ? 's' : ''} extracted so far</p>
                            )}
                        </div>
                    )}
                </div>

                {/* ── Main gallery ── */}
                <div className="lg:col-span-3">

                    {!hasFiles && !hasResults && !isProcessing && (
                        <div className="flex flex-col items-center justify-center h-96 text-center animate-in fade-in duration-500">
                            <Layers size={52} className="mb-4 text-slate-200" />
                            <p className="text-base font-black text-slate-400">No blueprints yet</p>
                            <p className="text-sm text-slate-300 mt-1">Upload PDF brochures to extract floor-plans</p>
                        </div>
                    )}

                    {hasResults && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Count bar */}
                            <div className="flex items-center justify-between">
                                <p className="text-xs font-black text-slate-500 uppercase tracking-widest">
                                    {allPlans.length} floor-plan{allPlans.length !== 1 ? 's' : ''} extracted
                                    {isProcessing && <span className="ml-2 text-emerald-500 animate-pulse">· processing…</span>}
                                </p>
                            </div>

                            {/* Masonry-style grid — adaptive columns based on image orientation */}
                            <div className="grid grid-cols-2 xl:grid-cols-3 gap-5">
                                {allPlans.map((plan, i) => (
                                    <PlanTile key={i} plan={plan} onOpen={setLightbox} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <DocsBanner
                docFile="README"
                explanation="Extract floor-plan drawings from PDF apartment brochures as transparent PNG images."
            />
        </div>
    );
}
