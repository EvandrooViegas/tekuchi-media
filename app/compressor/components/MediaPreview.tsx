// components/MediaPreview.tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

interface MediaPreviewProps {
  /** Full relative path from PROCESSED root, e.g. "42_12_1.jpg/42_12_1_1080p.jpg"
   *  or a flat filename for legacy video thumbnails. */
  filename: string;
}

export function MediaPreview({ filename }: MediaPreviewProps) {
  // Normalise separators, then derive display name and extension
  const relPath   = filename.replace(/\\/g, '/');
  const basename  = relPath.split('/').pop() ?? relPath;
  const ext       = basename.split('.').pop()?.toLowerCase() ?? '';

  // Always pass the full relative path so the API can find files inside subfolders
  const url = `/api/media?file=${encodeURIComponent(relPath)}`;

  let content: React.ReactNode = null;
  if (['mp4', 'webm'].includes(ext)) {
    content = <video src={url} controls className="w-full max-h-[75vh] rounded-md" autoPlay />;
  } else if (['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
    content = <img src={url} alt={basename} className="w-full object-contain max-h-[75vh] rounded-md" />;
  } else if (ext === 'pdf') {
    content = <iframe src={url} className="w-full h-[75vh] rounded-md border-0" title={basename} />;
  } else {
    content = <div className="p-8 text-center text-slate-500">Preview not available for this file type.</div>;
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button className="text-xs bg-slate-900 hover:bg-slate-800 text-white px-2 py-1 rounded transition-colors">
          View
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-full p-2 border-0 bg-slate-950/90 backdrop-blur-sm">
        <DialogHeader className="p-4 pb-0">
          <DialogTitle className="text-slate-200">{basename}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center p-4">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}
