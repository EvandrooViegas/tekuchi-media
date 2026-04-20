'use client';

import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Loader2, 
  UploadCloud, 
  Download, 
  FileText, 
  Trash2, 
  CheckCircle2 
} from "lucide-react";

interface ThumbnailJob {
  id: string;
  fileName: string;
  timestamp: string;
  imageUrl: string; // Now storing the Base64 data string
}

export default function Thumbnailer() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<ThumbnailJob[]>([]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    const formData = new FormData();
    
    // Append all selected files to the "files" key for the Python List[UploadFile]
    Array.from(files).forEach(file => {
      formData.append('files', file);
    });

    try {
      const response = await fetch('/api/thumbnail', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error("Server failed to process files");

      const data = await response.json();

      // Map the results from Python into our history state
      const newJobs: ThumbnailJob[] = data.thumbnails.map((thumb: any) => ({
        id: Math.random().toString(36).substr(2, 9),
        fileName: thumb.fileName,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        imageUrl: thumb.imageData // This is the Base64 string
      }));

      setHistory(prev => [...newJobs, ...prev]);
    } catch (err) {
      console.error(err);
      alert("Failed to generate thumbnails. Check if the Python server is running.");
    } finally {
      setLoading(false);
      // Reset input so the same file can be uploaded again if needed
      e.target.value = '';
    }
  };

  const downloadImage = (base64Url: string, fileName: string) => {
    const link = document.createElement('a');
    link.href = base64Url;
    
    // Clean filename: remove .pdf and swap special chars for underscores
    const cleanName = fileName
      .toLowerCase()
      .replace('.pdf', '')
      .replace(/[^a-z0-9]/gi, '_');
    
    link.download = `thumb_${cleanName}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const clearHistory = () => {
    if (confirm("Clear all generated thumbnails?")) {
      setHistory([]);
    }
  };

  return (
    <div className="h-full flex flex-col p-6 bg-slate-50 overflow-hidden font-sans">
      <div className="max-w-6xl mx-auto w-full flex flex-col h-full gap-6">
        
        {/* Header Logic */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-2xl font-black text-slate-800">PDF Thumbnailer</h1>
            <p className="text-slate-500 text-sm">Convert PDF covers into high-resolution JPEGs</p>
          </div>
          {history.length > 0 && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={clearHistory}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 size={14} className="mr-2" />
              Clear All
            </Button>
          )}
        </div>

        {/* Upload Card */}
        <Card className="border-2 border-dashed border-slate-200 shadow-none bg-white hover:border-blue-400 transition-colors">
          <CardContent className="p-10 flex flex-col items-center">
            <div className="relative group cursor-pointer flex flex-col items-center w-full">
              <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
                {loading ? <Loader2 className="animate-spin" /> : <UploadCloud size={32} />}
              </div>
              <h3 className="font-bold text-slate-800 text-lg">
                {loading ? "Processing Files..." : "Drop PDFs here"}
              </h3>
              <p className="text-sm text-slate-500 mb-2">Select one or multiple documents</p>
              
              <input 
                type="file" 
                multiple 
                accept="application/pdf" 
                className="absolute inset-0 opacity-0 cursor-pointer" 
                onChange={handleUpload}
                disabled={loading}
              />
            </div>
          </CardContent>
        </Card>

        {/* Results Grid */}
        <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">
              Recent Generations
            </h2>
            <div className="h-[1px] flex-grow bg-slate-200" />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-10">
            {history.map((item) => (
              <Card key={item.id} className="group overflow-hidden border-none shadow-sm hover:shadow-md transition-all duration-300 ring-1 ring-slate-200">
                <div className="aspect-[3/4] relative bg-slate-100 overflow-hidden">
                  {/* Using standard img for direct Base64 rendering */}
                  <img 
                    src={item.imageUrl} 
                    alt={item.fileName} 
                    className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-2 right-2">
                    <div className="bg-white/90 backdrop-blur px-2 py-1 rounded-md shadow-sm flex items-center gap-1">
                      <CheckCircle2 size={12} className="text-green-500" />
                      <span className="text-[10px] font-bold text-slate-700">READY</span>
                    </div>
                  </div>
                </div>
                
                <CardContent className="p-4 bg-white border-t flex justify-between items-center">
                  <div className="min-w-0 pr-2">
                    <p className="text-sm font-bold text-slate-800 truncate" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">Generated at {item.timestamp}</p>
                  </div>
                  <button 
                    onClick={() => downloadImage(item.imageUrl, item.fileName)}
                    className="flex-none p-2.5 bg-slate-50 text-slate-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all active:scale-95"
                    title="Download Thumbnail"
                  >
                    <Download size={18} />
                  </button>
                </CardContent>
              </Card>
            ))}

            {history.length === 0 && !loading && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 text-slate-300 border-2 border-dotted border-slate-200 rounded-2xl">
                <FileText size={64} strokeWidth={1} className="mb-4 opacity-50" />
                <p className="font-semibold text-slate-400">Your thumbnail history is empty</p>
                <p className="text-xs">Upload a PDF to see the magic happen</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}