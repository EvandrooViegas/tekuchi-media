"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Download,
  Play,
  Square,
  FileArchive,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { DocsBanner } from "@/components/docs-banner";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const APT_MIN = 45169;
const APT_MAX = 45340;

// How many apartments to process at the same time
const CONCURRENCY = 3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type JobStatus =
  | "queued"
  | "generating_link"
  | "generating_pdf"
  | "downloading_pdf"
  | "done"
  | "error";

type Job = {
  apt: number;
  status: JobStatus;
  /** human-readable status label */
  label: string;
  pdfBlob?: Blob;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(job: Job) {
  switch (job.status) {
    case "queued":
      return (
        <Badge variant="outline" className="text-slate-500 gap-1">
          <Clock className="size-3" />
          Queued
        </Badge>
      );
    case "generating_link":
      return (
        <Badge
          variant="outline"
          className="border-blue-300 text-blue-600 gap-1 animate-pulse"
        >
          <Loader2 className="size-3 animate-spin" />
          Generating Link
        </Badge>
      );
    case "generating_pdf":
      return (
        <Badge
          variant="outline"
          className="border-amber-300 text-amber-600 gap-1 animate-pulse"
        >
          <Loader2 className="size-3 animate-spin" />
          Generating PDF
        </Badge>
      );
    case "downloading_pdf":
      return (
        <Badge
          variant="outline"
          className="border-violet-300 text-violet-600 gap-1 animate-pulse"
        >
          <Loader2 className="size-3 animate-spin" />
          Downloading PDF
        </Badge>
      );
    case "done":
      return (
        <Badge className="bg-emerald-500 text-white gap-1">
          <CheckCircle2 className="size-3" />
          Done
        </Badge>
      );
    case "error":
      return (
        <Badge variant="destructive" className="gap-1" title={job.error}>
          <XCircle className="size-3" />
          Error
        </Badge>
      );
  }
}

function elapsed(job: Job): string {
  if (!job.startedAt) return "—";
  const end = job.finishedAt ?? Date.now();
  const secs = Math.round((end - job.startedAt) / 1000);
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

// ---------------------------------------------------------------------------
// Page Component
// ---------------------------------------------------------------------------

export default function PdfBulkDownloaderPage() {
  const [rangeFrom, setRangeFrom] = useState<number>(APT_MIN);
  const [rangeTo, setRangeTo] = useState<number>(APT_MAX);

  const [jobs, setJobs] = useState<Job[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  // Abort controller so we can cancel in-flight requests
  const abortRef = useRef<AbortController | null>(null);
  // Track whether the run was stopped by the user
  const stoppedRef = useRef(false);

  // -------------------------------------------------------------------------
  // Derived stats
  // -------------------------------------------------------------------------

  const total = jobs.length;
  const done = jobs.filter((j) => j.status === "done").length;
  const errors = jobs.filter((j) => j.status === "error").length;
  const inProgress = jobs.filter(
    (j) =>
      j.status === "generating_link" ||
      j.status === "generating_pdf" ||
      j.status === "downloading_pdf"
  ).length;
  const progress = total > 0 ? Math.round(((done + errors) / total) * 100) : 0;

  // -------------------------------------------------------------------------
  // Setters that patch a single job by apartment number
  // -------------------------------------------------------------------------

  const patchJob = useCallback(
    (apt: number, patch: Partial<Job>) => {
      setJobs((prev) =>
        prev.map((j) => (j.apt === apt ? { ...j, ...patch } : j))
      );
    },
    []
  );

  // -------------------------------------------------------------------------
  // Single-job processor
  // -------------------------------------------------------------------------

  async function processJob(
    apt: number,
    signal: AbortSignal
  ): Promise<void> {
    // Step 1 — build the link (instant, just a template substitution)
    patchJob(apt, {
      status: "generating_link",
      label: "Building docgen URL…",
      startedAt: Date.now(),
    });

    await sleep(300); // small UI tick so user sees the state

    if (signal.aborted) return;

    // Step 2 — ask our proxy to fetch the page and poll until the PDF is ready
    patchJob(apt, {
      status: "generating_pdf",
      label: "Waiting for PDF to be generated…",
    });

    let pdfBlob: Blob;
    try {
      // Step 3 — the proxy handles polling + downloading; once it responds, we have the PDF
      patchJob(apt, {
        status: "downloading_pdf",
        label: "Downloading PDF…",
      });

      const res = await fetch(`/api/pdf-proxy?apt=${apt}`, { signal });

      if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
          const body = await res.json();
          errMsg = body.error ?? errMsg;
        } catch {
          // ignore
        }
        throw new Error(errMsg);
      }

      pdfBlob = await res.blob();
    } catch (err: any) {
      if (err?.name === "AbortError") {
        patchJob(apt, {
          status: "error",
          label: "Cancelled",
          error: "Cancelled by user",
          finishedAt: Date.now(),
        });
        return;
      }
      patchJob(apt, {
        status: "error",
        label: "Failed",
        error: err?.message ?? "Unknown error",
        finishedAt: Date.now(),
      });
      return;
    }

    patchJob(apt, {
      status: "done",
      label: "Complete",
      pdfBlob,
      finishedAt: Date.now(),
    });
  }

  // -------------------------------------------------------------------------
  // Run all jobs with concurrency limiting
  // -------------------------------------------------------------------------

  async function handleStart() {
    if (rangeFrom > rangeTo) {
      toast.error("'From' must be less than or equal to 'To'.");
      return;
    }
    if (rangeTo - rangeFrom > 500) {
      toast.error("Range too large. Maximum is 500 apartments at once.");
      return;
    }

    stoppedRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // Build the job list
    const newJobs: Job[] = [];
    for (let apt = rangeFrom; apt <= rangeTo; apt++) {
      newJobs.push({ apt, status: "queued", label: "Waiting…" });
    }
    setJobs(newJobs);
    setIsRunning(true);

    toast.info(`Starting ${newJobs.length} jobs (${CONCURRENCY} concurrent)…`);

    const queue = newJobs.map((j) => j.apt);
    let idx = 0;

    async function worker() {
      while (idx < queue.length) {
        if (stoppedRef.current || controller.signal.aborted) break;
        const apt = queue[idx++];
        await processJob(apt, controller.signal);
      }
    }

    // Spawn CONCURRENCY workers
    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && i < queue.length; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    setIsRunning(false);

    if (!stoppedRef.current) {
      const doneCount = newJobs.length; // re-read from ref below
      toast.success("All jobs completed. You can now download the ZIP.");
    }
  }

  function handleStop() {
    stoppedRef.current = true;
    abortRef.current?.abort();
    setIsRunning(false);
    toast.warning("Jobs stopped by user.");
  }

  // -------------------------------------------------------------------------
  // Download individual PDF
  // -------------------------------------------------------------------------

  function downloadSingle(job: Job) {
    if (!job.pdfBlob) return;
    const url = URL.createObjectURL(job.pdfBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apartment-${job.apt}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // -------------------------------------------------------------------------
  // Download all as ZIP (using dynamic import so jszip loads lazily)
  // -------------------------------------------------------------------------

  async function handleDownloadZip() {
    const completedJobs = jobs.filter((j) => j.status === "done" && j.pdfBlob);
    if (completedJobs.length === 0) {
      toast.error("No completed PDFs to zip.");
      return;
    }

    setIsZipping(true);
    toast.info(`Building ZIP with ${completedJobs.length} PDFs…`);

    try {
      // Dynamically import jszip so it doesn't bloat the initial bundle
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();

      for (const job of completedJobs) {
        zip.file(`apartment-${job.apt}.pdf`, job.pdfBlob!);
      }

      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 6 },
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `apartments-${rangeFrom}-${rangeTo}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      toast.success("ZIP downloaded successfully.");
    } catch (err: any) {
      toast.error("Failed to create ZIP: " + (err?.message ?? "Unknown error"));
    } finally {
      setIsZipping(false);
    }
  }

  // -------------------------------------------------------------------------
  // Retry failed jobs
  // -------------------------------------------------------------------------

  async function handleRetryFailed() {
    const failedJobs = jobs.filter((j) => j.status === "error");
    if (failedJobs.length === 0) {
      toast.info("No failed jobs to retry.");
      return;
    }

    stoppedRef.current = false;
    const controller = new AbortController();
    abortRef.current = controller;

    // Reset failed jobs to queued
    setJobs((prev) =>
      prev.map((j) =>
        j.status === "error" ? { ...j, status: "queued", label: "Waiting…", error: undefined } : j
      )
    );

    setIsRunning(true);
    toast.info(`Retrying ${failedJobs.length} failed jobs…`);

    const queue = failedJobs.map((j) => j.apt);
    let idx = 0;

    async function worker() {
      while (idx < queue.length) {
        if (stoppedRef.current || controller.signal.aborted) break;
        const apt = queue[idx++];
        await processJob(apt, controller.signal);
      }
    }

    const workers: Promise<void>[] = [];
    for (let i = 0; i < CONCURRENCY && i < queue.length; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);
    setIsRunning(false);
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const aptCount = rangeTo >= rangeFrom ? rangeTo - rangeFrom + 1 : 0;

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* ------------------------------------------------------------------ */}
        {/* Header                                                              */}
        {/* ------------------------------------------------------------------ */}
        <div>
          <h2 className="text-xl font-bold text-slate-800">PDF Bulk Downloader</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Select a range of apartment numbers, generate their PDFs via docgen, and download
            everything as a ZIP archive.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ---------------------------------------------------------------- */}
          {/* Left panel — controls                                             */}
          {/* ---------------------------------------------------------------- */}
          <div className="space-y-4">

            {/* Range selector */}
            <Card>
              <CardHeader>
                <CardTitle>1. Select Range</CardTitle>
                <CardDescription>
                  Apartments {APT_MIN.toLocaleString()} – {APT_MAX.toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      From
                    </label>
                    <input
                      type="number"
                      min={APT_MIN}
                      max={APT_MAX}
                      value={rangeFrom}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) setRangeFrom(Math.max(APT_MIN, Math.min(APT_MAX, v)));
                      }}
                      disabled={isRunning}
                      className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      To
                    </label>
                    <input
                      type="number"
                      min={APT_MIN}
                      max={APT_MAX}
                      value={rangeTo}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10);
                        if (!isNaN(v)) setRangeTo(Math.max(APT_MIN, Math.min(APT_MAX, v)));
                      }}
                      disabled={isRunning}
                      className="w-full border border-slate-200 rounded-md px-3 py-1.5 text-sm font-mono bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    />
                  </div>
                </div>

                {/* Range slider */}
                <div className="space-y-2 pt-1">
                  <div className="flex justify-between text-[10px] text-slate-400">
                    <span>{APT_MIN.toLocaleString()}</span>
                    <span className="font-semibold text-blue-600">
                      {aptCount} apartment{aptCount !== 1 ? "s" : ""}
                    </span>
                    <span>{APT_MAX.toLocaleString()}</span>
                  </div>
                  {/* Visual range bar */}
                  <div className="relative h-2 bg-slate-200 rounded-full">
                    <div
                      className="absolute h-2 bg-blue-500 rounded-full transition-all"
                      style={{
                        left: `${((rangeFrom - APT_MIN) / (APT_MAX - APT_MIN)) * 100}%`,
                        right: `${100 - ((rangeTo - APT_MIN) / (APT_MAX - APT_MIN)) * 100}%`,
                      }}
                    />
                  </div>
                  {/* Quick presets */}
                  <div className="flex gap-1 flex-wrap pt-1">
                    {[
                      { label: "All", from: APT_MIN, to: APT_MAX },
                      { label: "First 10", from: APT_MIN, to: APT_MIN + 9 },
                      { label: "First 50", from: APT_MIN, to: APT_MIN + 49 },
                      { label: "First 100", from: APT_MIN, to: APT_MIN + 99 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        disabled={isRunning}
                        onClick={() => {
                          setRangeFrom(p.from);
                          setRangeTo(Math.min(p.to, APT_MAX));
                        }}
                        className="text-[10px] px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-colors"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Run / Stop */}
            <Card>
              <CardHeader>
                <CardTitle>2. Run</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!isRunning ? (
                  <Button
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    size="lg"
                    onClick={handleStart}
                    disabled={aptCount === 0}
                  >
                    <Play className="mr-2 size-4" />
                    Start ({aptCount} PDFs)
                  </Button>
                ) : (
                  <Button
                    className="w-full bg-red-600 hover:bg-red-700 text-white"
                    size="lg"
                    onClick={handleStop}
                  >
                    <Square className="mr-2 size-4" />
                    Stop Jobs
                  </Button>
                )}

                {errors > 0 && !isRunning && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={handleRetryFailed}
                  >
                    <RefreshCw className="mr-2 size-4" />
                    Retry {errors} Failed
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Download ZIP */}
            <Card>
              <CardHeader>
                <CardTitle>3. Download ZIP</CardTitle>
              </CardHeader>
              <CardContent>
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={handleDownloadZip}
                  disabled={done === 0 || isZipping}
                >
                  {isZipping ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : (
                    <FileArchive className="mr-2 size-4" />
                  )}
                  {isZipping
                    ? "Building ZIP…"
                    : `Download ZIP (${done} PDF${done !== 1 ? "s" : ""})`}
                </Button>
              </CardContent>
            </Card>

            {/* Stats summary */}
            {total > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <div className="space-y-3">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span>Overall Progress</span>
                      <span className="font-mono font-semibold">
                        {done + errors}/{total}
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                      <div className="bg-emerald-50 border border-emerald-100 rounded-md p-2">
                        <div className="font-bold text-emerald-600 text-base">{done}</div>
                        <div className="text-slate-500">Done</div>
                      </div>
                      <div className="bg-blue-50 border border-blue-100 rounded-md p-2">
                        <div className="font-bold text-blue-600 text-base">{inProgress}</div>
                        <div className="text-slate-500">Running</div>
                      </div>
                      <div className="bg-red-50 border border-red-100 rounded-md p-2">
                        <div className="font-bold text-red-600 text-base">{errors}</div>
                        <div className="text-slate-500">Failed</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Right panel — job table                                          */}
          {/* ---------------------------------------------------------------- */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle>Job Queue</CardTitle>
                  {total > 0 && (
                    <span className="text-[10px] text-slate-400 font-mono">
                      {total} jobs
                    </span>
                  )}
                </div>
              </CardHeader>
              <ScrollArea className="h-[calc(100vh-220px)]">
                {total === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-2">
                    <FileArchive className="size-10 opacity-30" />
                    <p className="text-sm">No jobs yet. Select a range and hit Start.</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Apartment</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Details</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead className="text-right pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {jobs.map((job) => (
                        <TableRow
                          key={job.apt}
                          className={
                            job.status === "done"
                              ? "bg-emerald-50/40"
                              : job.status === "error"
                              ? "bg-red-50/40"
                              : ""
                          }
                        >
                          <TableCell className="pl-4 font-mono font-semibold text-slate-700">
                            #{job.apt}
                          </TableCell>
                          <TableCell>{statusBadge(job)}</TableCell>
                          <TableCell className="text-[10px] text-slate-500 max-w-[180px] truncate">
                            {job.error ? (
                              <span className="text-red-500 flex items-center gap-1">
                                <AlertTriangle className="size-3 shrink-0" />
                                {job.error}
                              </span>
                            ) : (
                              job.label
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-[10px] text-slate-400">
                            {elapsed(job)}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            {job.status === "done" && job.pdfBlob && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={() => downloadSingle(job)}
                                className="text-[10px] border-blue-200 text-blue-600 hover:bg-blue-50"
                              >
                                <Download className="size-3 mr-1" />
                                PDF
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </Card>
          </div>
        </div>

        <DocsBanner
          docFile="07_PDF_BULK_DOWNLOADER"
          explanation="Bulk download apartment PDFs via docgen — select a range, run the queue, and export everything as a single ZIP archive."
        />

      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
