import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch('http://localhost:8000/cropper/logs', { cache: 'no-store' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ logs: "Error reaching cropper server." }, { status: 500 });
  }
}
