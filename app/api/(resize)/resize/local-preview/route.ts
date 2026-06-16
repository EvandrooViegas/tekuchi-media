import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('filename');
  const isProcessed = searchParams.get('isProcessed') === 'true';

  // Forward the request to Python with the exact parameters
  const pythonUrl = `http://localhost:8000/local-preview?filename=${encodeURIComponent(filename || '')}&isProcessed=${isProcessed}`;
  console.log("😀😀😁😁: ", pythonUrl)
  try {
    const res = await fetch(pythonUrl);
    if (!res.ok) return new NextResponse(null, { status: res.status });

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: { 'Content-Type': 'image/jpeg' }
    });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}