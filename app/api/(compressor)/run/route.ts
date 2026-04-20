import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';

export async function POST() {
    const scriptDir = path.join(process.cwd(), 'server', 'compressor');
    const scriptPath = 'converter.py';

    // Running the python script using the correct directory context
    exec(`python ${scriptPath}`, { cwd: scriptDir }, (error, stdout, stderr) => {
        if (error) {
            console.error(`Exec error: ${error}`);
            return;
        }
        if (stderr) {
            console.error(`Python stderr: ${stderr}`);
        }
        console.log(`Output: ${stdout}`);
    });

    return NextResponse.json({ message: "Started converter from server/compressor" });
}