"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const next_1 = __importDefault(require("next"));
const socket_io_1 = require("socket.io");
const ws_1 = require("ws");
const Y = __importStar(require("yjs"));
const awarenessProtocol = __importStar(require("y-protocols/awareness"));
const syncProtocol = __importStar(require("y-protocols/sync"));
const encoding = __importStar(require("lib0/encoding"));
const decoding = __importStar(require("lib0/decoding"));
const map = __importStar(require("lib0/map"));
const pty = __importStar(require("node-pty"));
const os_1 = __importDefault(require("os"));
const auto_sleep_1 = require("./lib/jobs/auto-sleep");
const manager_1 = require("./lib/docker/manager");
const schema_1 = require("./lib/db/schema");
const env_config_1 = require("./lib/env-config");
const http_proxy_1 = __importDefault(require("http-proxy"));
const dev = process.env.NODE_ENV !== "production";
const app = (0, next_1.default)({ dev });
const handle = app.getRequestHandler();
const docs = new Map();
const getOrCreateDoc = (docName) => {
    return map.setIfUndefined(docs, docName, () => {
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        return { doc, awareness };
    });
};
/**
 * PRODUCTION PROXY CONFIG (2026 Optimized)
 */
const proxy = http_proxy_1.default.createProxyServer({
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
function renderProxyError(res, error, id) {
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
proxy.on("error", (err, req, res) => {
    const host = req.headers.host || "";
    const fullUrl = new URL(req.url || "/", `http://${host}`);
    const pathname = fullUrl.pathname;
    const headerId = req.headers['x-codeverse-id'];
    const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
    const id = headerId || (workspaceHostMatch ? workspaceHostMatch[1] : (pathname.split("/")[2] || "unknown"));
    console.error(`[Proxy Connection Error] ${err.message} for workspace/${id}`);
    if (res instanceof http_1.ServerResponse) {
        renderProxyError(res, err.message, id);
    }
});
proxy.on("proxyReq", (proxyReq, req) => {
    const id = req.headers['x-codeverse-id'];
    const type = req.headers['x-codeverse-type'];
    if (id && type) {
        proxyReq.setHeader('x-codeverse-id', id);
        proxyReq.setHeader('x-codeverse-type', type);
    }
});
proxy.on("proxyRes", (proxyRes, req) => {
    const id = req.headers['x-codeverse-id'];
    const type = req.headers['x-codeverse-type'];
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
    const envStatus = (0, env_config_1.validateEnvironment)();
    if (!envStatus.valid) {
        console.error("[CRITICAL] Infrastructure missing core secrets:", envStatus.missing.join(', '));
        if (process.env.NODE_ENV === 'production')
            process.exit(1);
    }
    (0, schema_1.initDb)()
        .then(() => {
        console.log("[BOOT] Database synchronized.");
        (0, manager_1.prewarmWorkspace)({ id: 'baseline-warmup', userId: 'system', projectName: 'CodeVerse-Internal' })
            .catch(err => console.error("[BOOT] Warmup failed:", err));
    })
        .catch(err => console.error("[BOOT] Database init failed:", err));
    (0, auto_sleep_1.startAutoSleepCron)();
    const server = (0, http_1.createServer)((req, res) => {
        const host = req.headers.host || "localhost";
        const fullUrl = new URL(req.url || "/", `http://${host}`);
        const { pathname } = fullUrl;
        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        const id = workspaceHostMatch ? workspaceHostMatch[1] : ((pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) ? pathname.split("/")[2] : null);
        if (id) {
            if (!(0, manager_1.isNativeWorkspaceRunning)(id)) {
                res.writeHead(302, { Location: `/dashboard/booting?id=${id}` });
                return res.end();
            }
            const port = (0, manager_1.getNativeWorkspacePort)(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
                req.url = "/" + pathname.split("/").slice(3).join("/");
            }
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const port = (0, manager_1.getAndroidPort)() || 6080;
            const id = pathname.split("/")[2] || "android-unified";
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'android';
            req.url = "/" + pathname.split("/").slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }
        if (pathname === "/api/stats") {
            const stats = {
                rss: process.memoryUsage().rss,
                heapUsed: process.memoryUsage().heapUsed,
                heapTotal: process.memoryUsage().heapTotal,
                loadAvg: os_1.default.loadavg(),
                uptime: process.uptime()
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            return res.end(JSON.stringify(stats));
        }
        handle(req, res);
    });
    const io = new socket_io_1.Server(server, { path: "/api/socketio" });
    const yjsWss = new ws_1.WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const host = req.headers.host || "localhost";
        const fullUrl = new URL(req.url || "/", `http://${host}`);
        const { pathname } = fullUrl;
        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        const id = workspaceHostMatch ? workspaceHostMatch[1] : ((pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) ? pathname.split("/")[2] : null);
        if (id && (0, manager_1.isNativeWorkspaceRunning)(id)) {
            const port = (0, manager_1.getNativeWorkspacePort)(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
                req.url = "/" + pathname.split("/").slice(3).join("/");
            }
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const port = (0, manager_1.getAndroidPort)() || 6080;
            const id = pathname.split("/")[2] || "android-unified";
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'android';
            req.url = "/" + pathname.split("/").slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
    });
    yjsWss.on("connection", (conn, request) => {
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
        conn.on("message", (message) => {
            const encoder = encoding.createEncoder();
            const decoder = decoding.createDecoder(new Uint8Array(message));
            const messageType = decoding.readVarUint(decoder);
            if (messageType === 0) {
                encoding.writeVarUint(encoder, 0);
                syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                if (encoding.length(encoder) > 1) {
                    conn.send(encoding.toUint8Array(encoder));
                }
            }
            else if (messageType === 1) {
                awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), conn);
            }
        });
        const updateHandler = (update, origin) => {
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
    proxy.on("proxyReq", (proxyReq, req) => {
        const id = req.headers['x-codeverse-id'];
        const type = req.headers['x-codeverse-type'];
        if (id)
            proxyReq.setHeader('x-codeverse-id', id);
        if (type)
            proxyReq.setHeader('x-codeverse-type', type);
        const proto = req.headers['x-forwarded-proto'] || 'http';
        proxyReq.setHeader('X-Forwarded-Proto', proto);
        const host = req.headers.host;
        if (host)
            proxyReq.setHeader('X-Forwarded-Host', host);
    });
    proxy.on("proxyRes", (proxyRes, req) => {
        const id = req.headers['x-codeverse-id'];
        const type = req.headers['x-codeverse-type'];
        const location = proxyRes.headers.location;
        if (location && id && type) {
            const prefix = type === 'workspace' ? `/workspace/${id}` : '/android';
            if (location.startsWith("/") && !location.startsWith(prefix)) {
                proxyRes.headers.location = prefix + location;
            }
            else if (location.includes("127.0.0.1") || location.includes("localhost")) {
                try {
                    const locUrl = new URL(location);
                    proxyRes.headers.location = prefix + locUrl.pathname + locUrl.search;
                }
                catch (_a) { }
            }
        }
    });
    io.on("connection", (socket) => {
        let shell = null;
        socket.on("terminal:start", ({ cols, rows }) => {
            const shellPath = process.env.SHELL || (os_1.default.platform() === "win32" ? "powershell.exe" : "bash");
            shell = pty.spawn(shellPath, [], {
                name: "xterm-color",
                cols: cols || 80,
                rows: rows || 24,
                cwd: (process.env.HOME || process.cwd()),
                env: process.env,
            });
            shell.onData((data) => socket.emit("terminal:data", data));
            shell.onExit(({ exitCode }) => socket.emit("terminal:data", `\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`));
        });
        socket.on("terminal:write", (data) => { if (shell)
            shell.write(data); });
        socket.on("terminal:resize", ({ cols, rows }) => { if (shell)
            try {
                shell.resize(cols, rows);
            }
            catch (e) {
                console.error(e);
            } });
        socket.on("disconnect", () => { if (shell) {
            shell.kill();
            shell = null;
        } });
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
                .catch(() => { });
        }, 5 * 60 * 1000);
    });
});
