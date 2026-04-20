// components/MediaPreview.tsx
"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

export function MediaPreview({ filename }: { filename: string }) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const url = `/api/media?file=${filename}`;

  // Decide how to render the file based on its extension
  let content = null;
  if (['mp4', 'webm'].includes(ext)) {
    content = <video src={url} controls className="w-full max-h-[75vh] rounded-md" autoPlay />;
  } else if (['jpg', 'jpeg', 'png'].includes(ext)) {
    content = <img src={url} alt={filename} className="w-full object-contain max-h-[75vh] rounded-md" />;
  } else if (ext === 'pdf') {
    content = <iframe src={url} className="w-full h-[75vh] rounded-md border-0" />;
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
          <DialogTitle className="text-slate-200">{filename}</DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-center p-4">
           {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}