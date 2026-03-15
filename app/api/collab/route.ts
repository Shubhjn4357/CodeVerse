import { NextRequest } from "next/server";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import * as map from "lib0/map";

// Yjs shared documents keyed by document path
const docs = new Map<string, { doc: Y.Doc; awareness: awarenessProtocol.Awareness }>();
let wss: WebSocketServer | null = null;

const getOrCreateDoc = (docName: string) => {
    return map.setIfUndefined(docs, docName, () => {
        const doc = new Y.Doc();
        const awareness = new awarenessProtocol.Awareness(doc);
        return { doc, awareness };
    });
};

export async function GET(req: NextRequest, res: any) {
    if (!res.socket.server.yjs_ws) {
        wss = new WebSocketServer({ noServer: true });

        res.socket.server.on("upgrade", (request: any, socket: any, head: any) => {
            const url = new URL(request.url, `ws://localhost`);
            if (url.pathname.startsWith("/api/collab")) {
                wss?.handleUpgrade(request, socket, head, (ws) => {
                    wss?.emit("connection", ws, request);
                });
            }
        });

        wss.on("connection", (conn, req) => {
            const url = new URL(req.url ?? "", "ws://localhost");
            const docName = url.searchParams.get("doc") ?? "default";
            const { doc, awareness } = getOrCreateDoc(docName);

            conn.binaryType = "arraybuffer";

            const sendSyncStep1 = () => {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, 0); // messageSync
                syncProtocol.writeSyncStep1(encoder, doc);
                conn.send(encoding.toUint8Array(encoder));
            };

            sendSyncStep1();

            // Send awareness state
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
                    // Sync
                    encoding.writeVarUint(encoder, 0);
                    syncProtocol.readSyncMessage(decoder, encoder, doc, null);
                    if (encoding.length(encoder) > 1) {
                        conn.send(encoding.toUint8Array(encoder));
                    }
                } else if (messageType === 1) {
                    // Awareness
                    awarenessProtocol.applyAwarenessUpdate(
                        awareness,
                        decoding.readVarUint8Array(decoder),
                        conn
                    );
                }
            });

            const updateHandler = (update: Uint8Array, origin: any) => {
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

        res.socket.server.yjs_ws = wss;
    }

    res.end();
}
