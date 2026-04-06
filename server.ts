/* eslint-disable */
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

proxy.on("error", (err: Error, _req: IncomingMessage, res: ServerResponse | Duplex) => {
    console.error("[Proxy Error]", err.message);
    if (res instanceof ServerResponse) {
        res.writeHead(502);
        res.end("Workspace Proxy Error");
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
            const shellPath = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
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
