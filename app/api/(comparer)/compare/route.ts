import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    
    const pythonResponse = await fetch('http://localhost:8000/compare', {
      method: 'POST',
      body: formData,
    });

    if (!pythonResponse.ok) {
      throw new Error('Python service failed');
    }
const data = await pythonResponse.json();

    // UNWRAP THE DATA HERE
    // If Python sends { result: { changes: [] } }, we send just { changes: [] }
    const cleanData = data.result ? data.result : data;

    return NextResponse.json(cleanData);
    
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Python service unreachable' }, { status: 500 });
  }
}