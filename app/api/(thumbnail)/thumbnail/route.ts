import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const response = await fetch(`${PYTHON_API_URL}/thumbnail/`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Thumbnail service error', detail: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/thumbnail] Failed to reach thumbnail service:', error);
    return NextResponse.json({ error: 'Thumbnail service unreachable' }, { status: 502 });
  }
}