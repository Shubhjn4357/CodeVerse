import { createServer, IncomingMessage, ServerResponse } from "http";
import { parse } from "url";
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
import { getNativeWorkspacePort, getAndroidPort } from "./lib/docker/manager";
import { initDb } from "./lib/db/schema";
import httpProxy from "http-proxy";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

// Yjs Doc Management
const docs = new Map<string, { doc: Y.Doc; awareness: awarenessProtocol.Awareness }>();
const getOrCreateDoc = (docName: string) => {
    return map.setIfUndefined(docs, docName, () => {
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        return { doc, awareness };
    });
};
const proxy = httpProxy.createProxyServer({});

/**
 * Custom renderer for Proxy Errors and Booting screens.
 * Prevents ECONNREFUSED from showing a generic 502 to the user.
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
                <a href="javascript:location.reload()" class="btn">Retry Link</a>
                <a href="/dashboard/system" class="terminal-link">Open Direct Terminal</a>
            </div>
        </body>
        </html>
    `);
}

proxy.on("error", (err: Error, req: IncomingMessage, res: ServerResponse | Duplex) => {
    const host = req.headers.host || "";
    const parsedUrl = parse(req.url || "/", true);
    const pathname = parsedUrl.pathname || "/";
    const parts = pathname.split("/");
    
    // Multi-layer Identity Detection
    // 1. Session header injected by proxy logic
    // 2. Subdomain identifier
    // 3. Path-based identifier
    const headerId = req.headers['x-codeverse-id'] as string;
    const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
    const id = headerId || (workspaceHostMatch ? workspaceHostMatch[1] : (parts[2] || "unknown"));
    
    const type = pathname.startsWith("/android/") ? "android" : (pathname.startsWith("/preview/") ? "preview" : "workspace");

    console.error(`[Proxy Connection Error] ${err.message} for ${type}/${id}`);
    
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
            console.log(`[PROXY-REWRITE] Redirect ${originalLocation} -> ${proxyRes.headers.location}`);
        }
    }
});

app.prepare()
  .then(() => {
    initDb().catch(err => console.error("[BOOT] Database init failed:", err));
    startAutoSleepCron();

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const parsedUrl = parse(req.url!, true);
        const { pathname } = parsedUrl;
        const host = req.headers.host || "";

        // Standard ID Detection for routing
        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        if (workspaceHostMatch) {
            const id = workspaceHostMatch[1];
            const port = getNativeWorkspacePort(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }

        if (pathname?.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const id = parts[2];
            const port = getNativeWorkspacePort(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }

        if (pathname?.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = getAndroidPort() || 6080;
            req.headers['x-codeverse-id'] = parts[2];
            req.headers['x-codeverse-type'] = 'android';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }

        if (pathname?.startsWith("/preview/")) {
            const parts = pathname.split("/");
            req.headers['x-codeverse-id'] = parts[2];
            req.headers['x-codeverse-type'] = 'preview';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:3000`, changeOrigin: true });
        }

        handle(req, res, parsedUrl);
    });

    const io = new Server(server, { path: "/api/socketio" });
    const yjsWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const parsedUrl = parse(req.url || "/", true);
        const { pathname } = parsedUrl;
        const host = req.headers.host || "";

        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        if (workspaceHostMatch) {
            const id = workspaceHostMatch[1];
            const port = getNativeWorkspacePort(id) || 8080;
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }

        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }

        if (pathname?.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const port = getNativeWorkspacePort(parts[2]) || 8080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }

        if (pathname?.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = getAndroidPort() || 6080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
    });

    yjsWss.on("connection", (conn: WebSocket, request: IncomingMessage) => {
        const { query } = parse(request.url || "/", true);
        const docName = (query.doc as string) || "default";
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
                if (encoding.length(encoder) > 1) conn.send(encoding.toUint8Array(encoder));
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
            // Priority path for HF Spaces (Bash first)
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
        if (process.env.SPACE_ID) {
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
