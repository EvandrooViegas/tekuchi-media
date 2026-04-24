import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST() {
  try {
    const response = await fetch(`${PYTHON_API_URL}/compress/run`, {
      method: 'POST',
      // No files body — triggers a run of whatever is already in the inbox
      body: new FormData(),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        { error: 'Compress service error', detail: text },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/run] Failed to reach compress service:', error);
    return NextResponse.json(
      { error: 'Compress service unreachable' },
      { status: 502 }
    );
  }
}