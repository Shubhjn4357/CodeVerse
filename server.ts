/**
 * 🛰️ GLOBAL STABILIZATION (April 2026): Catch unhandled errors that cause HF Space restarts.
 */
process.on('uncaughtException', (err: Error) => { console.error('[FATAL:EXCEPTION]', err); });
process.on('unhandledRejection', (reason: unknown) => { console.error('[FATAL:REJECTION]', reason); });

import { createServer, IncomingMessage, ServerResponse } from "http";
import next from "next";
import { Server } from "socket.io";
import { WebSocketServer, WebSocket } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as map from "lib0/map";
import * as pty from "node-pty";
import os from "os";
import { Duplex } from "stream";
import { startAutoSleepCron } from "./lib/jobs/auto-sleep";
import { getNativeWorkspacePort, getAndroidPort, isNativeWorkspaceRunning, prewarmWorkspace, reconnectRunningWorkspaces } from "./lib/docker/manager";
import { initDb } from "./lib/db/schema";
import { client as dbClient } from "./lib/db";
import { HFStorage } from "./lib/hf/storage";
import { validateEnvironment } from "./lib/env-config";
import httpProxy from "http-proxy";
import { APP_CONFIG, INFRA_CONFIG, UI_STRINGS } from "./constants";

/**
 * PRODUCTION HARDENING (April 2026): Force writable temp paths for HF Spaces.
 */
process.env.TMPDIR = INFRA_CONFIG.TMPDIR;
process.env.HF_HOME = INFRA_CONFIG.HF_HOME;
if (!process.env.HOME) process.env.HOME = '/home/node';

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

const docs = new Map<string, { doc: Y.Doc; awareness: awarenessProtocol.Awareness }>();
const getOrCreateDoc = (docName: string) => {
    return map.setIfUndefined(docs, docName, () => {
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        return { doc, awareness };
    });
};

/**
 * PRODUCTION PROXY CONFIG (2026 Optimized)
 */
const proxy = httpProxy.createProxyServer({
    ws: true,
    xfwd: true,
    timeout: 30000,
    proxyTimeout: 30000
});

// 🟢 Production Pre-flight Diagnostics (April 2026)
console.log('----------------------------------------------------');
console.log(`[BOOT] ${APP_CONFIG.NAME} ${APP_CONFIG.VERSION} Initialized.`);
console.log(`[BOOT] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[BOOT] Database State: ${process.env.TURSO_URL ? '✅ CONFIGURED' : '❌ MISSING'}`);
console.log(`[BOOT] Persistence Link: ${process.env.HF_TOKEN ? '✅ CONFIGURED' : '⚠️ UNLINKED'}`);
console.log('----------------------------------------------------');

/**
 * Custom renderer for Proxy Errors and Booting screens.
 */
function renderProxyError(res: ServerResponse, error: string, id: string) {
    res.writeHead(502, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Workspace Connection Failure</title>
            <style>
                body { background: #0f1117; color: #e2e8f0; font-family: -apple-system, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                .card { background: #1e293b; padding: 2.5rem; border-radius: 1rem; border: 1px solid #334155; text-align: center; max-width: 450px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
                h1 { color: #f87171; font-size: 1.5rem; margin-bottom: 1rem; }
                p { font-size: 0.875rem; color: #94a3b8; line-height: 1.6; }
                .id { font-family: monospace; background: #0f172a; padding: 0.4rem 0.6rem; border-radius: 0.4rem; color: #38bdf8; font-size: 0.8rem; }
                .btn { display: inline-block; background: #38bdf8; color: #0f172a; padding: 0.6rem 1.2rem; border-radius: 0.4rem; text-decoration: none; font-weight: bold; margin-top: 1.5rem; transition: transform 0.2s; }
                .btn:hover { transform: scale(1.05); }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Workspace Connection Restricted</h1>
                <p>Native isolation link for <span class="id">${id}</span> failed.</p>
                <p style="margin-top: 1rem; text-align: left; padding: 1rem; background: #0f172a; border-radius: 0.5rem; font-size: 0.75rem; color: #64748b;">
                    <b>Diagnostic:</b> ${error}<br>
                    <b>Target:</b> Hugging Face Space (Sandboxed)
                </p>
                <a href="/dashboard/booting?id=${id}" class="btn">Auto-Repair & Boot</a>
            </div>
        </body>
        </html>
    `);
}

proxy.on("error", (err: Error, req: IncomingMessage, res: ServerResponse | Duplex) => {
    const host = req.headers.host || "";
    const fullUrl = new URL(req.url || "/", `http://${host}`);
    const pathname = fullUrl.pathname;
    
    const headerId = req.headers['x-codeverse-id'] as string;
    const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
    const id = headerId || (workspaceHostMatch ? workspaceHostMatch[1] : (pathname.split("/")[2] || "unknown"));
    
    console.error(`[Proxy Connection Error] ${err.message} for workspace/${id}`);
    
    if (res instanceof ServerResponse) {
        renderProxyError(res, err.message, id);
    }
});

proxy.on("proxyReq", (proxyReq, req: IncomingMessage) => {
    const id = req.headers['x-codeverse-id'] as string;
    const type = req.headers['x-codeverse-type'] as string;
    if (id && type) {
        proxyReq.setHeader('x-codeverse-id', id);
        proxyReq.setHeader('x-codeverse-type', type);
    }
});

proxy.on("proxyRes", (proxyRes, req: IncomingMessage) => {
    const id = req.headers['x-codeverse-id'] as string;
    const type = req.headers['x-codeverse-type'] as string;
    if (id && type && proxyRes.headers.location) {
        const originalLocation = proxyRes.headers.location;
        if (originalLocation.startsWith('/') && !originalLocation.startsWith(`/${type}/${id}`)) {
            proxyRes.headers.location = `/${type}/${id}${originalLocation}`;
        }
    }
});

app.prepare()
  .then(() => {
    // Validate Production Environment (April 2026 Resilience)
    const envStatus = validateEnvironment();
    if (!envStatus.valid) {
        console.error("[BOOT:ERROR] Infrastructure missing core secrets:", envStatus.missing.join(', '));
    }

    if (envStatus.valid) {
        // Correct initDb call passing the client to avoid circular dependencies
        initDb(dbClient)
            .then(() => {
                console.log("[BOOT] Database synchronized.");
                prewarmWorkspace({ 
                    id: 'baseline-warmup', 
                    userId: 'system', 
                    projectName: 'CodeVerse-Internal' 
                }).catch(err => console.error("[BOOT] Warmup failed:", err));
            })
            .catch(err => console.error("[BOOT] Database init failed:", err));
        
        // 🛠️ Self-Healing: Reconnect to orphans from previous instance
        reconnectRunningWorkspaces().catch(err => console.error("[BOOT] Reconnection failed:", err));
        
        // 🛡️ Persistence: Global heartbeat
        HFStorage.startAutoSave(INFRA_CONFIG.PERSISTENCE_INTERVAL_MS * 5); 
        startAutoSleepCron();
    }

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const host = req.headers.host || "localhost";
        const fullUrl = new URL(req.url || "/", `http://${host}`);
        const { pathname } = fullUrl;

        // 🚑 INFRASTRUCTURE MAINTENANCE (April 2026): Intercept requests if configuration is missing
        if (!envStatus.valid && pathname !== "/api/health" && !pathname.startsWith("/_next/")) {
            res.writeHead(503, { 'Content-Type': 'text/html' });
            return res.end(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>${APP_CONFIG.NAME} | ${UI_STRINGS.MAINTENANCE_TITLE}</title>
                    <style>
                        body { background: #09090b; color: #a1a1aa; font-family: sans-serif; height: 100vh; display: flex; align-items: center; justify-content: center; margin: 0; }
                        .panic-card { background: #18181b; border: 1px solid #27272a; padding: 2.5rem; border-radius: 1rem; max-width: 550px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); }
                        h1 { color: #f4f4f5; font-size: 1.5rem; margin: 0 0 1rem; }
                        .desc { font-size: 0.9rem; line-height: 1.6; margin-bottom: 2rem; }
                        .status { display: flex; flex-direction: column; gap: 0.75rem; margin: 1.5rem 0; }
                        .item { padding: 0.75rem; border-radius: 0.5rem; background: #09090b; font-size: 0.875rem; border: 1px solid #27272a; display: flex; align-items: center; gap: 0.5rem; }
                        .item.missing { color: #f87171; border-color: #450a0a; }
                    </style>
                </head>
                <body>
                    <div class="panic-card">
                        <h1>${UI_STRINGS.MAINTENANCE_TITLE}</h1>
                        <p class="desc">${UI_STRINGS.MAINTENANCE_MESSAGE}</p>
                        <div class="status">
                            ${envStatus.missing.map(m => `<div class="item missing"><span>❌</span> ${m}</div>`).join('')}
                        </div>
                    </div>
                </body>
                </html>
            `);
        }

        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        const id = workspaceHostMatch ? workspaceHostMatch[1] : (pathname?.startsWith("/workspace/") ? pathname.split("/")[2] : null);

        if (id) {
            const isReady = isNativeWorkspaceRunning(id);
            if (isReady) {
                const port = getNativeWorkspacePort(id) || 8080;
                req.headers['x-codeverse-id'] = id;
                req.headers['x-codeverse-type'] = 'workspace';
                
                const prefix = `/workspace/${id}`;
                if (req.url?.startsWith(prefix)) {
                    req.url = req.url.substring(prefix.length);
                    if (!req.url.startsWith("/")) req.url = "/" + req.url;
                }
                
                return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
            } else if (!pathname?.startsWith("/api/")) {
                res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '5' });
                res.end(`
                    <html>
                        <head>
                            <title>${APP_CONFIG.NAME} | Booting Workspace</title>
                            <style>
                                body { background: #09090b; color: #71717a; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                                .container { text-align: center; border: 1px solid #27272a; padding: 2rem; border-radius: 1rem; background: #111113; }
                                .spinner { width: 40px; height: 40px; border: 3px solid #3f3f46; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
                                h1 { color: #f4f4f5; font-size: 1.25rem; }
                                @keyframes spin { to { transform: rotate(360deg); } }
                            </style>
                            <script>setTimeout(() => window.location.reload(), 3000);</script>
                        </head>
                        <body>
                            <div class="container">
                                <div class="spinner"></div>
                                <h1>Workspace is Booting</h1>
                                <p>Preparing your agentic session...</p>
                            </div>
                        </body>
                    </html>
                `);
                return;
            }
        }

        handle(req, res);
    });

    const io = new Server(server, { path: "/api/socketio" });
    const yjsWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const host = req.headers.host || "localhost";
        const fullUrl = new URL(req.url || "/", `http://${host}`);
        const { pathname } = fullUrl;

        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        const id = workspaceHostMatch ? workspaceHostMatch[1] : (pathname?.startsWith("/workspace/") ? pathname.split("/")[2] : null);

        if (id && isNativeWorkspaceRunning(id)) {
            const port = getNativeWorkspacePort(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            
            const prefix = `/workspace/${id}`;
            if (req.url?.startsWith(prefix)) {
                req.url = req.url.substring(prefix.length);
                if (!req.url.startsWith("/")) req.url = "/" + req.url;
            }
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }

        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }
    });

    yjsWss.on("connection", (conn: WebSocket, request: IncomingMessage) => {
        const host = request.headers.host || "localhost";
        const fullUrl = new URL(request.url || "/", `http://${host}`);
        const docName = fullUrl.searchParams.get('doc') || "default";
        const { doc, awareness } = getOrCreateDoc(docName);
        conn.binaryType = "arraybuffer";

        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0);
        syncProtocol.writeSyncStep1(encoder, doc);
        conn.send(encoding.toUint8Array(encoder));

        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, 1);
        encoding.writeVarUint8Array(awarenessEncoder, awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys())));
        conn.send(encoding.toUint8Array(awarenessEncoder));

        conn.on("message", (message: ArrayBuffer) => {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);
            if (messageType === 0) {
                encoding.writeVarUint(encoder, 0);
                syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) {
                    conn.send(encoding.toUint8Array(encoder));
                }
            } else if (messageType === 1) {
                awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn);
            }
        });

        const updateHandler = (update: Uint8Array, origin: unknown) => {
            if (origin !== conn) {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, 0);
                syncProtocol.writeUpdate(encoder, update);
                conn.send(encoding.toUint8Array(encoder));
            }
        };

        doc.on("update", updateHandler);
        conn.on("close", () => {
            doc.off("update", updateHandler);
            awarenessProtocol.removeAwarenessStates(awareness, [doc.clientID], null);
        });
    });

    io.on("connection", (socket) => {
        let shell: pty.IPty | null = null;
        socket.on("terminal:start", ({ cols, rows }: { cols: number; rows: number }) => {
            const shellPath = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");
            shell = pty.spawn(shellPath, [], {
                name: "xterm-color",
                cols: cols || 80,
                rows: rows || 24,
                cwd: INFRA_CONFIG.WORKSPACE_ROOT,
                env: process.env as Record<string, string>,
            });
            shell.onData((data: string) => socket.emit("terminal:data", data));
        });
        socket.on("terminal:write", (data: string) => { if (shell) shell.write(data); });
        socket.on("terminal:resize", ({ cols, rows }: { cols: number; rows: number }) => { if (shell) try { shell.resize(cols, rows); } catch {} });
        socket.on("disconnect", () => { if (shell) { shell.kill(); shell = null; } });
    });

    const PORT = process.env.PORT || 7860;
    server.listen(PORT, () => {
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
