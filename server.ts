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
import { getNativeWorkspacePort, getAndroidPort, isNativeWorkspaceRunning, prewarmWorkspace } from "./lib/docker/manager";
import { initDb } from "./lib/db/schema";
import { validateEnvironment } from "./lib/env-config";
import httpProxy from "http-proxy";

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
console.log('[BOOT] CodeVerse Production Entrypoint Initialized.');
console.log(`[BOOT] Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`[BOOT] Database State: ${process.env.TURSO_URL || process.env.turso_database_url ? '✅ CONFIGURED' : '❌ MISSING (TURSO_URL)'}`);
console.log(`[BOOT] Persistence Link: ${process.env.HF_TOKEN || process.env.hfToken ? '✅ CONFIGURED' : '⚠️ UNLINKED (HF_TOKEN Missing)'}`);
console.log(`[BOOT] Stack Limit: ${process.env.ULIMIT_S || 'Container Default'}`);
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
                .terminal-link { color: #64748b; font-size: 0.7rem; text-decoration: underline; margin-top: 2rem; display: block; }
            </style>
        </head>
        <body>
            <div class="card">
                <h1>Workspace Connection Restricted</h1>
                <p>Native isolation link for <span class="id">${id}</span> failed.</p>
                <p style="margin-top: 1rem; text-align: left; padding: 1rem; background: #0f172a; border-radius: 0.5rem; font-size: 0.75rem; color: #64748b;">
                    <b>Diagnostic:</b> ${error}<br>
                    <b>Target:</b> Hugging Face Space (Sandboxed)<br>
                    <b>Status:</b> Use the built-in system terminal to interact with files directly if the core IDE remains unreachable.
                </p>
                <a href="/dashboard/booting?id=${id}" class="btn">Auto-Repair & Boot</a>
                <a href="/dashboard/system" class="terminal-link">Open Direct Terminal</a>
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

proxy.on("proxyReq", (proxyReq, req) => {
    const id = req.headers['x-codeverse-id'] as string;
    const type = req.headers['x-codeverse-type'] as string;
    if (id && type) {
        proxyReq.setHeader('x-codeverse-id', id);
        proxyReq.setHeader('x-codeverse-type', type);
    }
});

proxy.on("proxyRes", (proxyRes, req) => {
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
    // Validate Production Environment
    const envStatus = validateEnvironment();
    if (!envStatus.valid) {
        console.error("[CRITICAL] Infrastructure missing core secrets:", envStatus.missing.join(', '));
        if (process.env.NODE_ENV === 'production') process.exit(1);
    }

    initDb()
        .then(() => {
            console.log("[BOOT] Database synchronized.");
            prewarmWorkspace({ id: 'baseline-warmup', userId: 'system', projectName: 'CodeVerse-Internal' })
                .catch(err => console.error("[BOOT] Warmup failed:", err));
        })
        .catch(err => console.error("[BOOT] Database init failed:", err));
        
    startAutoSleepCron();

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const host = req.headers.host || "localhost";
        const fullUrl = new URL(req.url || "/", `http://${host}`);
        const { pathname } = fullUrl;

        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        const id = workspaceHostMatch ? workspaceHostMatch[1] : (pathname?.startsWith("/workspace/") ? pathname.split("/")[2] : null);

        if (id) {
            // PROXY LOGIC (April 2026): Only proxy if not a main dashboard request.
            const isReady = isNativeWorkspaceRunning(id);
            if (isReady) {
                const port = getNativeWorkspacePort(id) || 8080;
                req.headers['x-codeverse-id'] = id;
                req.headers['x-codeverse-type'] = 'workspace';
                
                // CRITICAL: Preserve Query Parameters (?folder=...)
                const prefix = `/workspace/${id}`;
                if (req.url?.startsWith(prefix)) {
                    req.url = req.url.substring(prefix.length);
                    if (!req.url.startsWith("/")) req.url = "/" + req.url;
                }
                
                console.log(`[PROXY:IDE] Mapping ${pathname} -> 127.0.0.1:${port}${req.url}`);
                return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
            }
            // Fallthrough to Next.js handler if not ready
        }

        if (pathname?.startsWith("/android/")) {
            const port = getAndroidPort() || 6080;
            const aId = pathname.split("/")[2] || "android-unified";
            req.headers['x-codeverse-id'] = aId;
            req.headers['x-codeverse-type'] = 'android';
            
            const prefix = `/android/${aId}`;
            if (req.url?.startsWith(prefix)) {
                req.url = req.url.substring(prefix.length);
                if (!req.url.startsWith("/")) req.url = "/" + req.url;
            }

            console.log(`[PROXY:ANDROID] Mapping ${pathname} -> 127.0.0.1:${port}${req.url}`);
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }

        if (pathname === "/api/stats") {
            const stats = {
                rss: process.memoryUsage().rss,
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal,
                loadAvg: os.loadavg(),
                uptime: process.uptime()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(stats));
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
            
            console.log(`[PROXY:WS] Upgrading ${pathname} -> 127.0.0.1:${port}${req.url}`);
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }

        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }

        if (pathname?.startsWith("/android/")) {
            const port = getAndroidPort() || 6080;
            const aId = pathname.split("/")[2] || "android-unified";
            req.headers['x-codeverse-id'] = aId;
            req.headers['x-codeverse-type'] = 'android';
            
            const prefix = `/android/${aId}`;
            if (req.url?.startsWith(prefix)) {
                req.url = req.url.substring(prefix.length);
                if (!req.url.startsWith("/")) req.url = "/" + req.url;
            }
            
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
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

    /**
     * PROXY GLOBAL LISTENERS
     */
    proxy.on("proxyReq", (proxyReq, req: IncomingMessage) => {
        const id = req.headers['x-codeverse-id'] as string;
        const type = req.headers['x-codeverse-type'] as string;
        if (id) proxyReq.setHeader('x-codeverse-id', id);
        if (type) proxyReq.setHeader('x-codeverse-type', type);
        
        const proto = req.headers['x-forwarded-proto'] || 'http';
        proxyReq.setHeader('X-Forwarded-Proto', proto);
        const host = req.headers.host;
        if (host) proxyReq.setHeader('X-Forwarded-Host', host);
    });

    proxy.on("proxyRes", (proxyRes, req: IncomingMessage) => {
        const id = req.headers['x-codeverse-id'] as string;
        const type = req.headers['x-codeverse-type'] as string;
        const location = proxyRes.headers.location;

        if (location && id && type) {
            const prefix = type === 'workspace' ? `/workspace/${id}` : '/android';
            if (location.startsWith("/") && !location.startsWith(prefix)) {
                proxyRes.headers.location = prefix + location;
            } else if (location.includes("127.0.0.1") || location.includes("localhost")) {
                try {
                    const locUrl = new URL(location);
                    proxyRes.headers.location = prefix + locUrl.pathname + locUrl.search;
                } catch {}
            }
        }
    });

    io.on("connection", (socket) => {
        let shell: pty.IPty | null = null;
        socket.on("terminal:start", ({ cols, rows }: { cols: number; rows: number }) => {
            const shellPath = process.env.SHELL || (os.platform() === "win32" ? "powershell.exe" : "bash");
            shell = pty.spawn(shellPath, [], {
                name: "xterm-color",
                cols: cols || 80,
                rows: rows || 24,
                cwd: (process.env.HOME || process.cwd()) as string,
                env: process.env as Record<string, string>,
            });
            shell.onData((data: string) => socket.emit("terminal:data", data));
            shell.onExit(({ exitCode }) => socket.emit("terminal:data", `\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`));
        });
        socket.on("terminal:write", (data: string) => { if (shell) shell.write(data); });
        socket.on("terminal:resize", ({ cols, rows }: { cols: number; rows: number }) => { if (shell) try { shell.resize(cols, rows); } catch (e) { console.error(e); } });
        socket.on("disconnect", () => { if (shell) { shell.kill(); shell = null; } });
    });

    const PORT = process.env.PORT || 7860;
    server.listen(PORT, () => {
        let inferredUrl = `http://localhost:${PORT}`;
        
        if (process.env.SIMULATE_HF === 'true') {
            console.warn("⚠️  HUGGING FACE SIMULATION MODE ACTIVE (Shared Memory, Native Fallback, Sandboxed FS)");
        }

        if (process.env.SPACE_ID && process.env.SPACE_ID.includes('/')) {
            const [user, name] = process.env.SPACE_ID.split('/');
            inferredUrl = `https://${user.toLowerCase()}-${name.toLowerCase()}.hf.space`;
        }
        const pingUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.HF_URL || inferredUrl;
        console.log(`> Ready on ${pingUrl}`);
        
        setInterval(() => {
            fetch(`${pingUrl}/api/health`)
                .then(res => res.json())
                .catch(() => {});
        }, 5 * 60 * 1000);
    });
});
