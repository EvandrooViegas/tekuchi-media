import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');
  const isProcessed = searchParams.get('isProcessed') === 'true';

  const pythonUrl = `http://localhost:8000/full-resolution?filename=${encodeURIComponent(filename || '')}&isProcessed=${isProcessed}`;
  
  try {
    const res = await fetch(pythonUrl);
    if (!res.ok) return new NextResponse(null, { status: res.status });

    const blob = await res.blob();
    return new NextResponse(blob);
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}