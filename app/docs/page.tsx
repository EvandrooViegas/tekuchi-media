import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { 
  FileSearch, FileVideo, Type, Copy, Crop, 
  ImageIcon, BookOpen, Home, ArrowLeft, FileDown, FlipHorizontal2
} from 'lucide-react';

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const DOC_CATEGORIES = [
  {
    name: 'Getting Started',
    items: ['README'],
  },
  {
    name: 'Media Processing',
    items: ['02_COMPRESSOR', '09_COMPRESSOR_4K', '05_RESIZER', '06_THUMBNAILER'],
  },
  {
    name: 'Image Tools',
    items: ['04_IMAGE_DUPLICATOR', '08_BLUEPRINT_MIRROR'],
  },
  {
    name: 'Utilities & PDF',
    items: ['01_COMPARER', '03_FONT_CONVERTER', '07_PDF_BULK_DOWNLOADER'],
  }
];

const DOC_METADATA: Record<string, { title: string; desc: string; icon: any }> = {
  'README':              { title: 'Suite Overview',       desc: 'Introduction & quick links',        icon: Home },
  '01_COMPARER':         { title: 'PDF Comparer',         desc: 'Compare PDF edits side-by-side',    icon: FileSearch },
  '02_COMPRESSOR':       { title: 'Media Compressor',     desc: 'Batch compress videos/images',      icon: FileVideo },
  '09_COMPRESSOR_4K':    { title: '4K Output',            desc: 'Dual-resolution 1080p + 4K export', icon: FileVideo },
  '03_FONT_CONVERTER':   { title: 'Font Converter',       desc: 'Convert TTF/OTF web packages',      icon: Type },
  '04_IMAGE_DUPLICATOR': { title: 'Image Duplicator',     desc: 'CSV bulk image copier',             icon: Copy },
  '05_RESIZER':          { title: 'Image Resizer',        desc: 'Auto and manual image scaling',     icon: Crop },
  '06_THUMBNAILER':      { title: 'PDF Thumbnailer',      desc: 'Convert PDF covers to JPEG',        icon: ImageIcon },
  '07_PDF_BULK_DOWNLOADER': { title: 'PDF Bulk Downloader', desc: 'Batch apartment PDF export',     icon: FileDown },
  '08_BLUEPRINT_MIRROR': { title: 'Blueprint Mirror',     desc: 'Flip blueprints, preserve labels',  icon: FlipHorizontal2 },
};

function parseInline(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Bold **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold text-slate-900">$1</strong>');

  // Inline code `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-slate-100 text-slate-800 font-mono text-[13px] px-1.5 py-0.5 rounded border border-slate-200 font-semibold">$1</code>');

  // Links [text](href)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, href) => {
    let targetHref = href;
    if (href.endsWith('.md')) {
      const filename = href.split('/').pop()?.replace('.md', '');
      targetHref = `/docs?file=${filename}`;
    }
    return `<a href="${targetHref}" class="text-blue-600 hover:text-blue-800 hover:underline font-bold transition-colors">${text}</a>`;
  });

  return html;
}

function markdownToHtml(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let inList = false;
  let listType: 'ul' | 'ol' | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Handle code blocks
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        inCodeBlock = false;
        result.push(`<div class="my-5 rounded-lg border border-slate-200 overflow-hidden"><div class="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b border-slate-200"><div class="w-2 h-2 rounded-full bg-slate-300"></div><div class="w-2 h-2 rounded-full bg-slate-300"></div><div class="w-2 h-2 rounded-full bg-slate-300"></div><span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Code</span></div><pre class="bg-white text-slate-800 p-5 font-mono text-[13px] overflow-x-auto whitespace-pre leading-relaxed">${codeContent.join('\n')}</pre></div>`);
        codeContent = [];
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      const escapedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      codeContent.push(escapedLine);
      continue;
    }

    // Handle tables
    if (line.trim().startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      const cells = line.split('|').slice(1, -1).map(c => c.trim());
      if (cells.every(c => c.match(/^:-*-?:*$/) || c.match(/^-+$/))) {
        continue;
      }
      tableRows.push(cells);
      continue;
    } else if (inTable) {
      inTable = false;
      if (tableRows.length > 0) {
        let tableHtml = `<div class="overflow-x-auto my-6 border border-slate-200 rounded-lg shadow-sm"><table class="min-w-full divide-y divide-slate-200">`;
        const headers = tableRows[0];
        tableHtml += `<thead class="bg-slate-50"><tr>`;
        headers.forEach(h => {
          tableHtml += `<th class="px-4 py-2.5 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">${h}</th>`;
        });
        tableHtml += `</tr></thead><tbody class="bg-white divide-y divide-slate-100">`;
        tableRows.slice(1).forEach(row => {
          tableHtml += `<tr class="hover:bg-slate-50/50 transition-colors">`;
          row.forEach(cell => {
            tableHtml += `<td class="px-4 py-3 text-[13px] font-medium text-slate-600">${parseInline(cell)}</td>`;
          });
          tableHtml += `</tr>`;
        });
        tableHtml += `</tbody></table></div>`;
        result.push(tableHtml);
      }
    }

    // Handle lists
    const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
    const isNumbered = line.trim().match(/^\d+\.\s+/);

    if (isBullet || isNumbered) {
      const currentListType = isBullet ? 'ul' : 'ol';
      if (!inList) {
        inList = true;
        listType = currentListType;
        result.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 space-y-1.5 my-4 text-slate-600 text-base">`);
      } else if (listType !== currentListType) {
        result.push(`</${listType}>`);
        listType = currentListType;
        result.push(`<${listType} class="${listType === 'ul' ? 'list-disc' : 'list-decimal'} ml-6 space-y-1.5 my-4 text-slate-600 text-base">`);
      }
      
      const content = isBullet 
        ? line.trim().substring(2) 
        : line.trim().replace(/^\d+\.\s+/, '');
      
      result.push(`<li class="font-medium text-slate-600 leading-relaxed">${parseInline(content)}</li>`);
      continue;
    } else if (inList) {
      inList = false;
      result.push(`</${listType}>`);
      listType = null;
    }

    // Handle headers
    if (line.trim().startsWith('#')) {
      const level = line.match(/^#+/)?.[0].length || 1;
      const content = line.replace(/^#+\s*/, '').trim();
      const parsedContent = parseInline(content);
      
      if (level === 1) {
        result.push(`<h1 class="text-2xl font-black text-slate-900 tracking-tight mt-4 mb-6 border-b border-slate-100 pb-3">${parsedContent}</h1>`);
      } else if (level === 2) {
        result.push(`<h2 class="text-lg font-bold text-slate-900 tracking-tight mt-8 mb-3">${parsedContent}</h2>`);
      } else if (level === 3) {
        result.push(`<h3 class="text-base font-bold text-slate-900 tracking-tight mt-6 mb-2">${parsedContent}</h3>`);
      } else {
        result.push(`<h4 class="text-sm font-bold text-slate-800 tracking-tight mt-4 mb-2">${parsedContent}</h4>`);
      }
      continue;
    }

    // Default: paragraph
    const trimmed = line.trim();
    if (trimmed) {
      result.push(`<p class="text-slate-600 text-base leading-relaxed my-4 font-medium">${parseInline(trimmed)}</p>`);
    }
  }

  if (inList) {
    result.push(`</${listType}>`);
  }

  return result.join('\n');
}

export default async function DocsPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  let selectedFile = (searchParams.file as string) || 'README';
  
  selectedFile = selectedFile.replace(/[^a-zA-Z0-9_]/g, '');

  const docDir = path.join(process.cwd(), 'doc');
  let fileContent = '';
  let errorMsg = '';

  try {
    const filePath = path.join(docDir, `${selectedFile}.md`);
    if (fs.existsSync(filePath)) {
      fileContent = fs.readFileSync(filePath, 'utf-8');
    } else {
      const readmePath = path.join(docDir, 'README.md');
      if (fs.existsSync(readmePath)) {
        fileContent = fs.readFileSync(readmePath, 'utf-8');
        selectedFile = 'README';
      } else {
        errorMsg = 'Documentation files are missing.';
      }
    }
  } catch (err) {
    errorMsg = 'Failed to load document.';
  }

  const htmlContent = fileContent ? markdownToHtml(fileContent) : '';

  return (
    <div className="min-h-screen bg-white flex font-sans">
      {/* Sleek Sidebar Navigation */}
      <aside className="w-64 flex-none bg-slate-50/50 border-r border-slate-100 p-6 flex flex-col gap-6 overflow-y-auto">
        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Documentation</span>
          <h2 className="text-sm font-bold text-slate-800">Tekuchi Media Suite</h2>
        </div>

        <nav className="flex flex-col gap-5 flex-grow">
          {DOC_CATEGORIES.map(category => (
            <div key={category.name} className="flex flex-col gap-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                {category.name}
              </span>
              <div className="flex flex-col gap-0.5 border-l border-slate-100">
                {category.items.map(doc => {
                  const meta = DOC_METADATA[doc] || { title: doc, desc: 'Guide', icon: BookOpen };
                  const isActive = selectedFile === doc;

                  return (
                    <Link
                      key={doc}
                      href={`/docs?file=${doc}`}
                      className={`flex items-center gap-2.5 py-1.5 pl-3 -ml-px text-xs font-semibold transition-all border-l ${
                        isActive
                          ? 'border-slate-800 text-slate-900 bg-slate-100/50'
                          : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
                      }`}
                    >
                      <meta.icon size={13} className={isActive ? 'text-slate-800' : 'text-slate-400'} />
                      <span>{meta.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Muted bottom return link */}
        <div className="pt-4 border-t border-slate-100">
          <Link
            href="/compressor"
            className="flex items-center justify-center gap-1.5 py-2 px-3 border border-slate-200 rounded-md text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-50 transition-colors w-full"
          >
            <ArrowLeft size={12} />
            Back to Suite
          </Link>
        </div>
      </aside>

      {/* Main Documentation Viewer */}
      <main className="flex-grow p-12 md:p-16 overflow-y-auto max-w-4xl">
        {errorMsg ? (
          <div className="p-4 border border-red-100 text-red-600 bg-red-50/50 rounded-lg text-xs font-semibold">
            {errorMsg}
          </div>
        ) : (
          <div className="relative">
            {selectedFile !== 'README' && (
              <Link 
                href="/docs?file=README" 
                className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-400 hover:text-slate-900 transition-colors mb-6"
              >
                <ArrowLeft size={10} />
                Back to Overview
              </Link>
            )}

            {/* Rendered HTML */}
            <article 
              className="prose prose-slate max-w-none 
                prose-headings:font-bold prose-headings:text-slate-900 prose-headings:tracking-tight 
                prose-p:text-slate-600 prose-p:text-base prose-p:leading-relaxed 
                prose-li:text-slate-600 prose-li:text-base 
                prose-strong:font-bold prose-strong:text-slate-900"
              dangerouslySetInnerHTML={{ __html: htmlContent }} 
            />
          </div>
        )}
      </main>
    </div>
  );
}
