// app/api/logs/route.ts
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET() {
  try {
    const scriptDir = path.join(process.cwd(), 'server', 'compressor');
    const logJsonPath = path.join(scriptDir, 'log.json');
    const logTextPath = path.join(scriptDir, 'converter.log');

    // 1. Read the JSON for the Table
    let jobs = [];
    try {
      const jsonData = await fs.readFile(logJsonPath, 'utf8');
      jobs = JSON.parse(jsonData).jobs || [];
    } catch (e) { jobs = []; }

    // 2. Read the Text for the Live Terminal
    let systemLogs: string[] = [];
    try {
      const textData = await fs.readFile(logTextPath, 'utf8');
      // Split by line, remove empty, and take the last 50 lines so it's fast
      systemLogs = textData.split('\n').filter(Boolean).slice(-200);
    } catch (e) { systemLogs = ["Starting logs..."]; }

    return NextResponse.json({
      jobs: jobs.reverse(),
      systemLogs: systemLogs.reverse(),
    });
  } catch (error) {
    return NextResponse.json({ jobs: [], systemLogs: [] });
  }
}