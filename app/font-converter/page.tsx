'use client';

import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  UploadCloud,
  Loader2,
  Download,
  Trash2,
  Type,
  CheckCircle2,
  XCircle,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { DocsBanner } from '@/components/docs-banner';

// ── Types ──────────────────────────────────────────────────────────────────────

type FontStatus = 'pending' | 'converting' | 'done' | 'error';

interface FontJob {
  id: string;
  file: File;
  status: FontStatus;
  formats: string[];
  errors: string[];
  zipBlob?: Blob;
}

const FORMAT_COLORS: Record<string, string> = {
  ttf:   'bg-blue-100 text-blue-700 border-blue-200',
  woff:  'bg-violet-100 text-violet-700 border-violet-200',
  woff2: 'bg-purple-100 text-purple-700 border-purple-200',
  svg:   'bg-amber-100 text-amber-700 border-amber-200',
  eot:   'bg-slate-100 text-slate-600 border-slate-200',
};

const ALL_FORMATS = ['ttf', 'woff', 'woff2', 'svg', 'eot'];

// ── Component ──────────────────────────────────────────────────────────────────

export default function FontConverterPage() {
  const [jobs, setJobs] = useState<FontJob[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────────────

  const addFiles = (files: FileList | File[]) => {
    const arr = Array.from(files);
    const valid = arr.filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase();
      if (ext !== 'otf' && ext !== 'ttf') {
        toast.error(`Unsupported file: ${f.name} — only .otf and .ttf are accepted`);
        return false;
      }
      return true;
    });

    if (valid.length === 0) return;

    const newJobs: FontJob[] = valid.map((f) => ({
      id: Math.random().toString(36).slice(2, 11),
      file: f,
      status: 'pending',
      formats: [],
      errors: [],
    }));

    setJobs((prev) => [...prev, ...newJobs]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      e.target.value = '';
    }
  };

  const removeJob = (id: string) => {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  };

  const clearAll = () => {
    if (confirm('Remove all fonts from the list?')) setJobs([]);
  };

  // ── Conversion ───────────────────────────────────────────────────────────────

  const convertAll = async () => {
    const pending = jobs.filter((j) => j.status === 'pending');
    if (pending.length === 0) return;

    // Mark all pending as converting
    setJobs((prev) =>
      prev.map((j) => (j.status === 'pending' ? { ...j, status: 'converting' } : j))
    );

    for (const job of pending) {
      const formData = new FormData();
      formData.append('files', job.file, job.file.name);

      try {
        const res = await fetch('/api/font', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Unknown error' }));
          setJobs((prev) =>
            prev.map((j) =>
              j.id === job.id
                ? { ...j, status: 'error', errors: [err.error ?? 'Conversion failed'] }
                : j
            )
          );
          toast.error(`Failed: ${job.file.name}`);
          continue;
        }

        const blob = await res.blob();

        // Parse the result header to know which formats succeeded
        const resultHeader = res.headers.get('X-Conversion-Results') ?? '';
        let formats: string[] = ALL_FORMATS;
        let errors: string[] = [];
        try {
          // The header is a Python repr of a list of dicts — parse it safely
          // by looking for the formats array in the first result object
          const fmtMatch = resultHeader.match(/'formats':\s*\[([^\]]*)\]/);
          if (fmtMatch) {
            formats = fmtMatch[1]
              .split(',')
              .map((s) => s.trim().replace(/'/g, ''))
              .filter(Boolean);
          }
          const errMatch = resultHeader.match(/'errors':\s*\[([^\]]*)\]/);
          if (errMatch) {
            errors = errMatch[1]
              .split(',')
              .map((s) => s.trim().replace(/'/g, ''))
              .filter(Boolean);
          }
        } catch {
          // header parse failed — assume all formats succeeded
        }

        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, status: 'done', formats, errors, zipBlob: blob }
              : j
          )
        );
        toast.success(`Converted: ${job.file.name}`);
      } catch {
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id
              ? { ...j, status: 'error', errors: ['Network error — is the server running?'] }
              : j
          )
        );
        toast.error(`Error: ${job.file.name}`);
      }
    }
  };

  // ── Download helpers ─────────────────────────────────────────────────────────

  const downloadZip = (job: FontJob) => {
    if (!job.zipBlob) return;
    const url = URL.createObjectURL(job.zipBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${job.file.name.replace(/\.[^.]+$/, '')}_fonts.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Derived state ────────────────────────────────────────────────────────────

  const pendingCount   = jobs.filter((j) => j.status === 'pending').length;
  const convertingCount = jobs.filter((j) => j.status === 'converting').length;
  const isConverting   = convertingCount > 0;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col p-6 bg-slate-50 overflow-hidden font-sans">
      <div className="max-w-5xl mx-auto w-full flex flex-col h-full gap-6">

        {/* Header */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Font Converter</h1>
            <p className="text-slate-500 text-sm">
              Convert OTF / TTF fonts into EOT, SVG, TTF, WOFF &amp; WOFF2
            </p>
          </div>
          {jobs.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearAll}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} className="mr-2" />
              Clear All
            </Button>
          )}
        </div>

        {/* Drop Zone */}
        <Card
          className={`border-2 border-dashed shadow-none bg-white transition-colors ${
            isDragging ? 'border-slate-800 bg-slate-50' : 'border-slate-200 hover:border-slate-800'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <CardContent className="p-10 flex flex-col items-center cursor-pointer select-none">
            <div className="w-16 h-16 bg-slate-50 border border-slate-200/60 rounded-full flex items-center justify-center text-slate-800 mb-4 group-hover:scale-110 transition-transform">
              <Type size={32} />
            </div>
            <h3 className="font-bold text-slate-800 text-lg">Drop fonts here</h3>
            <p className="text-sm text-slate-500">Accepts .otf and .ttf files — multiple at once</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".otf,.ttf"
              className="hidden"
              onChange={handleInputChange}
            />
          </CardContent>
        </Card>

        {/* Convert Button */}
        {pendingCount > 0 && (
          <Button
            className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm"
            onClick={convertAll}
            disabled={isConverting}
          >
            {isConverting ? (
              <><Loader2 size={16} className="mr-2 animate-spin" /> Converting…</>
            ) : (
              <><UploadCloud size={16} className="mr-2" /> Convert {pendingCount} font{pendingCount !== 1 ? 's' : ''}</>
            )}
          </Button>
        )}

        {/* Job List */}
        <div className="flex-grow overflow-y-auto pr-1 custom-scrollbar">
          {jobs.length > 0 && (
            <>
              <div className="flex items-center gap-2 mb-4">
                <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
                  Queue
                </h2>
                <div className="h-[1px] flex-grow bg-slate-200" />
              </div>

              <div className="space-y-3 pb-10">
                {jobs.map((job) => (
                  <Card
                    key={job.id}
                    className="border-none shadow-sm ring-1 ring-slate-200 bg-white overflow-hidden"
                  >
                    <CardContent className="p-4 flex items-center gap-4">
                      {/* Icon */}
                      <div className="flex-none w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                        {job.status === 'converting' ? (
                          <Loader2 size={20} className="text-blue-500 animate-spin" />
                        ) : job.status === 'done' ? (
                          <CheckCircle2 size={20} className="text-emerald-500" />
                        ) : job.status === 'error' ? (
                          <XCircle size={20} className="text-red-500" />
                        ) : (
                          <Type size={20} className="text-slate-400" />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-grow min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate" title={job.file.name}>
                          {job.file.name}
                        </p>

                        {/* Status line */}
                        {job.status === 'pending' && (
                          <p className="text-[11px] text-slate-400 font-medium">Ready to convert</p>
                        )}
                        {job.status === 'converting' && (
                          <p className="text-[11px] text-blue-500 font-medium animate-pulse">Converting…</p>
                        )}
                        {job.status === 'error' && (
                          <p className="text-[11px] text-red-500 font-medium truncate">
                            {job.errors[0] ?? 'Conversion failed'}
                          </p>
                        )}

                        {/* Format badges */}
                        {job.status === 'done' && job.formats.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-1.5">
                            {job.formats.map((fmt) => (
                              <span
                                key={fmt}
                                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                  FORMAT_COLORS[fmt] ?? 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {fmt}
                              </span>
                            ))}
                            {job.errors.length > 0 && (
                              <span className="text-[10px] font-medium text-red-400 self-center">
                                ({job.errors.length} format{job.errors.length !== 1 ? 's' : ''} failed)
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex-none flex items-center gap-2">
                        {job.status === 'done' && job.zipBlob && (
                          <Button
                            size="sm"
                            className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 rounded-xl"
                            onClick={() => downloadZip(job)}
                          >
                            <Download size={14} className="mr-1.5" />
                            Download ZIP
                          </Button>
                        )}
                        <button
                          onClick={() => removeJob(job.id)}
                          className="p-2 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-lg transition-colors"
                          title="Remove"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}

          {/* Empty state */}
          {jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-slate-300 border-2 border-dotted border-slate-200 rounded-2xl">
              <Type size={64} strokeWidth={1} className="mb-4 opacity-50" />
              <p className="font-semibold text-slate-400">No fonts queued yet</p>
              <p className="text-xs">Drop an OTF or TTF file above to get started</p>
            </div>
          )}
        </div>

        {/* Format legend */}
        <div className="flex-none flex flex-wrap gap-3 pt-2 border-t border-slate-100">
          {ALL_FORMATS.map((fmt) => (
            <div key={fmt} className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full border ${
                  FORMAT_COLORS[fmt]
                }`}
              >
                {fmt}
              </span>
              <span className="text-[10px] text-slate-400">
                {fmt === 'ttf'   && 'TrueType / OpenType'}
                {fmt === 'woff'  && 'Web Open Font (compressed)'}
                {fmt === 'woff2' && 'Web Open Font 2 (Brotli)'}
                {fmt === 'svg'   && 'SVG Font (legacy iOS)'}
                {fmt === 'eot'   && 'Embedded OpenType (IE ≤ 8)'}
              </span>
            </div>
          ))}
        </div>

        <DocsBanner 
          docFile="03_FONT_CONVERTER"
          explanation="Convert font files (.OTF, .TTF) into a single optimized web bundle containing TTF, WOFF, WOFF2, SVG, and EOT formats."
        />
      </div>
    </div>
  );
}
