import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import * as pty from "node-pty";
import os from "os";
import { startAutoSleepCron } from "./lib/jobs/auto-sleep";

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    // Initiate background container cleanup routines
    startAutoSleepCron();

    const server = createServer((req, res) => {
        const parsedUrl = parse(req.url!, true);
        handle(req, res, parsedUrl);
    });

    const io = new Server(server, { path: "/api/socketio" });

    io.on("connection", (socket) => {
        console.log("Terminal socket connected:", socket.id);
        let shell: pty.IPty | null = null;

        socket.on("terminal:start", ({ cols, rows }: { cols: number; rows: number }) => {
            const shellPath = os.platform() === "win32" ? "powershell.exe" : process.env.SHELL || "bash";

            shell = pty.spawn(shellPath, [], {
                name: "xterm-color",
                cols: cols || 80,
                rows: rows || 24,
                cwd: process.env.HOME || process.cwd(),
                env: process.env as Record<string, string>,
            });

            shell.onData((data) => {
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

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(`> Ready on http://localhost:${PORT}`);
    });
});
