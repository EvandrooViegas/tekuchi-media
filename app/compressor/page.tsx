"use client";

import { useEffect, useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { UploadCloud, File as FileIcon, X, CheckCircle2, XCircle, Loader2, Play, Image as ImageIcon } from "lucide-react";
import { MediaPreview } from "./components/MediaPreview";

const ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".mp4", ".mov", ".avi", ".mkv", ".pdf"];

type TrackedFile = {
    id: string;
    file: File;
    progress: number;
    status: "pending" | "uploading" | "success" | "error";
};

export default function Home() {
    const [jobs, setJobs] = useState<any[]>([]);
    const [systemLogs, setSystemLogs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [stagedFiles, setStagedFiles] = useState<TrackedFile[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [viewingGallery, setViewingGallery] = useState<any | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const fetchLogs = async () => {
        try {
            const res = await fetch("/api/logs");
            const data = await res.json();
            if (!data.error) {
                setJobs(data.jobs || []);
                setSystemLogs(data.systemLogs || []);
            }
        } catch (error) {
            console.error("Failed to fetch logs");
        }
    };

    useEffect(() => {
        fetchLogs();
        const interval = setInterval(fetchLogs, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        if (isRunning) return toast.error("Cannot add files while converter is running.");
        if (e.dataTransfer.files?.length > 0) {
            addFilesToStage(Array.from(e.dataTransfer.files));
        }
    };

    const addFilesToStage = (files: File[]) => {
        const validFiles = files.filter(file => {
            const ext = "." + file.name.split('.').pop()?.toLowerCase();
            const isValid = ALLOWED_EXTS.includes(ext);
            if (!isValid) toast.error(`Unsupported file: ${file.name}`);
            return isValid;
        });

        const newFiles = validFiles.map(file => ({
            id: Math.random().toString(36).substring(7),
            file,
            progress: 0,
            status: "pending" as const,
        }));

        setStagedFiles(prev => [...prev, ...newFiles]);
    };

    const uploadFiles = async () => {
        const toUpload = stagedFiles.filter(f => f.status === "pending");
        if (toUpload.length === 0) return;

        for (const item of toUpload) {
            setStagedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: "uploading" } : f));

            try {
                await new Promise((resolve, reject) => {
                    const xhr = new XMLHttpRequest();
                    xhr.open("POST", `/api/upload?filename=${encodeURIComponent(item.file.name)}`, true);
                    xhr.upload.onprogress = (e) => {
                        if (e.lengthComputable) {
                            const percent = Math.round((e.loaded / e.total) * 100);
                            setStagedFiles(prev => prev.map(f => f.id === item.id ? { ...f, progress: percent } : f));
                        }
                    };
                    xhr.onload = () => (xhr.status === 200 ? resolve(null) : reject());
                    xhr.onerror = () => reject();
                    xhr.send(item.file);
                });
                setStagedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: "success" } : f));
            } catch (error) {
                setStagedFiles(prev => prev.map(f => f.id === item.id ? { ...f, status: "error" } : f));
                toast.error(`Failed: ${item.file.name}`);
            }
        }
        toast.success("All uploads completed.");
        fetchLogs();
    };

    const runConverter = async () => {
        setIsRunning(true);
        toast.info("Converter started...");

        try {
            // 1. Tell the backend to start
            await fetch("/api/run", { method: "POST" });

            // 2. Immediate "Burst" Refresh: Fetch logs every second for 5 seconds 
            // to catch the moment the files move from TODO to Processed.
            let checks = 0;
            const interval = setInterval(() => {
                fetchLogs();
                checks++;
                if (checks > 5) clearInterval(interval);
            }, 1000);

        } catch (error) {
            toast.error("Failed to start converter.");
        } finally {
            // We keep isRunning true for a bit longer to show the "Processing" badge
            setTimeout(() => setIsRunning(false), 2000);
        }
    };

    const formatSize = (kb: number) => {
        if (kb > 1024) return (kb / 1024).toFixed(2) + " MB";
        return kb + " KB";
    };

    return (
        <div className="min-h-screen bg-slate-100 p-4 md:p-8">
            <div className="max-w-7xl mx-auto space-y-6">

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="space-y-6">
                        <Card>
                            <CardHeader><CardTitle>1. Upload Area</CardTitle></CardHeader>
                            <CardContent className="space-y-4">
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={handleDrop}
                                    onClick={() => !isRunning && fileInputRef.current?.click()}
                                    className={`h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer ${isDragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                                >
                                    <UploadCloud className="text-slate-400 mb-2" />
                                    <p className="text-xs font-medium text-slate-600">Click or drag files here</p>
                                    <input
                                        type="file"
                                        multiple
                                        className="hidden"
                                        ref={fileInputRef}
                                        accept={ALLOWED_EXTS.join(",")} // This creates the first barrier
                                        onChange={(e) => e.target.files && addFilesToStage(Array.from(e.target.files))}
                                    />
                                </div>

                                {stagedFiles.length > 0 && (
                                    <ScrollArea className="h-40 border rounded-md p-2 bg-white">
                                        {stagedFiles.map(f => (
                                            <div key={f.id} className="text-[10px] flex items-center justify-between mb-1 p-1 bg-slate-50 rounded">
                                                <span className="truncate w-24">{f.file.name}</span>
                                                {f.status === "uploading" ? <Progress value={f.progress} className="w-12 h-1" /> : <Badge className="text-[8px] h-4" variant={f.status === "success" ? "default" : "secondary"}>{f.status}</Badge>}
                                            </div>
                                        ))}
                                    </ScrollArea>
                                )}

                                <Button className="w-full" onClick={uploadFiles} disabled={stagedFiles.filter(f => f.status === "pending").length === 0}>
                                    Upload Pending Files
                                </Button>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader><CardTitle>2. Process</CardTitle></CardHeader>
                            <CardContent>
                                <Button size="lg" className="w-full bg-blue-600" onClick={runConverter} disabled={isRunning}>
                                    {isRunning ? <Loader2 className="animate-spin mr-2" /> : <Play className="mr-2" />}
                                    Run Converter
                                </Button>

                            </CardContent>
                        </Card>
                    </div>

                    <div className="lg:col-span-2">
                        <Tabs defaultValue="jobs">
                            <TabsList className="mb-4">
                                <TabsTrigger value="jobs">Processed Files</TabsTrigger>
                                <TabsTrigger value="system">Live Terminal</TabsTrigger>
                            </TabsList>

                            <TabsContent value="jobs">
                                <Card>
                                    <ScrollArea className="h-[600px]">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead className="pl-6">File</TableHead>
                                                    <TableHead>Status / Compression</TableHead>
                                                    <TableHead>Outputs</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {/* 1. COMPLETED JOBS: Files already processed by the Python script */}
                                                {jobs.map((job, i) => (
                                                    <TableRow key={i} className="hover:bg-slate-50 transition-colors">
                                                        <TableCell className="pl-6 font-medium text-xs max-w-[200px] truncate" title={job.file}>
                                                            {job.file}
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-col gap-1">
                                                                {job.status === "success" ? (
                                                                    <Badge className="bg-emerald-500 w-fit text-[10px]">Success</Badge>
                                                                ) : job.status === "Original kept (optimal)" ? (
                                                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 border-slate-200 w-fit text-[10px]">
                                                                        Already Optimal
                                                                    </Badge>
                                                                ) : (
                                                                    <Badge variant={job.status.toLowerCase().includes("error") ? "destructive" : "secondary"} className="text-[10px]">
                                                                        {job.status}
                                                                    </Badge>
                                                                )}

                                                                {job.orig_kb && job.final_kb && (
                                                                    <span className="text-[9px] text-slate-500 font-mono">
                                                                        {formatSize(job.orig_kb)} → {formatSize(job.final_kb)}
                                                                        {job.final_kb < job.orig_kb && (
                                                                            <span className="text-emerald-600 ml-1 font-bold">
                                                                                (-{Math.round((1 - job.final_kb / job.orig_kb) * 100)}%)
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-2">
                                                                {job.outputs.filter((f: string) => !f.includes("_thumb_")).map((out: string, idx: number) => {
                                                                    const fileName = out.split(/[\\/]/).pop()!;
                                                                    const ext = fileName.split('.').pop()?.toUpperCase();
                                                                    return (
                                                                        <div key={idx} className="flex flex-col items-center bg-white p-1 border rounded shadow-sm min-w-[65px]">
                                                                            <span className="text-[8px] font-bold text-slate-400 mb-1 tracking-tighter">{ext}</span>
                                                                            <div className="flex items-center gap-1">
                                                                                <MediaPreview filename={fileName} />
                                                                                <a href={`/api/media?file=${fileName}`} className="text-[9px] font-bold bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded transition-colors">
                                                                                    DL
                                                                                </a>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                                {job.outputs.some((f: string) => f.includes("_thumb_")) && (
                                                                    <Button variant="outline" size="sm" className="h-9 text-[10px] border-blue-200 text-blue-600 bg-blue-50/50 hover:bg-blue-50" onClick={() => setViewingGallery(job)}>
                                                                        <ImageIcon className="w-3 h-3 mr-1" /> View Gallery
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}

                                                {/* 2. GHOST ROWS: Files in the upload/queue process */}
                                                {stagedFiles
                                                    .filter(f => !jobs.some(j => j.file === f.file.name)) // Don't show if already in completed jobs
                                                    .map((f) => (
                                                        <TableRow key={f.id} className="opacity-60 bg-slate-50/50 border-l-4 border-l-blue-400">
                                                            <TableCell className="pl-6 font-medium text-xs text-slate-500 italic">
                                                                {f.file.name}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="flex flex-col gap-1">
                                                                    {f.status === "success" ? (
                                                                        <>
                                                                            <Badge variant="outline" className="flex items-center gap-1 bg-white border-blue-200 text-blue-600 text-[10px] animate-pulse">
                                                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                                                Processing...
                                                                            </Badge>
                                                                            <span className="text-[9px] text-slate-400 italic font-mono">
                                                                                Waiting for Python engine...
                                                                            </span>
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            <Badge variant="outline" className="bg-slate-100 text-slate-500 text-[10px]">
                                                                                On Queue
                                                                            </Badge>
                                                                            <span className="text-[9px] text-slate-400 italic font-mono">
                                                                                {f.status === "uploading" ? `Uploading: ${f.progress}%` : "Waiting to upload..."}
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="h-8 w-24 bg-slate-200 rounded-md opacity-20"></div>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                            </TableBody>
                                        </Table>
                                    </ScrollArea>
                                </Card>
                            </TabsContent>

                            <TabsContent value="system">
                                <Card className="bg-slate-950 p-4 h-[600px] font-mono text-xs overflow-y-auto">
                                    {systemLogs.map((line, i) => (
                                        <div key={i} className={line.includes("ERROR") || line.includes("FAILED") ? "text-red-400" : "text-emerald-400"}>{line}</div>
                                    ))}
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
                </div>
            </div>

            {/* GALLERY MODAL */}
            {viewingGallery && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setViewingGallery(null)}>
                    <Card className="w-full max-w-5xl h-[80vh] flex flex-col bg-white" onClick={e => e.stopPropagation()}>
                        <CardHeader className="flex flex-row items-center justify-between border-b">
                            <CardTitle className="text-sm">Video Thumbnails: {viewingGallery.file}</CardTitle>
                            <Button variant="ghost" size="sm" onClick={() => setViewingGallery(null)}><X className="w-4 h-4" /></Button>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {viewingGallery.outputs.filter((f: string) => f.includes("_thumb_")).map((thumb: string, i: number) => {
                                    const thumbName = thumb.split(/[\\/]/).pop();
                                    return (
                                        <div key={i} className="border rounded-lg overflow-hidden bg-slate-50 flex flex-col">
                                            <img src={`/api/media?file=${thumbName}`} className="w-full aspect-video object-cover" alt="thumb" />
                                            <div className="p-2 border-t flex justify-center">
                                                <a href={`/api/media?file=${thumbName}`} download className="text-[10px] font-bold text-blue-600 hover:underline">DOWNLOAD</a>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}