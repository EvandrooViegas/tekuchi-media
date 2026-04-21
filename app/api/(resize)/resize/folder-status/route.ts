import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch('http://localhost:8000/folder-status', { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ count: 0, files: [] }, { status: 500 });
  }
}