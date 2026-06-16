// app/api/download/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getProcessorPaths } from '@/lib/config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get('file');

  if (!filename) return new NextResponse("No file specified", { status: 400 });

  try {
    const paths = getProcessorPaths();
  const filePath = path.join(paths.processed, filename);
  
    const fileBuffer = await fs.readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Type': 'application/octet-stream', // Forces download
      },
    });
  } catch (error) {
    return new NextResponse("File not found", { status: 404 });
  }
}