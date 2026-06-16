import { NextResponse } from 'next/server';
import { PYTHON_API_URL } from '@/lib/config';

export async function POST(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tw = searchParams.get('tw') || '1920';
    const th = searchParams.get('th') || '1080';

    // 1. Extract the formData from the browser's request
    const incomingData = await req.formData();
    
    // 2. Create a NEW FormData object for the Python server
    const forwardData = new FormData();
    const files = incomingData.getAll('files');
    
    if (!files || files.length === 0) {
        return NextResponse.json({ error: "No files found in request" }, { status: 400 });
    }

    files.forEach((file) => {
      // If it's a File object, we must preserve its name so FastAPI recognizes it as an UploadFile
      if (file instanceof File) {
        forwardData.append('files', file, file.name);
      } else {
        // Fallback for strings or blobs
        forwardData.append('files', file);
      }
    });

    // 3. Forward to Python. Do NOT manually set Content-Type headers.
    const response = await fetch(`${PYTHON_API_URL}/manual-resize?target_w=${tw}&target_h=${th}`, {
      method: 'POST',
      body: forwardData,
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[/api/resize] Python server error:`, data);
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('[/api/resize] Proxy failed:', error);
    return NextResponse.json({ error: 'Proxy unreachable' }, { status: 502 });
  }
}