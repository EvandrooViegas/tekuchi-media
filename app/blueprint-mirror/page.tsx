'use client';

// BLUEPRINT MIRROR
// Mirrors blueprint PNG images horizontally, vertically, or both.
// Supports multi-file batch drop.
// INPUT : PNG/JPEG blueprints (drag & drop, multiple supported)
// OUTPUT: Mirrored PNGs (individual download or ZIP)

import { useState, useCallback, useRef } from 'react';
import {
    FlipHorizontal2, FlipVertical2, UploadCloud, Download,
    Trash2, X, Loader2, CheckCircle2, ArrowLeftRight,
    ChevronRight, PackageOpen,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { DocsBanner } from '@/components/docs-banner';
import JSZip from 'jszip';

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
}

function uid() { return Math.random().toString(36).slice(2, 11); }

// ─── Sub-components ───────────────────────────────────────────────────────────

function DirectionCard({ selected, onClick, icon, label, description }: {
    selected: boolean; onClick: () => void;
    icon: React.ReactNode; label: string; description: string;
}) {
    return (
        <button type="button" onClick={onClick}
            className={`flex flex-col items-center gap-3 p-5 rounded-xl border-2 transition-all w-full
                ${selected
                    ? 'border-slate-900 bg-slate-900 text-white shadow-lg scale-[1.02]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50'}`}>
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
        <div className="group relative flex flex-col gap-2 p-3 rounded-xl border border-slate-200 bg-white hover:border-slate-400 transition-all">
            <div className="w-full aspect-video bg-slate-100 rounded-lg overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={bp.previewUrl} alt={bp.file.name} className="w-full h-full object-contain" />
            </div>
            <p className="text-[10px] font-bold text-slate-600 truncate text-center" title={bp.file.name}>
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
                <Button size="sm" onClick={handleDownload}
                    className="bg-slate-900 hover:bg-slate-700 text-white h-8 px-4 rounded-lg gap-1.5 flex-none">
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
    const fileInputRef = useRef<HTMLInputElement>(null);

    const addFiles = useCallback((fileList: FileList | File[]) => {
        const accepted = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        if (accepted.length === 0) { toast.error('Only image files are supported.'); return; }
        setBlueprints(prev => [...prev, ...accepted.map(f => ({
            id: uid(), file: f, previewUrl: URL.createObjectURL(f),
        }))]);
        toast.success(`Added ${accepted.length} blueprint${accepted.length !== 1 ? 's' : ''}`);
    }, []);

    const removeBlueprint = useCallback((id: string) => {
        setBlueprints(prev => {
            const t = prev.find(b => b.id === id);
            if (t) URL.revokeObjectURL(t.previewUrl);
            return prev.filter(b => b.id !== id);
        });
    }, []);

    const clearAll = useCallback(() => {
        blueprints.forEach(b => URL.revokeObjectURL(b.previewUrl));
        setBlueprints([]);
        setResults([]);
    }, [blueprints]);

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

    const handleMirror = async () => {
        if (blueprints.length === 0) { toast.error('Add at least one blueprint first.'); return; }
        setIsProcessing(true);
        setResults([]);
        try {
            const formData = new FormData();
            formData.append('direction', direction);
            blueprints.forEach(bp => formData.append('files', bp.file, bp.file.name));

            const res  = await fetch('/api/blueprint-mirror', { method: 'POST', body: formData });
            const data = await res.json();
            if (!res.ok || !data.results) throw new Error(data.error ?? 'Server error');

            const mapped: MirroredResult[] = (data.results as {
                name: string; dataUrl: string; width: number; height: number;
            }[]).map((r, i) => ({
                id: uid(),
                name: r.name,
                originalUrl: blueprints[i]?.previewUrl ?? '',
                mirroredUrl: r.dataUrl,
                width: r.width,
                height: r.height,
            }));

            setResults(mapped);
            toast.success(`Mirrored ${mapped.length} blueprint${mapped.length !== 1 ? 's' : ''}`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Processing failed.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDownloadAll = async () => {
        if (results.length === 0) return;
        const zip = new JSZip();
        for (const r of results) {
            zip.file(`mirrored_${r.name.replace(/\.[^/.]+$/, '')}.png`, r.mirroredUrl.split(',')[1], { base64: true });
        }
        const blob = await zip.generateAsync({ type: 'blob' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = 'mirrored_blueprints.zip'; a.click();
        URL.revokeObjectURL(url);
    };

    const hasFiles   = blueprints.length > 0;
    const hasResults = results.length > 0;

    return (
        <div className="p-8 mx-auto space-y-8 font-sans h-full overflow-y-auto pb-20">

            <header className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Blueprint Mirror</h1>
                    <p className="text-slate-500 font-medium">Flip blueprint images horizontally, vertically, or both</p>
                </div>
                {hasFiles && (
                    <Button variant="ghost" size="sm" onClick={clearAll} className="text-slate-400 hover:text-red-500 gap-1.5">
                        <Trash2 size={14} /> Clear all
                    </Button>
                )}
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* ── Controls ── */}
                <div className="lg:col-span-1 space-y-6">

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
                                    label="Horizontal" description="Mirror left ↔ right" />
                                <DirectionCard
                                    selected={direction === 'vertical'} onClick={() => setDirection('vertical')}
                                    icon={<FlipVertical2 size={22} className={direction === 'vertical' ? 'text-white' : 'text-slate-600'} />}
                                    label="Vertical" description="Flip top ↕ bottom" />
                                <DirectionCard
                                    selected={direction === 'both'} onClick={() => setDirection('both')}
                                    icon={<ArrowLeftRight size={22} className={direction === 'both' ? 'text-white' : 'text-slate-600'} />}
                                    label="Both" description="Flip in all axes" />
                            </div>
                        </CardContent>
                    </Card>

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
                                    ${isDragging ? 'border-slate-900 bg-slate-900/5 scale-[1.02]' : 'border-slate-200 bg-slate-50/50 hover:border-slate-400 hover:bg-slate-50'}`}
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

                    <Card className="border border-slate-200/60 shadow-sm bg-white">
                        <CardContent className="p-5 space-y-3">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Step 3</p>
                                <h2 className="text-sm font-black text-slate-800">Mirror blueprints</h2>
                            </div>
                            <Button
                                onClick={handleMirror}
                                disabled={!hasFiles || isProcessing}
                                className="w-full h-12 bg-slate-900 hover:bg-slate-700 text-white font-bold rounded-xl gap-2"
                            >
                                {isProcessing
                                    ? <><Loader2 size={16} className="animate-spin" /> Processing...</>
                                    : <><FlipHorizontal2 size={16} />
                                        Mirror {hasFiles ? `${blueprints.length} Blueprint${blueprints.length !== 1 ? 's' : ''}` : 'Blueprints'}
                                        <ChevronRight size={14} className="opacity-50" /></>
                                }
                            </Button>
                            {hasResults && (
                                <Button variant="outline" onClick={handleDownloadAll}
                                    className="w-full h-10 rounded-xl gap-2 border-slate-200 text-slate-700 hover:text-slate-900">
                                    <PackageOpen size={14} /> Download All as ZIP
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                </div>

                {/* ── Queue + Results ── */}
                <div className="lg:col-span-2 space-y-6">

                    {hasFiles && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex items-center gap-3">
                                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Queued ({blueprints.length})</h3>
                                <div className="h-[1px] flex-grow bg-slate-100" />
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                                {blueprints.map(bp => (
                                    <BlueprintThumb key={bp.id} bp={bp} onRemove={removeBlueprint} />
                                ))}
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
                explanation="Mirror blueprint PNG images horizontally, vertically, or both. Supports multi-file batch processing."
            />
        </div>
    );
}
