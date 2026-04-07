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
import { getNativeWorkspacePort, isNativeWorkspaceRunning, prewarmWorkspace, reconnectRunningWorkspaces } from "./lib/docker/manager";
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

const proxy = httpProxy.createProxyServer({
    ws: true,
    xfwd: true,
    timeout: 30000,
    proxyTimeout: 30000
});

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

// Port and Host logic
const PORT = Number(process.env.PORT) || 7860;
const HOST = '0.0.0.0';

let isAppReady = false;
let envStatus = { valid: true, missing: [] as string[] };

/**
 *Autoritative Entrypoint: We initialize the HTTP server immediately to satisfy HF Spaces health checks.
 */
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = req.headers.host || "localhost";
    const fullUrl = new URL(req.url || "/", `http://${host}`);
    const { pathname } = fullUrl;

    // 1. Initializing State
    if (!isAppReady && !pathname.startsWith("/_next/static") && pathname !== "/favicon.ico") {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(`
            <html>
                <head>
                    <title>CodeVerse | Initializing</title>
                    <style>
                        body { background: #09090b; color: #71717a; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                        .container { text-align: center; border: 1px solid #27272a; padding: 2.5rem; border-radius: 1rem; background: #111113; max-width: 400px; }
                        .spinner { width: 30px; height: 30px; border: 2px solid #3f3f46; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
                        h1 { color: #f4f4f5; font-size: 1.1rem; margin: 0; }
                        p { font-size: 0.85rem; margin-top: 0.5rem; }
                        @keyframes spin { to { transform: rotate(360deg); } }
                    </style>
                    <script>setTimeout(() => window.location.reload(), 5000);</script>
                </head>
                <body>
                    <div class="container">
                        <div class="spinner"></div>
                        <h1>CodeVerse is waking up</h1>
                        <p>Restoring your environment and securing persistent volumes...</p>
                    </div>
                </body>
            </html>
        `);
    }

    // 2. Maintenance / Misconfiguration State
    if (isAppReady && !envStatus.valid && pathname !== "/api/health" && !pathname.startsWith("/_next/")) {
        res.writeHead(503, { 'Content-Type': 'text/html' });
        return res.end(`
            <html>
                <body style="background:#09090b;color:#f87171;padding:2rem;font-family:sans-serif;">
                    <h1>Infrastructure Error</h1>
                    <p>${UI_STRINGS.MAINTENANCE_MESSAGE}</p>
                    <ul>${envStatus.missing.map(m => `<li>${m}</li>`).join('')}</ul>
                </body>
            </html>
        `);
    }

    // 3. Workspace Proxying
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
            // 🚑 WORKSPACE BOOTING FALLBACK: Prevent Next.js 404 while workspace is initializing
            res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '5' });
            return res.end(`
                <html>
                    <head>
                        <title>CodeVerse | Booting Workspace</title>
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
        }
    }

    // 4. Default Next.js Handle
    handle(req, res);
});

// Setup Sockets
const io = new Server(server, { path: "/api/socketio" });
const yjsWss = new WebSocketServer({ noServer: true });

// Start Listening Immediately
server.listen(PORT, HOST, () => {
    console.log('----------------------------------------------------');
    console.log(`[READY] ${APP_CONFIG.NAME} ${APP_CONFIG.VERSION}`);
    console.log(`[READY] Interface: ${HOST}:${PORT}`);
    console.log('----------------------------------------------------');
});

// Background Async Initialization
(async () => {
    try {
        console.log("[BOOT] Starting Next.js preparation...");
        await app.prepare();
        console.log("[BOOT] Next.js payload ready.");

        envStatus = validateEnvironment();
        if (envStatus.valid) {
            console.log("[BOOT] Environment validated. Synchronizing database...");
            await initDb(dbClient);
            console.log("[BOOT] Database synchronized.");
            
            // Reconnect and Warmup
            reconnectRunningWorkspaces().catch(() => {});
            prewarmWorkspace({ id: 'baseline-warmup', userId: 'system', projectName: 'CodeVerse-Internal' }).catch(() => {});
            
            // Crons and Persistence
            HFStorage.startAutoSave(INFRA_CONFIG.PERSISTENCE_INTERVAL_MS * 5); 
            startAutoSleepCron();
        }

        isAppReady = true;
        console.log("[BOOT] Global state stabilized. Application is fully operational.");
    } catch (err) {
        console.error("[BOOT:ERROR] Fatal initialization failure:", err);
    }
})();

// Terminal and Collaboration Handlers
server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url || "/", `http://${req.headers.host}`);
    if (pathname === "/api/collab") {
        yjsWss.handleUpgrade(req, socket, head, (ws) => {
            yjsWss.emit("connection", ws, req);
        });
    }
});

yjsWss.on("connection", (conn: WebSocket, request: IncomingMessage) => {
    const { doc, awareness } = getOrCreateDoc(new URL(request.url || "/", "http://l").searchParams.get('doc') || "default");
    conn.binaryType = "arraybuffer";
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);
    conn.send(encoding.toUint8Array(encoder));

    conn.on("message", (message: ArrayBuffer) => {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);
        if (messageType === 0) {
            encoding.writeVarUint(encoder, 0);
            syncProtocol.readSyncMessage(decoder, encoder, doc, null);
            if (encoding.length(encoder) > 1) conn.send(encoding.toUint8Array(encoder));
        }
    });
});

io.on("connection", (socket) => {
    let shell: pty.IPty | null = null;
    socket.on("terminal:start", ({ cols, rows }) => {
        shell = pty.spawn(process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash"), [], {
            cols: cols || 80,
            rows: rows || 24,
            cwd: INFRA_CONFIG.WORKSPACE_ROOT,
            env: process.env as Record<string, string>,
        });
        shell.onData((data: string) => socket.emit("terminal:data", data));
    });
    socket.on("terminal:write", (data) => { if (shell) shell.write(data); });
    socket.on("disconnect", () => { if (shell) shell.kill(); });
});
