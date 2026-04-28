import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const { searchParams } = new URL(req.url);
    const tw = searchParams.get('tw') || '1920';
    const th = searchParams.get('th') || '1080';
    console.log(`[/api/resize] Forwarding to: ${PYTHON_API_URL}/manual-resize?target_w=${tw}&target_h=${th}`);
    const response = await fetch(`${PYTHON_API_URL}/manual-resize?target_w=${tw}&target_h=${th}`, {
      method: 'POST',
      body: formData,
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
    console.error('[/api/resize] Failed to reach cropper service:', error);
    return NextResponse.json({ error: 'Cropper service unreachable' }, { status: 502 });
  }
}