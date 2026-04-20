// app/api/media/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getProcessorPaths } from '@/lib/config';

// Map extensions to their browser-friendly MIME types
const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) return new NextResponse("No file specified", { status: 400 });

  try {
  const paths = getProcessorPaths();
  // Use the 'processed' path (aliased from 'converted' in ini)
  const filePath = path.join(paths.processed, filename);
    console.log(filePath)
  const fileBuffer = await fs.readFile(filePath);
    
    // Determine the content type based on the file extension
    const ext = path.extname(filename).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        // "inline" tells the browser to display it, rather than "attachment" (download)
        'Content-Disposition': `inline; filename="${filename}"`,
      },
    });
  } catch (error) {
    return new NextResponse("File not found", { status: 404 });
  }
}