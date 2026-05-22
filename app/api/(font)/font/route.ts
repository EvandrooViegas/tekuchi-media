import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    // Forward the multipart form data directly to the Python server
    const formData = await req.formData();

    const response = await fetch(`${PYTHON_API_URL}/font/convert`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Font conversion failed', detail: text },
        { status: response.status }
      );
    }

    // Stream the ZIP back to the browser
    const zipBuffer = await response.arrayBuffer();
    return new NextResponse(zipBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="converted_fonts.zip"',
      },
    });
  } catch (error) {
    console.error('[/api/font] Failed to reach font service:', error);
    return NextResponse.json({ error: 'Font service unreachable' }, { status: 502 });
  }
}
