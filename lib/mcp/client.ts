import { spawn, ChildProcess } from "child_process";
import { createInterface } from "readline";

export interface MCPTool {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export class MCPClient {
    private stdioProcess: ChildProcess | null = null;
    private messageId = 0;
    private pendingRequests = new Map<number, { resolve: (val: unknown) => void; reject: (err: Error) => void }>();
    public isConnected = false;

    constructor(private command: string, private args: string[], private env: Record<string, string> = {}) { }

    async connect(): Promise<void> {
        if (this.isConnected) return;

        return new Promise((resolve, reject) => {
            this.stdioProcess = spawn(this.command, this.args, {
                env: { ...process.env, ...this.env },
                stdio: ["pipe", "pipe", "inherit"],
            });

            this.stdioProcess.on("error", (err) => {
                this.isConnected = false;
                reject(err);
            });

            const rl = createInterface({
                input: this.stdioProcess.stdout!,
                terminal: false,
            });

            rl.on("line", (line) => {
                try {
                    const msg = JSON.parse(line);
                    this.handleMessage(msg);
                } catch { }
            });

            this.isConnected = true;
            resolve();
        });
    }

    private handleMessage(msg: { id?: number; error?: { message: string }; result?: unknown }) {
        if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
            const { resolve, reject } = this.pendingRequests.get(msg.id)!;
            this.pendingRequests.delete(msg.id);

            if (msg.error) {
                reject(new Error(msg.error.message));
            } else {
                resolve(msg.result);
            }
        }
    }

    private async request(method: string, params: unknown): Promise<unknown> {
        if (!this.isConnected) await this.connect();

        const id = ++this.messageId;
        const req = { jsonrpc: "2.0", id, method, params };

        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.stdioProcess!.stdin!.write(JSON.stringify(req) + "\n");
        });
    }

    async initialize(): Promise<unknown> {
        return this.request("initialize", {
            protocolVersion: "2024-11-05",
            capabilities: { roots: { listChanged: true }, sampling: {} },
            clientInfo: { name: "CodeVerse", version: "1.0.0" }
        });
    }

    async listTools(): Promise<{ tools: MCPTool[] }> {
        return this.request("tools/list", {}) as Promise<{ tools: MCPTool[] }>;
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        return this.request("tools/call", { name, arguments: args });
    }

    disconnect() {
        if (this.stdioProcess) {
            this.stdioProcess.kill();
            this.stdioProcess = null;
        }
        this.isConnected = false;
    }
}
