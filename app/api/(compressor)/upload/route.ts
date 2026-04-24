import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  const filename = new URL(req.url).searchParams.get('filename');

  if (!filename || !req.body) {
    return NextResponse.json({ error: 'Invalid request — filename and body are required' }, { status: 400 });
  }

  try {
    // Re-assemble the raw bytes into a File so we can forward it as multipart
    const arrayBuffer = await req.arrayBuffer();
    const blob = new Blob([arrayBuffer]);

    const formData = new FormData();
    formData.append('files', blob, filename);

    const response = await fetch(`${PYTHON_API_URL}/compress/upload`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Compress service error', detail: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json({ success: true, ...data });
  } catch (error) {
    console.error('[/api/upload] Failed to reach compress service:', error);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}