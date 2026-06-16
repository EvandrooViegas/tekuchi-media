import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function GET() {
  try {
    const response = await fetch(`${PYTHON_API_URL}/compress/logs`, {
      // Don't let Next.js cache this — logs must always be fresh
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json({ jobs: [], systemLogs: [] }, { status: response.status });
    }

    const data = await response.json();

    // The Python endpoint returns { jobs: [] }.
    // We preserve the shape the frontend already expects:
    // { jobs: [...reversed], systemLogs: [...] }
    const jobs: any[] = Array.isArray(data.jobs) ? [...data.jobs].reverse() : [];

    return NextResponse.json({ jobs, systemLogs: Array.isArray(data.systemLogs) ? data.systemLogs : [] });
  } catch (error) {
    console.error('[/api/logs] Failed to reach compress service:', error);
    return NextResponse.json({ jobs: [], systemLogs: [] });
  }
}