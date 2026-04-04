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
const url_1 = require("url");
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
const fs_1 = require("fs");
const auto_sleep_1 = require("./lib/jobs/auto-sleep");
const manager_1 = require("./lib/docker/manager");
const schema_1 = require("./lib/db/schema");
const http_proxy_1 = __importDefault(require("http-proxy"));
const dev = process.env.NODE_ENV !== "production";
const app = (0, next_1.default)({ dev });
const handle = app.getRequestHandler();
// Yjs Doc Management
const docs = new Map();
const getOrCreateDoc = (docName) => {
    return map.setIfUndefined(docs, docName, () => {
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        return { doc, awareness };
    });
};
const proxy = http_proxy_1.default.createProxyServer({});
proxy.on("error", (err, req, res) => {
    console.error("[Proxy Error]", err.message);
    if (res instanceof http_1.ServerResponse) {
        res.writeHead(502);
        res.end("Workspace Proxy Error");
    }
});
console.log(`[BOOT] NODE_ENV: ${process.env.NODE_ENV}, DEV: ${dev}`);
console.log("[BOOT] Initializing Next.js app.prepare()...");
app.prepare()
    .then(() => {
    console.log("[BOOT] Next.js is ready. Configuring middleware and listeners...");
    // Ensure database is up to date
    (0, schema_1.initDb)().catch(err => console.error("[BOOT] Database init failed:", err));
    // Initiate background container cleanup routines
    (0, auto_sleep_1.startAutoSleepCron)();
    const server = (0, http_1.createServer)((req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url, true);
        const { pathname } = parsedUrl;
        // 1. Workspace IDE Proxy (/workspace/:id/)
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getNativeWorkspacePort)(parts[2]) || 8080; // Fallback to 8080 for Docker
            // Strip the /workspace/:id prefix when forwarding to code-server
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://localhost:${port}` });
        }
        // 2. Android NoVNC Proxy (/android/:id/)
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getAndroidPort)(parts[2]) || 6080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://localhost:${port}` });
        }
        // 3. User Web Preview Proxy (/preview/:id/)
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/preview/")) {
            const parts = pathname.split("/");
            const port = 3000; // Default user dev server port
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://localhost:${port}` });
        }
        handle(req, res, parsedUrl);
    });
    // 1. Socket.IO for Terminal
    const io = new socket_io_1.Server(server, { path: "/api/socketio" });
    // 2. ws for Yjs Collaboration
    const yjsWss = new ws_1.WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const parsedUrl = (0, url_1.parse)(req.url || "/", true);
        const { pathname } = parsedUrl;
        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }
        // Proxy Workspace WebSockets (for IDE editor sync and NoVNC)
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getNativeWorkspacePort)(parts[2]) || 8080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://localhost:${port}` });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getAndroidPort)(parts[2]) || 6080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://localhost:${port}` });
        }
    });
    yjsWss.on("connection", (conn, request) => {
        const { query } = (0, url_1.parse)(request.url || "/", true);
        const docName = query.doc || "default";
        const { doc, awareness } = getOrCreateDoc(docName);
        conn.binaryType = "arraybuffer";
        // Send Sync Step 1
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, 0); // messageSync
        syncProtocol.writeSyncStep1(encoder, doc);
        conn.send(encoding.toUint8Array(encoder));
        // Send Awareness
        const awarenessEncoder = encoding.createEncoder();
        encoding.writeVarUint(awarenessEncoder, 1); // messageAwareness
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
    io.on("connection", (socket) => {
        console.log("Terminal socket connected:", socket.id);
        let shell = null;
        socket.on("terminal:start", ({ cols, rows }) => {
            const shellPath = os_1.default.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "bash";
            shell = pty.spawn(shellPath, [], {
                name: "xterm-color",
                cols: cols || 80,
                rows: rows || 24,
                cwd: (process.env.HOME || process.cwd()),
                env: process.env,
            });
            shell.onData((data) => {
                socket.emit("terminal:data", data);
            });
            shell.onExit(({ exitCode }) => {
                socket.emit("terminal:data", `\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
            });
        });
        socket.on("terminal:write", (data) => {
            if (shell)
                shell.write(data);
        });
        socket.on("terminal:resize", ({ cols, rows }) => {
            if (shell) {
                try {
                    shell.resize(cols, rows);
                }
                catch (e) {
                    console.error("Resize error", e);
                }
            }
        });
        socket.on("disconnect", () => {
            console.log("Terminal socket disconnected:", socket.id);
            if (shell) {
                shell.kill();
                shell = null;
            }
        });
    });
    const PORT = process.env.PORT || 7860;
    server.listen(PORT, () => {
        var _a, _b, _c, _d;
        const pingUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.AUTH_URL || process.env.NEXTAUTH_URL || process.env.HF_URL || `http://localhost:${PORT}`;
        console.log(`> Ready on ${pingUrl}`);
        console.log(`[BOOT] Server is now listening on port ${PORT}`);
        // --- Deployment Diagnostics ---
        console.log("[DIAG] Platform Process Info:");
        console.log(`[DIAG] UID: ${(_b = (_a = process.getuid) === null || _a === void 0 ? void 0 : _a.call(process)) !== null && _b !== void 0 ? _b : 'N/A'}, GID: ${(_d = (_c = process.getgid) === null || _c === void 0 ? void 0 : _c.call(process)) !== null && _d !== void 0 ? _d : 'N/A'}`);
        try {
            if ((0, fs_1.existsSync)('/data')) {
                const stats = (0, fs_1.statSync)('/data');
                console.log(`[DIAG] /data mount found. Owner: ${stats.uid}, Group: ${stats.gid}, Mode: ${stats.mode.toString(8)}`);
            }
            else {
                console.log("[DIAG] /data mount NOT found.");
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            console.error("[DIAG] Failed to probe /data:", msg);
        }
        // ------------------------------
        // Self-ping mechanism every 5 minutes to keep server awake
        // Using external URL if available to ensure proxy layers register the traffic
        setInterval(() => {
            fetch(`${pingUrl}/api/health`)
                .then(res => res.json())
                .then(data => console.log(`[Self-Ping] Health check:`, data))
                .catch(err => console.error(`[Self-Ping] Failed for ${pingUrl}:`, err.message));
        }, 5 * 60 * 1000);
    });
});
