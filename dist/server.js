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
/**
 * 🛰️ GLOBAL STABILIZATION (April 2026): Catch unhandled errors that cause HF Space restarts.
 */
process.on('uncaughtException', (err) => { console.error('[FATAL:EXCEPTION]', err); });
process.on('unhandledRejection', (reason) => { console.error('[FATAL:REJECTION]', reason); });
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
const db_1 = require("./lib/db");
const storage_1 = require("./lib/hf/storage");
const env_config_1 = require("./lib/env-config");
const http_proxy_1 = __importDefault(require("http-proxy"));
const constants_1 = require("./constants");
/**
 * PRODUCTION HARDENING (April 2026): Force writable temp paths for HF Spaces.
 */
process.env.TMPDIR = constants_1.INFRA_CONFIG.TMPDIR;
process.env.HF_HOME = constants_1.INFRA_CONFIG.HF_HOME;
if (!process.env.HOME)
    process.env.HOME = '/home/node';
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
const proxy = http_proxy_1.default.createProxyServer({
    ws: true,
    xfwd: true,
    timeout: 30000,
    proxyTimeout: 30000
});
function getWorkspaceRequestContext(req) {
    var _a;
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url || '/', `http://${host}`);
    const pathname = fullUrl.pathname;
    const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
    const id = workspaceHostMatch ? workspaceHostMatch[1] : (pathname.startsWith('/workspace/') ? (_a = pathname.split('/')[2]) !== null && _a !== void 0 ? _a : null : null);
    return { host, pathname, id };
}
function prepareWorkspaceProxyRequest(req, id) {
    var _a;
    req.headers['x-codeverse-id'] = id;
    req.headers['x-codeverse-type'] = 'workspace';
    const prefix = `/workspace/${id}`;
    if ((_a = req.url) === null || _a === void 0 ? void 0 : _a.startsWith(prefix)) {
        req.url = req.url.substring(prefix.length);
        if (!req.url.startsWith('/')) {
            req.url = `/${req.url}`;
        }
    }
}
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
proxy.on("proxyReqWs", (proxyReq, req) => {
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
// Port and Host logic
const PORT = Number(process.env.PORT) || 7860;
const HOST = '0.0.0.0';
let isAppReady = false;
let envStatus = { valid: true, missing: [] };
/**
 *Autoritative Entrypoint: We initialize the HTTP server immediately to satisfy HF Spaces health checks.
 */
const server = (0, http_1.createServer)((req, res) => {
    const { pathname, id } = getWorkspaceRequestContext(req);
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
                    <p>${constants_1.UI_STRINGS.MAINTENANCE_MESSAGE}</p>
                    <ul>${envStatus.missing.map(m => `<li>${m}</li>`).join('')}</ul>
                </body>
            </html>
        `);
    }
    // 3. Workspace Proxying
    if (id) {
        const isRunning = (0, manager_1.isNativeWorkspaceRunning)(id);
        if (isRunning) {
            const port = (0, manager_1.getNativeWorkspacePort)(id);
            if (port) {
                prepareWorkspaceProxyRequest(req, id);
                return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
            }
        }
        else if (!(pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/api/"))) {
            // 🚑 WORKSPACE OFFLINE OR BOOTING: Detect if it's truly gone or just waking up
            res.writeHead(503, { 'Content-Type': 'text/html', 'Retry-After': '5' });
            return res.end(`
                <html>
                    <head>
                        <title>CodeVerse | Workspace Status</title>
                        <style>
                            body { background: #09090b; color: #71717a; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                            .container { text-align: center; border: 1px solid #27272a; padding: 2.5rem; border-radius: 1rem; background: #111113; max-width: 450px; }
                            .spinner { width: 30px; height: 30px; border: 2px solid #3f3f46; border-top-color: #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 1.5rem; }
                            h1 { color: #f4f4f5; font-size: 1.25rem; margin: 0 0 1rem; }
                            p { font-size: 0.9rem; margin-bottom: 2rem; line-height: 1.6; }
                            .btn { background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: bold; display: inline-block; transition: background 0.2s; }
                            .btn:hover { background: #2563eb; }
                            @keyframes spin { to { transform: rotate(360deg); } }
                        </style>
                        <script>setTimeout(() => window.location.reload(), 5000);</script>
                    </head>
                    <body>
                        <div class="container">
                            <div class="spinner"></div>
                            <h1>Provisioning Environment</h1>
                            <p>We're restoring your workspace from cold storage. This usually takes 30-60 seconds depending on the Nix profile complexity.</p>
                            <a href="/" class="btn">Return to Dashboard</a>
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
const io = new socket_io_1.Server(server, { path: "/api/socketio" });
const shoket = new ws_1.WebSocketServer({ noServer: true });
// Start Listening Immediately
server.listen(PORT, HOST, () => {
    console.log('----------------------------------------------------');
    console.log(`[READY] ${constants_1.APP_CONFIG.NAME} ${constants_1.APP_CONFIG.VERSION}`);
    console.log(`[READY] Interface: ${HOST}:${PORT}`);
    console.log('----------------------------------------------------');
});
// Background Async Initialization
(async () => {
    try {
        console.log("[BOOT] Starting Next.js preparation...");
        await app.prepare();
        console.log("[BOOT] Next.js payload ready.");
        envStatus = (0, env_config_1.validateEnvironment)();
        if (envStatus.valid) {
            console.log("[BOOT] Environment validated. Synchronizing database...");
            await (0, schema_1.initDb)(db_1.client);
            console.log("[BOOT] Database synchronized.");
            // Reconnect and Warmup
            (0, manager_1.reconnectRunningWorkspaces)().catch(() => { });
            (0, manager_1.prewarmWorkspace)({ id: 'baseline-warmup', userId: 'system', projectName: 'CodeVerse-Internal' }).catch(() => { });
            // Crons and Persistence
            storage_1.HFStorage.startAutoSave(constants_1.INFRA_CONFIG.PERSISTENCE_INTERVAL_MS * 5);
            (0, auto_sleep_1.startAutoSleepCron)();
        }
        isAppReady = true;
        console.log("[BOOT] Global state stabilized. Application is fully operational.");
    }
    catch (err) {
        console.error("[BOOT:ERROR] Fatal initialization failure:", err);
    }
})();
// Terminal and Collaboration Handlers
server.on("upgrade", (req, socket, head) => {
    const { pathname, id } = getWorkspaceRequestContext(req);
    if (pathname === "/api/collab") {
        shoket.handleUpgrade(req, socket, head, (ws) => {
            shoket.emit("connection", ws, req);
        });
        return;
    }
    if (id && (0, manager_1.isNativeWorkspaceRunning)(id)) {
        const port = (0, manager_1.getNativeWorkspacePort)(id);
        if (!port) {
            socket.destroy();
            return;
        }
        prepareWorkspaceProxyRequest(req, id);
        proxy.ws(req, socket, head, { target: `ws://127.0.0.1:${port}`, changeOrigin: true });
        return;
    }
    socket.destroy();
});
shoket.on("connection", (conn, request) => {
    const { doc } = getOrCreateDoc(new URL(request.url || "/", "http://l").searchParams.get('doc') || "default");
    conn.binaryType = "arraybuffer";
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 0);
    syncProtocol.writeSyncStep1(encoder, doc);
    conn.send(encoding.toUint8Array(encoder));
    conn.on("message", (message) => {
        const encoder = encoding.createEncoder();
        const decoder = decoding.createDecoder(new Uint8Array(message));
        const messageType = decoding.readVarUint(decoder);
        if (messageType === 0) {
            encoding.writeVarUint(encoder, 0);
            syncProtocol.readSyncMessage(decoder, encoder, doc, null);
            if (encoding.length(encoder) > 1)
                conn.send(encoding.toUint8Array(encoder));
        }
    });
});
io.on("connection", (socket) => {
    let shell = null;
    socket.on("terminal:start", ({ cols, rows }) => {
        shell = pty.spawn(process.env.SHELL || (os_1.default.platform() === "win32" ? "powershell.exe" : "bash"), [], {
            cols: cols || 80,
            rows: rows || 24,
            cwd: constants_1.INFRA_CONFIG.WORKSPACE_ROOT,
            env: process.env,
        });
        shell.onData((data) => socket.emit("terminal:data", data));
    });
    socket.on("terminal:write", (data) => { if (shell)
        shell.write(data); });
    socket.on("disconnect", () => { if (shell)
        shell.kill(); });
});
