import { NextRequest } from 'next/server';
import { provisioningBus, isWorkspaceRunning, getWorkspacePort, pendingProvisioning, WorkspaceOperationResult } from '@/lib/docker/manager';
import { auth } from '@/auth';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
    const userId = session.user.id;

    const searchParams = req.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
        return new Response('Missing workspace id', { status: 400 });
    }

    const verifyObj = await db.execute({
        sql: "SELECT 1 FROM workspaces WHERE id = ? AND user_id = ? LIMIT 1",
        args: [id, userId]
    });

    if (verifyObj.rows.length === 0) {
        return new Response('Workspace not found or unauthorized', { status: 404 });
    }

    const encoder = new TextEncoder();
    let cleanup = () => {};

    const stream = new ReadableStream({
        async start(controller) {
            // Helper to send formatted SSE events
            const sendEvent = (event: string, data: Record<string, unknown> | string) => {
                const payload = typeof data === 'string' ? data : JSON.stringify(data);
                try {
                    controller.enqueue(encoder.encode(`event: ${event}\ndata: ${payload}\n\n`));
                } catch {
                    // Controller might be closed if client disconnected
                }
            };

            let timeoutId: NodeJS.Timeout | null = null;

            const dispose = () => {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                    timeoutId = null;
                }

                provisioningBus.off(`log:${id}`, onLog);
                provisioningBus.off(`ready:${id}`, onReady);
                provisioningBus.off(`error:${id}`, onFailure);
            };

            // 1. ATTACHMENT: Listen to existing provisioning session if one is already active
            const onLog = (msg: string) => sendEvent('log', msg);
            provisioningBus.on(`log:${id}`, onLog);

            // 2. READY LISTENER: If a ready event fires while we wait, pass it through
            const onReady = (res: WorkspaceOperationResult) => {
                sendEvent('ready', {
                    success: res.success,
                    port: res.port,
                    androidPort: res.androidPort,
                    appetizeUrl: res.appetizeUrl,
                });
                dispose();
                controller.close();
            };
            provisioningBus.on(`ready:${id}`, onReady);

            const onFailure = (res: WorkspaceOperationResult) => {
                sendEvent('error', { message: res.error || 'Provisioning failed.' });
                dispose();
                controller.close();
            };
            provisioningBus.on(`error:${id}`, onFailure);
            cleanup = dispose;

            // 3. IMMEDIATE SYNC: If workspace is ALREADY running, send ready and finish
            if (isWorkspaceRunning(id)) {
                sendEvent('ready', {
                    success: true,
                    port: getWorkspacePort(id),
                });
                dispose();
                controller.close();
                return;
            }

            // 4. PERSISTENCE: If not active and not pending, wait for a potential POST start
            if (!pendingProvisioning.has(id)) {
                timeoutId = setTimeout(() => {
                    try {
                        if (!pendingProvisioning.has(id) && !isWorkspaceRunning(id)) {
                           sendEvent('error', { message: "No active provisioning session. Start workspace first." });
                           dispose();
                           controller.close();
                        }
                    } catch {}
                }, 10000); // 10s wait for a POST start
            }
        },
        cancel() {
            cleanup();
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
