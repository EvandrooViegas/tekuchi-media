'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { Crop, FileSearch, FileVideo, Image as ImageIcon } from "lucide-react";

export default function Navbar() {
  const pathname = usePathname();

const navItems = [
  { name: 'PDF Comparer', href: '/comparer', icon: FileSearch },
  { name: 'Thumbnailer', href: '/thumbnailer', icon: ImageIcon }, // Add this
  { name: 'Media Compressor', href: '/compressor', icon: FileVideo },
  { name: 'Image Resizer', href: '/resizer', icon: Crop },
];

  return (
    <header className="flex-none flex items-center justify-between bg-white px-6 py-3 border-b shadow-sm z-50">
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-3">
          <Image width={32} height={32} className='object-contain rounded-md' alt='Logo' src="/logo.jpeg" />
          <h1 className="text-lg font-extrabold text-slate-800">
            Tekuchi <span className="text-blue-600">Media Suite</span>
          </h1>
        </div>

        <nav className="flex items-center bg-slate-100 p-1 rounded-lg border">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold transition-all ${
                  isActive ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <item.icon size={16} />
                {item.name}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-2 px-3 py-1 bg-green-50 rounded-full border border-green-100">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
        <span className="text-[10px] font-bold text-green-700 uppercase tracking-widest">Server Online</span>
      </div>
    </header>
  );
}