import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tw = searchParams.get('tw') || '1920';
    const th = searchParams.get('th') || '1080';

    console.log(`[/api/resize] Transparent proxy to: ${PYTHON_API_URL}/manual-resize?target_w=${tw}&target_h=${th}`);

    // Create a new headers object to avoid modifying the original
    const headers = new Headers(req.headers);
    // Remove host to avoid issues with some servers
    headers.delete('host');

    const response = await fetch(`${PYTHON_API_URL}/manual-resize?target_w=${tw}&target_h=${th}`, {
      method: 'POST',
      body: req.body,
      headers: headers,
      // @ts-ignore - duplex is required for streaming bodies in some environments
      duplex: 'half',
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[/api/resize] Python server error (${response.status}):`, text);
      return NextResponse.json(
        { error: 'Cropper service error', detail: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/resize] Proxy failed:', error);
    return NextResponse.json({ error: 'Proxy unreachable' }, { status: 502 });
  }
}