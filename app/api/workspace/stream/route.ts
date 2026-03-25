import { NextRequest } from 'next/server';
import { startWorkspaceContainer } from '@/lib/docker/manager';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
    const userId = session.user.id;

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');
    const withAndroid = searchParams.get('withAndroid') === 'true';

    if (!id) {
        return new Response('Missing workspace id', { status: 400 });
    }

    // Verify ownership and get project name
    const verifyObj = await db.execute({
        sql: "SELECT project_name FROM workspaces WHERE id = ? AND user_id = ?",
        args: [id, session.user.id]
    });

    if (verifyObj.rows.length === 0) {
        return new Response('Workspace not found or unauthorized', { status: 404 });
    }

    const projectName = verifyObj.rows[0].project_name as string;

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        async start(controller) {
            // Helper to send formatted SSE events
            const sendEvent = (event: string, data: Record<string, unknown> | string) => {
                const payload = typeof data === 'string' ? data : JSON.stringify(data);
                controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
            };

            try {
                // Initialize workspace and pipe logs directly from the Docker builder engine to SSE client
                const result = await startWorkspaceContainer({ 
                    id: id as string, 
                    userId: userId,
                    projectName: projectName,
                    withAndroidEmulator: withAndroid, 
                    onLog: (msg) => sendEvent('log', msg) 
                });
                
                // Completed
                sendEvent('ready', {
                    success: true,
                    port: result.port,
                    androidPort: result.androidPort,
                    appetizeUrl: result.appetizeUrl,
                });
            } catch (error: unknown) {
                const e = error as Error;
                sendEvent('error', { message: e.message || "Failed to start workspace." });
            } finally {
                controller.close();
            }
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        },
    });
}
