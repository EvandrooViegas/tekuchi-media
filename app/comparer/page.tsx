'use client';

import { useState, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Loader2, 
  UploadCloud, 
  FileEdit, 
  RefreshCcw, 
  ImageIcon, 
  Type, 
  MousePointer2, 
  FileSearch,
  FileVideo
} from "lucide-react";

// PDF Viewer Imports
import { Worker, Viewer } from '@react-pdf-viewer/core';
import { pageNavigationPlugin } from '@react-pdf-viewer/page-navigation';

// Styles
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/page-navigation/lib/styles/index.css';
import { usePathname } from 'next/navigation';

interface Change {
  type: 'text' | 'image';
  section: string;
  description: string;
}

interface DiffResult {
  changes: Change[];
}


export default function PDFComparator() {
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DiffResult | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
const pathname = usePathname();
  // Initialize Navigation Plugins
  const navPluginA = pageNavigationPlugin();
  const navPluginB = pageNavigationPlugin();
  
  // Destructure the jump function directly
  const { jumpToPage: jumpA } = navPluginA;
  const { jumpToPage: jumpB } = navPluginB;

  const urls = useMemo(() => ({
    u1: file1 ? URL.createObjectURL(file1) : '',
    u2: file2 ? URL.createObjectURL(file2) : ''
  }), [file1, file2]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file1 || !file2) return;

    setLoading(true);
    setResult(null);
    setActiveIndex(null);

    const formData = new FormData();
    formData.append('file1', file1);
    formData.append('file2', file2);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      const cleanData = data.result ? data.result : data;
      setResult(cleanData);
    } catch (error) {
      alert("Error connecting to Python service.");
    } finally {
      setLoading(false);
    }
  };

  const handleJumpToChange = (change: Change, index: number) => {
    setActiveIndex(index);
    
    // Parse "Página X" or similar to get the number
    const pageMatch = change.section.match(/\d+/);
    if (pageMatch) {
      const pageNumber = parseInt(pageMatch[0], 10) - 1; 
      // The plugin handles the scrolling within the viewer component automatically
      jumpA(pageNumber);
      jumpB(pageNumber);
    }
  };

  return (
    <main className="h-screen bg-slate-50 overflow-hidden flex flex-col p-6 font-sans">
      <div className="max-w-[1700px] w-full mx-auto flex flex-col h-full space-y-4">
        
  
        {!result ? (
          <div className="flex-grow flex items-center justify-center">
            <Card className="w-full max-w-4xl border-none shadow-md">
              <CardContent className="p-10">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="border-2 border-dashed p-10 rounded-xl flex flex-col items-center bg-slate-50 relative group hover:border-blue-400 transition-colors">
                      <UploadCloud className="text-slate-400 mb-2" />
                      <span className="text-xs font-bold uppercase text-slate-500">Original (A)</span>
                      <span className="text-xs mt-2 truncate max-w-full italic">{file1?.name || "Select PDF"}</span>
                      <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFiles(e.target.files?.[0], setFile1)} />
                    </div>
                    <div className="border-2 border-dashed p-10 rounded-xl flex flex-col items-center bg-slate-50 relative group hover:border-blue-400 transition-colors">
                      <UploadCloud className="text-slate-400 mb-2" />
                      <span className="text-xs font-bold uppercase text-slate-500">Revised (B)</span>
                      <span className="text-xs mt-2 truncate max-w-full italic">{file2?.name || "Select PDF"}</span>
                      <input type="file" accept="application/pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => setFiles(e.target.files?.[0], setFile2)} />
                    </div>
                  </div>
                  <Button className="w-full h-14 text-lg bg-blue-600 hover:bg-blue-700" disabled={loading}>
                    {loading ? <Loader2 className="animate-spin mr-2" /> : "Compare & Navigate"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        ) : (
          /* MAIN CONTENT AREA - Expands to fill remaining height */
          <div className="flex-grow flex gap-6 min-h-0">
            
            {/* SIDEBAR - Fixed Width, Internal Scroll */}
            <aside className="w-80 flex-none flex flex-col gap-3 min-h-0">
              <div className="bg-blue-600 text-white p-3 rounded-lg text-xs font-bold flex justify-between items-center shadow-md">
                <span>{result?.changes?.length || 0} CHANGES FOUND</span>
                <MousePointer2 className="w-3 h-3" />
              </div>

              <div className="flex-grow overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                {result?.changes?.map((change, i) => (
                  <button
                    key={i}
                    onClick={() => handleJumpToChange(change, i)}
                    className={`w-full text-left p-4 rounded-xl border transition-all flex flex-col gap-2 ${
                      activeIndex === i 
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-100' 
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-sm'
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded flex items-center gap-1 ${
                        change.type === 'text' ? 'bg-orange-100 text-orange-700' : 'bg-purple-100 text-purple-700'
                      }`}>
                        {change.type === 'text' ? <Type size={10}/> : <ImageIcon size={10}/>}
                        {change.type.toUpperCase()}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">{change.section}</span>
                    </div>
                    <p className="text-sm font-medium text-slate-700 leading-snug">{change.description}</p>
                  </button>
                ))}
              </div>
            </aside>

            {/* VIEWERS - Flex Grow, Internal Scroll */}
            <div className="flex-grow grid grid-cols-2 gap-4 bg-slate-200 p-2 rounded-xl min-h-0">
              <div className="flex flex-col bg-white rounded-lg overflow-hidden border shadow-sm">
                <div className="flex-none bg-slate-800 text-white text-[10px] font-bold p-2 text-center uppercase tracking-widest">Document A</div>
                <div className="flex-grow overflow-hidden relative">
                   <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                    <Viewer fileUrl={urls.u1} plugins={[navPluginA]} />
                  </Worker>
                </div>
              </div>
              <div className="flex flex-col bg-white rounded-lg overflow-hidden border shadow-sm">
                <div className="flex-none bg-slate-800 text-white text-[10px] font-bold p-2 text-center uppercase tracking-widest">Document B</div>
                <div className="flex-grow overflow-hidden relative">
                  <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js">
                    <Viewer fileUrl={urls.u2} plugins={[navPluginB]} />
                  </Worker>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    </main>
  );

  function setFiles(file: File | undefined, setter: (f: File | null) => void) {
    if (file) setter(file);
  }
}