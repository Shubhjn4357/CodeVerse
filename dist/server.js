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
proxy.on("error", (err, _req, res) => {
    console.error("[Proxy Error]", err.message);
    if (res instanceof http_1.ServerResponse) {
        res.writeHead(502);
        res.end("Workspace Proxy Error");
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
            console.log(`[PROXY-REWRITE] Redirect ${originalLocation} -> ${proxyRes.headers.location}`);
        }
    }
});
app.prepare()
    .then(() => {
    (0, schema_1.initDb)().catch(err => console.error("[BOOT] Database init failed:", err));
    (0, auto_sleep_1.startAutoSleepCron)();
    const server = (0, http_1.createServer)((req, res) => {
        const parsedUrl = (0, url_1.parse)(req.url, true);
        const { pathname } = parsedUrl;
        const host = req.headers.host || "";
        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        if (workspaceHostMatch) {
            const id = workspaceHostMatch[1];
            const port = (0, manager_1.getNativeWorkspacePort)(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const id = parts[2];
            const port = (0, manager_1.getNativeWorkspacePort)(id) || 8080;
            req.headers['x-codeverse-id'] = id;
            req.headers['x-codeverse-type'] = 'workspace';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getAndroidPort)() || 6080;
            req.headers['x-codeverse-id'] = parts[2];
            req.headers['x-codeverse-type'] = 'android';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:${port}`, changeOrigin: true });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/preview/")) {
            const parts = pathname.split("/");
            req.headers['x-codeverse-id'] = parts[2];
            req.headers['x-codeverse-type'] = 'preview';
            req.url = "/" + parts.slice(3).join("/");
            return proxy.web(req, res, { target: `http://127.0.0.1:3000`, changeOrigin: true });
        }
        handle(req, res, parsedUrl);
    });
    const io = new socket_io_1.Server(server, { path: "/api/socketio" });
    const yjsWss = new ws_1.WebSocketServer({ noServer: true });
    server.on("upgrade", (req, socket, head) => {
        const parsedUrl = (0, url_1.parse)(req.url || "/", true);
        const { pathname } = parsedUrl;
        const host = req.headers.host || "";
        const workspaceHostMatch = host.match(/^workspace-([a-zA-Z0-9-]+)\./);
        if (workspaceHostMatch) {
            const id = workspaceHostMatch[1];
            const port = (0, manager_1.getNativeWorkspacePort)(id) || 8080;
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
            return;
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/workspace/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getNativeWorkspacePort)(parts[2]) || 8080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
        if (pathname === null || pathname === void 0 ? void 0 : pathname.startsWith("/android/")) {
            const parts = pathname.split("/");
            const port = (0, manager_1.getAndroidPort)() || 6080;
            req.url = "/" + parts.slice(3).join("/");
            return proxy.ws(req, socket, head, { target: `http://127.0.0.1:${port}` });
        }
    });
    yjsWss.on("connection", (conn, request) => {
        const { query } = (0, url_1.parse)(request.url || "/", true);
        const docName = query.doc || "default";
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
                if (encoding.length(encoder) > 1)
                    conn.send(encoding.toUint8Array(encoder));
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
        if (process.env.SPACE_ID) {
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
