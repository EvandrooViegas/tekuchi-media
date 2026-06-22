import { PYTHON_API_URL } from '@/lib/config';
import { NextResponse } from 'next/server';

// Map to track active extraction sessions
const activeSessions = new Map<string, { abortController: AbortController; startTime: number }>();

// Generates a unique session ID
function generateSessionId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// Streams the Server-Sent Events response from Python straight to the browser.
export async function POST(req: Request) {
    try {
        const formData = await req.formData();
        const sessionId = generateSessionId();
        const abortController = new AbortController();
        
        // Register the session
        activeSessions.set(sessionId, { abortController, startTime: Date.now() });

        const response = await fetch(`${PYTHON_API_URL}/floorplan/extract`, {
            method: 'POST',
            body: formData,
            signal: abortController.signal,
        });

        if (!response.ok || !response.body) {
            const text = await response.text().catch(() => '');
            activeSessions.delete(sessionId);
            return NextResponse.json(
                { error: 'Floorplan service error', detail: text },
                { status: response.status }
            );
        }

        // Pass the SSE stream straight through — do not buffer it
        // Include session ID in response headers so client can stop it
        const responseHeaders = new Headers({
            'Content-Type':  'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'X-Session-Id': sessionId,
        });

        // Wrap the response body to clean up session on completion
        const wrappedBody = new ReadableStream({
            async start(controller) {
                try {
                    const reader = response.body!.getReader();
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            controller.close();
                            break;
                        }
                        controller.enqueue(value);
                    }
                } catch (error) {
                    if (!(error instanceof Error && error.name === 'AbortError')) {
                        console.error('[/api/floorplan] Stream error:', error);
                    }
                    controller.close();
                } finally {
                    activeSessions.delete(sessionId);
                }
            },
        });

        return new Response(wrappedBody, { headers: responseHeaders });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return NextResponse.json({ error: 'Extraction stopped' }, { status: 499 });
        }
        console.error('[/api/floorplan] Failed to reach service:', error);
        return NextResponse.json({ error: 'Floorplan service unreachable' }, { status: 502 });
    }
}

// Stop an active extraction session
export async function DELETE(req: Request) {
    try {
        const { sessionId } = await req.json();
        
        if (!sessionId || !activeSessions.has(sessionId)) {
            return NextResponse.json(
                { error: 'Session not found or already completed' },
                { status: 404 }
            );
        }

        const session = activeSessions.get(sessionId)!;
        session.abortController.abort();
        activeSessions.delete(sessionId);

        return NextResponse.json({ success: true, message: 'Extraction stopped' });
    } catch (error) {
        console.error('[/api/floorplan] Stop error:', error);
        return NextResponse.json({ error: 'Failed to stop extraction' }, { status: 500 });
    }
}
