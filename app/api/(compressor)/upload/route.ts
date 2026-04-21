// app/api/upload/route.ts
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getProcessorPaths } from '@/lib/config';

export async function POST(req: Request) {
  const filename = new URL(req.url).searchParams.get('filename');
  
  if (!filename || !req.body) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

const paths = getProcessorPaths();
  // Use the 'inbox' path from the config
  const dest = path.join(paths.inbox, filename); 
  console.log("😁😁😀😀: ", dest)
  const writeStream = fs.createWriteStream(dest);

  try {
    for await (const chunk of req.body as any) {
      writeStream.write(chunk);
    }
    writeStream.end();
    return NextResponse.json({ success: true });
  } catch (error) {
    writeStream.close();
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}