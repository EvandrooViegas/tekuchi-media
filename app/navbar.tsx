'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import {
    Crop, FileSearch, FileVideo, Image as ImageIcon,
    Type, Copy, BookOpen, FileDown, FlipHorizontal2,
    ChevronDown, FileImage, Layers,
} from 'lucide-react';

// ─── Menu structure ────────────────────────────────────────────────────────────

const NAV_GROUPS = [
    {
        label: 'Media',
        icon: FileVideo,
        items: [
            { name: 'Media Compressor', href: '/compressor', icon: FileVideo, desc: 'Compress images, videos & PDFs' },
            { name: 'Image Resizer', href: '/resizer', icon: Crop, desc: 'Resize & crop into HD dimensions' },
            { name: 'Thumbnailer', href: '/thumbnailer', icon: ImageIcon, desc: 'Extract PDF covers as JPEG' },
        ],
    },
    {
        label: 'Images',
        icon: FileImage,
        items: [
            { name: 'Image Duplicator', href: '/image-duplicator', icon: Copy, desc: 'Bulk duplicate via CSV mapping' },
            { name: 'Blueprint Mirror', href: '/blueprint-mirror', icon: FlipHorizontal2, desc: 'Flip blueprints, preserve labels' },
        ],
    },
    {
        label: 'Utilities',
        icon: Layers,
        items: [
            { name: 'Font Converter', href: '/font-converter', icon: Type, desc: 'Convert fonts to web formats' },
            { name: 'PDF Comparer', href: '/comparer', icon: FileSearch, desc: 'Side-by-side PDF diff' },
            { name: 'PDF Bulk Downloader', href: '/pdf-bulk-downloader', icon: FileDown, desc: 'Batch apartment PDF export' },
        ],
    },
];

// ─── Dropdown component ────────────────────────────────────────────────────────

function NavDropdown({
    group,
    pathname,
}: {
    group: (typeof NAV_GROUPS)[number];
    pathname: string;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    const isGroupActive = group.items.some(i => pathname === i.href);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} className="relative">
            <button
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                    isGroupActive
                        ? 'bg-white text-slate-900 border border-slate-200/60 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50/50'
                }`}
            >
                <group.icon size={14} className={isGroupActive ? 'text-slate-900' : 'text-slate-400'} />
                {group.label}
                <ChevronDown
                    size={11}
                    className={`transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isGroupActive ? 'text-slate-600' : 'text-slate-400'}`}
                />
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    onMouseEnter={() => setOpen(true)}
                    onMouseLeave={() => setOpen(false)}
                    className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-slate-200/80 rounded-xl shadow-lg shadow-slate-200/60 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150"
                >
                    {group.items.map(item => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setOpen(false)}
                                className={`flex items-start gap-3 px-4 py-2.5 transition-colors ${
                                    isActive
                                        ? 'bg-slate-50 text-slate-900'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}
                            >
                                <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-none ${isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    <item.icon size={13} />
                                </div>
                                <div>
                                    <p className={`text-xs font-bold leading-none mb-0.5 ${isActive ? 'text-slate-900' : 'text-slate-700'}`}>
                                        {item.name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 font-medium leading-snug">{item.desc}</p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Navbar ────────────────────────────────────────────────────────────────────

export default function Navbar() {
    const pathname = usePathname();

    return (
        <header className="flex-none flex items-center justify-between bg-white px-6 py-3 border-b border-slate-100 z-50">
            <div className="flex items-center gap-6">
                {/* Logo */}
                <div className="flex items-center gap-3">
                    <Image width={32} height={32} className="object-contain rounded-md" alt="Logo" src="/logo.jpeg" />
                    <h1 className="text-sm font-black tracking-tight text-slate-900">
                        Tekuchi <span className="text-slate-400 font-medium">Media Suite</span>
                    </h1>
                </div>

                {/* Nav groups */}
                <nav className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200/50 gap-0.5">
                    {NAV_GROUPS.map(group => (
                        <NavDropdown key={group.label} group={group} pathname={pathname} />
                    ))}
                </nav>
            </div>

            {/* Right side */}
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
