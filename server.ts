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

app.prepare().then(() => {
    // Initiate background container cleanup routines
    startAutoSleepCron();

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
        const parsedUrl = parse(req.url!, true);
        handle(req, res, parsedUrl);
    });

    // 1. Socket.IO for Terminal
    const io = new Server(server, { path: "/api/socketio" });

    // 2. ws for Yjs Collaboration
    const yjsWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const { pathname } = parse(req.url || "/", true);
        if (pathname === "/api/collab") {
            yjsWss.handleUpgrade(req, socket, head, (ws) => {
                yjsWss.emit("connection", ws, req);
            });
        }
    });

    yjsWss.on("connection", (conn: WebSocket, request: IncomingMessage) => {
        const { query } = parse(request.url || "/", true);
        const docName = (query.doc as string) || "default";
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
        encoding.writeVarUint8Array(
            awarenessEncoder,
            awarenessProtocol.encodeAwarenessUpdate(awareness, Array.from(awareness.getStates().keys()))
        );
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
        console.log("Terminal socket connected:", socket.id);
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

            shell.onData((data: string) => {
                socket.emit("terminal:data", data);
            });

            shell.onExit(({ exitCode }) => {
                socket.emit("terminal:data", `\r\n\x1b[31m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
            });
        });

        socket.on("terminal:write", (data: string) => {
            if (shell) shell.write(data);
        });

        socket.on("terminal:resize", ({ cols, rows }: { cols: number; rows: number }) => {
            if (shell) {
                try {
                    shell.resize(cols, rows);
                } catch (e) {
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
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
