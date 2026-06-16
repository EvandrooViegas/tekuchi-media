'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';

interface DocsBannerProps {
  explanation: string;
  docFile: string;
}

export function DocsBanner({ explanation, docFile }: DocsBannerProps) {
  return (
    <div className="border-t border-slate-200/60 pt-6 mt-12 w-full">
      <div className="flex flex-col gap-2 max-w-3xl">
        <Link
          href={`/docs?file=${docFile}`}
          className="inline-flex items-center gap-1.5 text-slate-800 hover:text-blue-600 font-bold text-[11px] uppercase tracking-wider transition-colors group w-fit"
        >
          <BookOpen size={14} className="text-slate-400 group-hover:text-blue-500 transition-colors" />
          <span>Documentation Guide</span>
          <span className="text-[10px] transition-transform group-hover:translate-x-0.5">→</span>
        </Link>
        <p className="text-xs text-slate-400 font-medium leading-relaxed">
          {explanation}
        </p>
      </div>
    </div>
  );
}
