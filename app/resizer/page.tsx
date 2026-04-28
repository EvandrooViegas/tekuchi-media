'use client';

import { useState, useEffect } from 'react';
import {
    Play, FolderOpen, RefreshCcw, HardDrive,
    Loader2, CheckCircle2, LayoutGrid, Upload,
    Images, Trash2, UploadCloud, Maximize2, X, Terminal
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from 'sonner';

// --- TYPES ---
interface ResizeResult {
    id: string;
    center: string;
    centerStats?: string;
    top: string;
    topStats?: string;
    original?: string; // Optional for history view
    name: string;
    targetRes?: string;
}

// --- SUB-COMPONENTS ---

const TabBtn = ({ active, onClick, icon, label }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${active ? 'bg-white shadow-md text-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
    >
        {icon} {label}
    </button>
);

const FolderStatusCard = ({ count, isProcessing, onRun }: any) => (
    <Card className="border-none shadow-sm ring-1 ring-slate-200 overflow-hidden bg-white">
        <CardContent className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                    <FolderOpen size={24} />
                </div>
                <div className="text-right">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Inbox Count</p>
                    <p className="text-3xl font-black text-slate-800">{count}</p>
                </div>
            </div>
            <div className="space-y-2">
                <Button
                    onClick={onRun}
                    disabled={count === 0 || isProcessing}
                    className="w-full h-14 bg-slate-900 hover:bg-blue-600 text-white font-bold rounded-xl transition-all"
                >
                    {isProcessing ? <Loader2 className="animate-spin mr-2" /> : <Play size={18} className="mr-2" fill="currentColor" />}
                    {isProcessing ? "Processing..." : "Run Batch Processor"}
                </Button>
            </div>
        </CardContent>
    </Card>
);

const QueuePreview = ({ files }: { files: string[] }) => (
    <Card className="border-none shadow-sm ring-1 ring-slate-200 bg-white h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">In Queue ({files.length})</h3>
            <HardDrive size={14} className="text-slate-300" />
        </div>
        <CardContent className="p-4 overflow-y-auto flex-grow max-h-[600px]">
            {files.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {files.map((f, i) => (
                        <div key={i} className="flex items-center gap-3 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors">
                            {/* Thumbnail using our new preview proxy */}
                            <div className="w-20 h-12 bg-slate-200 rounded overflow-hidden flex-none">
                                <img
                                    src={`/api/resize/local-preview?filename=${encodeURIComponent(f)}`}
                                    className="w-full h-full object-cover"
                                    alt="preview"
                                    onError={(e) => (e.currentTarget.src = "")} // Fallback
                                />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-700 truncate">{f}</p>
                                <span className="text-[9px] text-blue-500 font-black uppercase">TODO</span>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="py-20 text-center text-slate-400">
                    <RefreshCcw size={40} className="mx-auto mb-4 opacity-20" />
                    <p className="text-sm font-medium">No images found in TODO folder.</p>
                </div>
            )}
        </CardContent>
    </Card>
);

// --- MAIN PAGE COMPONENT ---

export default function ResizerPage() {
    const [tab, setTab] = useState<'upload' | 'batch' | 'logs'>('batch');
    const [status, setStatus] = useState({ count: 0, files: [] });
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedHistory, setProcessedHistory] = useState<any[]>([]);
    const [logs, setLogs] = useState<string>("");

    // States for Direct Upload
    const [directHistory, setDirectHistory] = useState<ResizeResult[]>([]);
    const [activeResult, setActiveResult] = useState<ResizeResult | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
    const [showDimModal, setShowDimModal] = useState(false);

    // Poll Folder Status & Logs
    useEffect(() => {
        const updateStatus = async () => {
            try {
                const res = await fetch('/api/resize/folder-status');
                const data = await res.json();
                setStatus(data);

                // Also fetch history
                const histRes = await fetch('/api/resize/processed-history');
                const histData = await histRes.json();
                setProcessedHistory(histData.history);

                // Fetch logs
                const logsRes = await fetch('/api/resize/logs');
                const logsData = await logsRes.json();
                setLogs(logsData.logs);
            } catch (e) { console.error("Poll error"); }
        };
        updateStatus();
        const interval = setInterval(updateStatus, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleRunBatch = async () => {
        setIsProcessing(true);
        try {
            const res = await fetch('/api/resize/run-batch', { method: 'POST' });
            const data = await res.json();
            toast(`Done! Processed ${data.processed} images.`);
        } catch (e) { toast.error("Batch processing failed."); }
        finally { setIsProcessing(false); }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        setPendingFiles(files);
        setShowDimModal(true);
        // Clear the input so the same file can be uploaded again
        const input = document.getElementById('file-upload-input') as HTMLInputElement;
        if (input) input.value = "";
    };

    const confirmUpload = async (tw: number, th: number) => {
        if (!pendingFiles) return;
        setShowDimModal(false);
        setIsUploading(true);
        
        const formData = new FormData();
        Array.from(pendingFiles).forEach(f => formData.append('files', f));

        try {
            const res = await fetch(`/api/resize?tw=${tw}&th=${th}`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.results) {
                const newEntries = data.results.map((r: any) => ({
                    id: Math.random().toString(36).slice(2, 11),
                    name: r.fileName,
                    center: r.centerCrop,
                    centerStats: r.centerStats,
                    top: r.topCrop,
                    topStats: r.topStats,
                    targetRes: r.targetRes
                }));
                setDirectHistory(prev => [...newEntries, ...prev]);
                if (newEntries.length < Array.from(pendingFiles).length) {
                    toast.warning("Some images were skipped (smaller than target dimensions).");
                }
            }
        } catch (err) { alert("Upload failed."); }
        finally { 
            setIsUploading(false);
            setPendingFiles(null);
        }
    };

    const download = (url: string, suffix: string, name: string) => {
        const a = document.createElement('a');
        a.href = url;
        const baseName = name.replace(/\.[^/.]+$/, "");
        a.download = `HD_${suffix}_${baseName}.jpg`;
        a.click();
    };

    return (
        <div className="p-8  mx-auto space-y-8 font-sans h-full overflow-y-auto pb-20">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-black text-slate-800 tracking-tight">Tekuchi Resizer</h1>
                    <p className="text-slate-500 font-medium">Multi-Dimension HD Image Processor</p>
                </div>
                <div className="bg-slate-200 p-1 rounded-2xl flex gap-1">
                    <TabBtn active={tab === 'batch'} onClick={() => setTab('batch')} icon={<LayoutGrid size={16} />} label="Automation" />
                    <TabBtn active={tab === 'upload'} onClick={() => setTab('upload')} icon={<Upload size={16} />} label="Manual" />
                    <TabBtn active={tab === 'logs'} onClick={() => setTab('logs')} icon={<Terminal size={16} />} label="Server Logs" />
                </div>
            </header>

            {tab === 'batch' ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">

                    {/* Left Column: Control Panel */}
                    <div className="lg:col-span-1 space-y-6">
                        <FolderStatusCard
                            count={status.count}
                            isProcessing={isProcessing}
                            onRun={handleRunBatch}
                        />

                        {/* Real-time Status Indicator */}
                        <div className="p-4 bg-green-50 border border-green-100 rounded-2xl flex items-center gap-3">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                            <span className="text-[11px] font-bold text-green-700 uppercase tracking-widest leading-none">
                                Watcher Active: Live
                            </span>
                        </div>

                        {/* Helpful Hint */}
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                            <p className="text-[11px] text-blue-700 leading-relaxed font-medium">
                                <strong>Note:</strong> Running the batch will move files from the dimension-specific TODO folders
                                into individual subfolders within CROPPER_PROCESSED.
                            </p>
                        </div>
                    </div>

                    {/* Right Column: Queue Preview */}
                    <div className="lg:col-span-2">
                        <QueuePreview files={status.files} />
                    </div>

                    {/* Bottom Section: Recently Processed History */}
                    {processedHistory.length > 0 && (
                        <div className="lg:col-span-3 pt-8 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                                        Recently Processed Folders
                                    </h2>
                                    <div className="h-[1px] w-24 bg-slate-200" />
                                </div>
                                <span className="text-[10px] text-slate-400 font-bold italic">Shift + Scroll to pan</span>
                            </div>

                            {/* Scrollable Container */}
                            <div className="flex gap-6 overflow-x-auto pb-6 pt-2 custom-scrollbar snap-x">
                                {processedHistory.map((item, i) => (
                                    <Card
                                        key={i}
                                        onClick={() => setActiveResult({
                                            id: i.toString(),
                                            name: item.folder,
                                            center: `/api/resize/full-resolution?filename=${encodeURIComponent(item.folder + "/center_" + item.folder + ".jpg")}&isProcessed=true`,
                                            centerStats: item.centerStats,
                                            top: `/api/resize/full-resolution?filename=${encodeURIComponent(item.folder + "/top_" + item.folder + ".jpg")}&isProcessed=true`,
                                            topStats: item.topStats,
                                            original: item.original_file 
                                                ? `/api/resize/full-resolution?filename=${encodeURIComponent(item.folder + "/" + item.original_file)}&isProcessed=true` 
                                                : undefined
                                        })}
                                        className="flex-none w-64 group border-none shadow-sm ring-1 ring-slate-200 overflow-hidden bg-white hover:ring-blue-400 transition-all cursor-pointer snap-start"
                                    >
                                        <div className="aspect-video bg-slate-100 relative overflow-hidden">
                                            <img
                                                src={item.original_file ? `/api/resize/local-preview?filename=${encodeURIComponent(item.folder + "/" + item.original_file)}&isProcessed=true` : null}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                alt="Folder Original"
                                            />
                                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                <Maximize2 className="text-white" size={24} />
                                            </div>
                                        </div>
                                        <div className="p-3 border-t bg-white">
                                            <p className="text-[10px] font-black text-slate-800 truncate" title={item.folder}>
                                                {item.folder}
                                            </p>
                                            <div className="flex items-center gap-1 mt-1">
                                                <CheckCircle2 size={10} className="text-green-500" />
                                                <span className="text-[9px] text-slate-400 font-bold uppercase">
                                                    {item.targetRes ? `Organized (${item.targetRes})` : "Folder Organized"}
                                                </span>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : tab === 'upload' ? (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="border-2 border-dashed border-slate-200 bg-white hover:border-blue-500 transition-colors group relative">
                        <input 
                            id="file-upload-input"
                            type="file" 
                            multiple 
                            accept="image/*" 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                            onChange={handleFileSelect} 
                            disabled={isUploading} 
                        />
                        <div className="p-12 flex flex-col items-center">
                            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                                {isUploading ? <Loader2 className="animate-spin" /> : <UploadCloud size={32} />}
                            </div>
                            <span className="text-lg font-bold text-slate-700">{isUploading ? "Uploading..." : "Click or Drag Images"}</span>
                        </div>
                    </Card>

                    {/* Dimension Selection Modal */}
                    {showDimModal && (
                        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                            <Card className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden">
                                <div className="p-6 border-b flex justify-between items-center">
                                    <h3 className="text-xl font-black text-slate-800">Select Export Size</h3>
                                    <button onClick={() => setShowDimModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20}/></button>
                                </div>
                                <CardContent className="p-6 space-y-4">
                                    <div className="grid grid-cols-1 gap-3">
                                        {[
                                            { label: "1920x1080 (HD Standard)", w: 1920, h: 1080 },
                                            { label: "3840x2160 (4K Ultra)", w: 3840, h: 2160 },
                                            { label: "800x450 (Small Wide)", w: 800, h: 450 },
                                            { label: "800x534 (Small Portrait)", w: 800, h: 534 }
                                        ].map((dim) => (
                                            <Button 
                                                key={dim.label}
                                                onClick={() => confirmUpload(dim.w, dim.h)}
                                                className="h-14 bg-slate-50 hover:bg-blue-50 border border-slate-100 hover:border-blue-200 text-slate-700 hover:text-blue-700 font-bold justify-start px-6 rounded-xl transition-all"
                                            >
                                                <Maximize2 size={18} className="mr-3 opacity-50" />
                                                {dim.label}
                                            </Button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-center text-slate-400 font-medium px-4">
                                        Images smaller than the selected resolution will be automatically skipped to preserve quality.
                                    </p>
                                </CardContent>
                            </Card>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3">
                        {directHistory.map((item) => (
                            <Card key={item.id} className="hover:shadow-md transition-all cursor-pointer border-none ring-1 ring-slate-200 overflow-hidden" onClick={() => setActiveResult(item)}>
                                <div className="flex items-center p-4 gap-4 bg-white">
                                    <img src={item.center} className="w-24 h-14 object-cover rounded bg-slate-100" alt="thumb" />
                                    <div className="flex-grow min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">{item.name}</p>
                                        <p className="text-[10px] text-green-600 font-bold uppercase">Ready</p>
                                    </div>
                                    <Maximize2 size={16} className="text-slate-300" />
                                </div>
                            </Card>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="bg-slate-900 border-none shadow-2xl rounded-3xl overflow-hidden ring-1 ring-slate-800">
                        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/40" />
                                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/40" />
                                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/40" />
                            </div>
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Crop Server Log Output</span>
                            <Terminal size={14} className="text-slate-600" />
                        </div>
                        <CardContent className="p-0">
                            <pre className="p-6 text-slate-300 font-mono text-xs leading-relaxed overflow-y-auto max-h-[600px] whitespace-pre-wrap">
                                {logs || "Waiting for log data..."}
                            </pre>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* MODAL VIEW */}
            {activeResult && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-slate-900/95 backdrop-blur-md animate-in fade-in duration-200">
                    <div className="bg-white rounded-[2.5rem] w-full max-w-7xl max-h-full overflow-hidden flex flex-col shadow-2xl">
                        <div className="p-6 border-b flex justify-between items-center bg-white sticky top-0 z-10">
                            <h2 className="font-black text-xl text-slate-800 truncate pr-8">{activeResult.name}</h2>
                            <button onClick={() => setActiveResult(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><X size={24} /></button>
                        </div>

                        <div className="p-8 overflow-y-auto space-y-12">
                            {/* Original Preview (Large) */}
                            {activeResult.original && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Source Image</span>
                                        <div className="h-[1px] flex-grow bg-slate-100" />
                                    </div>
                                    <div className="rounded-3xl overflow-hidden border-4 border-slate-50 shadow-md">
                                        <img src={activeResult.original} className="w-full h-auto max-h-[500px] object-contain bg-slate-900" alt="Original Source" />
                                    </div>
                                </div>
                            )}

                            {/* Cropped Results Grid */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pb-8">
                                <ModalBlock title="Center Balanced Crop" img={activeResult.center} stats={activeResult.centerStats} onDownload={() => download(activeResult.center, 'center', activeResult.name)} />
                                <ModalBlock title="Top Weighted Crop" img={activeResult.top} stats={activeResult.topStats} onDownload={() => download(activeResult.top, 'top', activeResult.name)} />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ModalBlock({ title, img, onDownload, stats }: any) {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-blue-600 tracking-widest">{title}</span>
                    {stats && (
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] font-black text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full w-max border border-emerald-100">
                            <CheckCircle2 size={10} />
                            COMPRESSED: {stats}
                        </div>
                    )}
                </div>
                <Button onClick={onDownload} size="sm" className="bg-blue-600 rounded-xl h-10 px-6">Download HD</Button>
            </div>
            <div className="rounded-2xl overflow-hidden border-4 border-slate-50 shadow-sm ring-1 ring-slate-200 bg-slate-100">
                <img
                    src={img}
                    className="w-full h-auto"
                    alt={title}
                    loading="lazy" // Added lazy loading as these are now heavy HD files
                />
            </div>
        </div>
    );
}