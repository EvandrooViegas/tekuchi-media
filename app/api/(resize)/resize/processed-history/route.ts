import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch('http://localhost:8000/processed-history', { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ history: [] }, { status: 500 });
  }
}