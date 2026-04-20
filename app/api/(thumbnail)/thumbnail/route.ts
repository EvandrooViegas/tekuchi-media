import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const pythonResponse = await fetch('http://localhost:8000/thumbnail', {
      method: 'POST',
      body: formData,
    });

    if (!pythonResponse.ok) throw new Error('Python service failed');

    const data = await pythonResponse.json();
    return NextResponse.json(data);
    
  } catch (error) {
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}