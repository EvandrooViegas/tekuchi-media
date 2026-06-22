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

const NAV_GROUPS = [
    {
        label: 'Media',
        icon: FileVideo,
        items: [
            { name: 'Media Compressor',    href: '/compressor',         icon: FileVideo,       desc: 'Compress images, videos & PDFs' },
            { name: 'Image Resizer',       href: '/resizer',            icon: Crop,            desc: 'Resize & crop into HD dimensions' },
            { name: 'Thumbnailer',         href: '/thumbnailer',        icon: ImageIcon,       desc: 'Extract PDF covers as JPEG' },
        ],
    },
    {
        label: 'Images',
        icon: FileImage,
        items: [
            { name: 'Image Duplicator',    href: '/image-duplicator',   icon: Copy,            desc: 'Bulk duplicate via CSV mapping' },
            { name: 'Blueprint Mirror',    href: '/blueprint-mirror',   icon: FlipHorizontal2, desc: 'Flip blueprints, preserve labels' },
            { name: 'Floorplan Extractor', href: '/floorplan-extractor',icon: Layers,          desc: 'Extract floor-plans from PDFs' },
        ],
    },
    {
        label: 'Utilities',
        icon: Layers,
        items: [
            { name: 'Font Converter',      href: '/font-converter',     icon: Type,            desc: 'Convert fonts to web formats' },
            { name: 'PDF Comparer',        href: '/comparer',           icon: FileSearch,      desc: 'Side-by-side PDF diff + export' },
            { name: 'PDF Bulk Downloader', href: '/pdf-bulk-downloader',icon: FileDown,        desc: 'Batch apartment PDF export' },
        ],
    },
];

function NavDropdown({
    group,
    pathname,
    isOpen,
    onToggle,
    onClose,
}: {
    group: (typeof NAV_GROUPS)[number];
    pathname: string;
    isOpen: boolean;
    onToggle: () => void;
    onClose: () => void;
}) {
    const isGroupActive = group.items.some(i => pathname === i.href);

    return (
        <div className="relative">
            <button
                onClick={onToggle}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-xs font-bold transition-all ${
                    isGroupActive
                        ? 'bg-white text-slate-900 border border-slate-200/60 shadow-sm'
                        : 'text-slate-500 hover:text-slate-900 hover:bg-white/80'
                }`}
            >
                <group.icon size={13} className={isGroupActive ? 'text-slate-900' : 'text-slate-400'} />
                {group.label}
                <ChevronDown size={11} className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''} text-slate-400`} />
            </button>

            {isOpen && (
                <div className="absolute top-full mt-1.5 left-0 z-50 min-w-[240px] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-slate-100">
                        <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">{group.label}</span>
                    </div>
                    {group.items.map(item => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onClose}
                                className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                                    isActive
                                        ? 'bg-slate-900 text-white'
                                        : 'hover:bg-slate-50 text-slate-700 hover:text-slate-900'
                                }`}
                            >
                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-none ${
                                    isActive ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'
                                }`}>
                                    <item.icon size={14} />
                                </div>
                                <div>
                                    <p className={`text-xs font-bold leading-tight ${isActive ? 'text-white' : 'text-slate-800'}`}>
                                        {item.name}
                                    </p>
                                    <p className={`text-[10px] mt-0.5 ${isActive ? 'text-white/60' : 'text-slate-400'}`}>
                                        {item.desc}
                                    </p>
                                </div>
                            </Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default function Navbar() {
    const pathname   = usePathname();
    const [open, setOpen] = useState<string | null>(null);
    const navRef     = useRef<HTMLElement>(null);

    // Close when clicking outside the entire nav
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (navRef.current && !navRef.current.contains(e.target as Node)) {
                setOpen(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Close on route change
    useEffect(() => { setOpen(null); }, [pathname]);

    return (
        <header className="flex-none flex items-center justify-between bg-white px-6 py-3 border-b border-slate-100 z-50">
            <div className="flex items-center gap-6">
                <Link href="/compressor" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
                    <Image width={32} height={32} className="object-contain rounded-md" alt="Logo" src="/logo.jpeg" />
                    <span className="text-sm font-black tracking-tight text-slate-900">
                        Tekuchi <span className="text-slate-400 font-medium">Media Suite</span>
                    </span>
                </Link>

                <nav ref={navRef} className="flex items-center bg-slate-50 p-0.5 rounded-lg border border-slate-200/50 gap-0.5">
                    {NAV_GROUPS.map(group => (
                        <NavDropdown
                            key={group.label}
                            group={group}
                            pathname={pathname}
                            isOpen={open === group.label}
                            onToggle={() => setOpen(prev => prev === group.label ? null : group.label)}
                            onClose={() => setOpen(null)}
                        />
                    ))}
                </nav>
            </div>

            <div className="flex items-center gap-3">
                <Link
                    href="/docs"
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                        pathname.startsWith('/docs')
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white hover:bg-slate-50 text-slate-600 border-slate-200/60 hover:border-slate-300'
                    }`}
                >
                    <BookOpen size={14} />
                    Docs
                </Link>

                <div className="flex items-center gap-2 px-2.5 py-1 bg-slate-50 rounded-full border border-slate-200/50">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Online</span>
                </div>
            </div>
        </header>
    );
}
