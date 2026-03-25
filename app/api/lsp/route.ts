import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { auth } from "@/auth";
import { resolveSafePath } from "@/lib/fs/isolation";

// Language Server mapping: extension → command to start the language server
const LSP_SERVERS: Record<string, { cmd: string; args: string[] }> = {
    py: { cmd: "pyright-langserver", args: ["--stdio"] },
    go: { cmd: "gopls", args: [] },
    rs: { cmd: "rust-analyzer", args: [] },
    rb: { cmd: "solargraph", args: ["stdio"] },
    java: { cmd: "jdtls", args: [] },
    cs: { cmd: "omnisharp", args: ["-lsp"] },
};

// Store active LSP processes
const activeServers = new Map<string, ReturnType<typeof spawn>>();

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const lang = searchParams.get("lang");

    if (!lang) {
        return NextResponse.json({
            available: Object.keys(LSP_SERVERS),
            status: Object.fromEntries(
                Object.keys(LSP_SERVERS).map(l => [l, activeServers.has(`${userId}:${l}`) ? "running" : "idle"])
            )
        });
    }

    const config = LSP_SERVERS[lang];
    if (!config) {
        return NextResponse.json({ error: `No LSP configured for .${lang}` }, { status: 404 });
    }

    return NextResponse.json({
        lang,
        status: activeServers.has(lang) ? "running" : "idle",
        cmd: config.cmd
    });
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = session.user.id;

    try {
        const { action, lang, workspaceName } = await req.json();

        if (action === "start") {
            if (!lang) return NextResponse.json({ error: "lang required" }, { status: 400 });
            if (!workspaceName) return NextResponse.json({ error: "workspaceName required" }, { status: 400 });

            const config = LSP_SERVERS[lang];
            if (!config) return NextResponse.json({ error: `No LSP for .${lang}` }, { status: 404 });

            const serverKey = `${userId}:${lang}`;
            if (activeServers.has(serverKey)) {
                return NextResponse.json({ status: "already_running" });
            }

            try {
                const projectRoot = await resolveSafePath(userId, workspaceName);
                const proc = spawn(config.cmd, config.args, {
                    cwd: projectRoot,
                    stdio: ["pipe", "pipe", "pipe"],
                    shell: process.platform === "win32"
                });

                activeServers.set(serverKey, proc);

                proc.on("exit", () => activeServers.delete(serverKey));
                proc.on("error", (err) => {
                    console.warn(`LSP ${lang} for ${userId}: ${err.message}`);
                    activeServers.delete(serverKey);
                });

                return NextResponse.json({ status: "started", pid: proc.pid });
            } catch (e: unknown) {
                return NextResponse.json({
                    status: "unavailable",
                    message: (e as Error).message
                });
            }
        }

        if (action === "stop") {
            if (!lang) return NextResponse.json({ error: "lang required" }, { status: 400 });
            const serverKey = `${userId}:${lang}`;
            const proc = activeServers.get(serverKey);
            if (proc) {
                proc.kill();
                activeServers.delete(serverKey);
            }
            return NextResponse.json({ status: "stopped" });
        }

        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
