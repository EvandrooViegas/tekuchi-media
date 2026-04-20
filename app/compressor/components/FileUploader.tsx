// components/FileUploader.tsx
"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { toast } from "sonner"; // <-- Simpler import!
import { UploadCloud, X, File as FileIcon } from "lucide-react";

export function FileUploader() {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // --- Drag and Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
  };

  // --- File Selection Handlers ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      setSelectedFiles((prev) => [...prev, ...filesArray]);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (indexToRemove: number) => {
    setSelectedFiles((prev) => prev.filter((_, index) => index !== indexToRemove));
  };

  // --- Upload Logic ---
  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;
    setUploading(true);

    let successCount = 0;
    let failCount = 0;

    for (const file of selectedFiles) {
      try {
        const res = await fetch(`/api/upload?filename=${encodeURIComponent(file.name)}`, {
          method: "POST",
          body: file,
        });
        
        if (res.ok) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
    }

    setUploading(false);
    setSelectedFiles([]); 
    router.refresh(); 

    // --- The New Sonner Toasts ---
    if (failCount === 0) {
      toast.success("Upload Complete!", {
        description: `Successfully streamed ${successCount} file(s) to the processing queue.`,
      });
    } else {
      toast.error("Upload Finished with Errors", {
        description: `${successCount} succeeded, ${failCount} failed to upload.`,
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Dropzone Area */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center w-full h-40 px-4 py-6 text-center border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-50/50"
            : "border-slate-300 hover:bg-slate-50 bg-white"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
      >
        <UploadCloud className={`w-10 h-10 mb-2 ${isDragging ? "text-blue-500" : "text-slate-400"}`} />
        <p className="text-sm text-slate-600 font-medium">
          {isDragging ? "Drop files here!" : "Click or drag files to stage"}
        </p>
        <p className="text-xs text-slate-400 mt-1">Supports multiple files</p>
        
        <input
          type="file"
          multiple
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileSelect}
        />
      </div>

      {/* Staged Files List */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {selectedFiles.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="flex items-center justify-between p-2 text-sm bg-slate-50 border border-slate-200 rounded-md"
            >
              <div className="flex items-center space-x-2 overflow-hidden text-slate-700">
                <FileIcon className="w-4 h-4 flex-shrink-0 text-slate-400" />
                <span className="truncate">{file.name}</span>
                <span className="text-xs text-slate-400 flex-shrink-0">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFile(index)}
                disabled={uploading}
                className="p-1 ml-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload Action Button */}
      <Button
        className="w-full"
        disabled={selectedFiles.length === 0 || uploading}
        onClick={handleUpload}
      >
        {uploading
          ? `Uploading ${selectedFiles.length} file(s)...`
          : `Upload ${selectedFiles.length} File(s) to Server`}
      </Button>
    </div>
  );
}