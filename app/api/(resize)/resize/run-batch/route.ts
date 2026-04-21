import { NextResponse } from "next/server";

export async function POST() {
  try {
    const res = await fetch('http://localhost:8000/run-batch', { method: 'POST' });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: 'Process failed' }, { status: 500 });
  }
}