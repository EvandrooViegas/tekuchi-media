'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Crop, FileSearch, FileVideo, Image as ImageIcon, Type, Copy, BookOpen } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

const navItems = [
  { name: 'Media Compressor', href: '/compressor', icon: FileVideo },
  { name: 'Image Resizer', href: '/resizer', icon: Crop },
  { name: 'Thumbnailer', href: '/thumbnailer', icon: ImageIcon },
  { name: 'Font Converter', href: '/font-converter', icon: Type },
  { name: 'Image Duplicator', href: '/image-duplicator', icon: Copy },
  { name: 'PDF Comparer', href: '/comparer', icon: FileSearch },
];

  return (
    <header className="flex-none flex items-center justify-between bg-white px-6 py-3 border-b border-slate-100 z-50">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <Image width={32} height={32} className='object-contain rounded-md' alt='Logo' src="/logo.jpeg" />
          <h1 className="text-sm font-black tracking-tight text-slate-900">
            Tekuchi <span className="text-slate-400 font-medium">Media Suite</span>
          </h1>
        </div>

        <nav className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200/50">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                  isActive 
                    ? 'bg-white text-slate-900 border border-slate-200/60 shadow-sm font-extrabold' 
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/50'
                }`}
              >
                <item.icon size={14} className={isActive ? 'text-slate-900' : 'text-slate-400'} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <Link 
          href="/docs"
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
            pathname.startsWith('/docs')
              ? 'bg-slate-100 text-slate-900 border-slate-200 shadow-sm'
              : 'bg-white hover:bg-slate-50/50 text-slate-600 border-slate-200/60'
          }`}
        >
          <BookOpen size={14} />
          Documentation
        </Link>

        <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-full border border-slate-200/50">
          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Server Online</span>
        </div>
      </div>
    </header>
  );
}