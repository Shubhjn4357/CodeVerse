import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs/promises";
import simpleGit from "simple-git";
import { spawn } from "child_process";
import type { PackageManager } from "@/lib/package-managers";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

const WORKSPACE_ROOT = path.join(process.cwd(), "workspaces");

async function ensureWorkspaceRoot() {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
}

// POST /api/projects
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "clone") {
        return handleClone(req, userId);
    } else if (action === "scaffold") {
        return handleScaffold(req, userId);
    } else if (action === "install") {
        return handleInstall(req); // install doesn't insert to db
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function GET() {
    return handleList();
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const workspaceId = searchParams.get("workspaceId");

    if (!workspaceId) {
        return NextResponse.json({ error: "Missing workspaceId" }, { status: 400 });
    }

    try {
        // Fetch it from DB to ensure it belongs to the user
        const res = await db.execute({
            sql: "SELECT project_name FROM workspaces WHERE id = ? AND user_id = ?",
            args: [workspaceId, session.user.id]
        });

        if (res.rows.length === 0) {
            return NextResponse.json({ error: "Workspace not found or unauthorized" }, { status: 404 });
        }

        const projectName = res.rows[0].project_name as string;
        const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);

        // Remove from filesystem
        const targetPath = path.join(WORKSPACE_ROOT, safeName);
        if (targetPath.startsWith(WORKSPACE_ROOT)) {
            await fs.rm(targetPath, { recursive: true, force: true });
        }

        // Remove from database
        await db.execute({
            sql: "DELETE FROM workspaces WHERE id = ?",
            args: [workspaceId]
        });

        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        if (e instanceof Error) {
            return NextResponse.json({ error: e.message }, { status: 500 });
        }
        return NextResponse.json({ error: e as string }, { status: 500 });
    }
}

async function handleList() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ projects: [] });
    }

    try {
        const res = await db.execute({
            sql: "SELECT * FROM workspaces WHERE user_id = ?",
            args: [session.user.id]
        });

        const projects = res.rows.map(row => ({
            id: row.id,
            name: row.project_name,
            path: path.join(WORKSPACE_ROOT, (row.project_name as string).replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60)),
            containerStatus: row.status,
            gitRemote: "", // We could fetch this on demand or ignore it for the DB view
            hasPackageJson: true,
            starred: false
        }));

        return NextResponse.json({ projects });
    } catch {
        return NextResponse.json({ projects: [] });
    }
}

async function handleClone(req: NextRequest, userId: string) {
    const { repoUrl, projectName } = await req.json() as { repoUrl: string; projectName: string };
    if (!repoUrl || !projectName) {
        return NextResponse.json({ error: "repoUrl and projectName are required" }, { status: 400 });
    }

    await ensureWorkspaceRoot();
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
    const dest = path.join(WORKSPACE_ROOT, safeName);

    // Stream progress via SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        async start(controller) {
            const send = (data: object) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

            try {
                send({ type: "progress", message: `Cloning ${repoUrl}…` });
                await simpleGit().clone(repoUrl, dest, ["--progress"]);

                // Insert into Database
                const workspaceId = randomUUID();
                await db.execute({
                    sql: "INSERT INTO workspaces (id, user_id, project_name, status) VALUES (?, ?, ?, ?)",
                    args: [workspaceId, userId, projectName, "stopped"]
                });

                send({ type: "done", projectPath: dest, projectName: safeName, id: workspaceId });
            } catch (e) {
                send({ type: "error", message: String(e) });
            } finally {
                controller.close();
            }
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

async function handleScaffold(req: NextRequest, userId: string) {
    const { templateId, projectName, packageManager } = await req.json() as {
        templateId: string;
        projectName: string;
        packageManager: PackageManager;
    };

    if (!templateId || !projectName) {
        return NextResponse.json({ error: "templateId and projectName are required" }, { status: 400 });
    }

    await ensureWorkspaceRoot();
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
    const dest = path.join(WORKSPACE_ROOT, safeName);
    await fs.mkdir(dest, { recursive: true });

    // Template scaffold commands (IDs must exactly match TEMPLATE_REGISTRY ids in constants/extensions.ts)
    const SCAFFOLD_CMDS: Record<string, string[]> = {
        "nextjs-app": ["npx", "create-next-app@latest", ".", "--typescript", "--tailwind", "--app", "--no-git", "--yes"],
        "react-vite": ["npx", "create-vite@latest", ".", "--template", "react-ts"],
        "sveltekit": ["npx", "sv", "create", ".", "--template", "minimal", "--types", "ts", "--no-add-ons"],
        "astro": ["npx", "create-astro@latest", ".", "--template", "minimal", "--typescript", "strict", "--no-git", "--no-install"],
        "express-ts": ["npx", "express-generator-typescript", "."],
        "turborepo": ["npx", "create-turbo@latest", ".", "--package-manager", packageManager ?? "npm"],
        "python-fastapi": ["python3", "-m", "venv", "venv"],
        "django": ["python3", "-m", "venv", "venv"],
        "go-gin": ["go", "mod", "init", safeName],
        "rust-axum": ["cargo", "init", "."],
    };

    const cmd = SCAFFOLD_CMDS[templateId];
    if (!cmd) {
        return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
        start(controller) {
            const send = (data: object) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

            send({ type: "progress", message: `Scaffolding ${templateId}…` });

            const proc = spawn(cmd[0], cmd.slice(1), {
                cwd: dest,
                shell: true,
                env: { ...process.env, CI: "1" },
            });

            proc.stdout.on("data", (d: Buffer) =>
                send({ type: "stdout", message: d.toString() })
            );
            proc.stderr.on("data", (d: Buffer) =>
                send({ type: "stderr", message: d.toString() })
            );
            proc.on("close", async (code) => {
                if (code === 0) {
                    // Insert into DB
                    const workspaceId = randomUUID();
                    try {
                        await db.execute({
                            sql: "INSERT INTO workspaces (id, user_id, project_name, status) VALUES (?, ?, ?, ?)",
                            args: [workspaceId, userId, projectName, "stopped"]
                        });
                        send({ type: "done", projectPath: dest, projectName: safeName, id: workspaceId });
                    } catch (e: unknown) {
                        if (e instanceof Error) {
                            send({ type: "error", message: `DB Error: ${e.message}` });
                        }
                        send({ type: "error", message: `DB Error: ${JSON.stringify(e)}` })
                    }
                } else {
                    send({ type: "error", message: `Process exited with code ${code}` });
                }
                controller.close();
            });
            proc.on("error", (e) => {
                send({ type: "error", message: e.message });
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}

async function handleInstall(req: NextRequest) {
    const { projectPath, packageManager } = await req.json() as {
        projectPath: string;
        packageManager: PackageManager;
    };

    if (!projectPath) {
        return NextResponse.json({ error: "projectPath is required" }, { status: 400 });
    }

    const PM_CMDS: Record<PackageManager, string[]> = {
        npm: ["npm", "install"],
        pnpm: ["pnpm", "install"],
        bun: ["bun", "install"],
        yarn: ["yarn", "install"],
    };

    const [bin, ...args] = PM_CMDS[packageManager ?? "npm"];
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
        start(controller) {
            const send = (data: object) =>
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

            send({ type: "progress", message: `Running ${bin} install…` });

            const proc = spawn(bin, args, {
                cwd: projectPath,
                shell: true,
                env: process.env,
            });

            proc.stdout.on("data", (d: Buffer) =>
                send({ type: "stdout", message: d.toString() })
            );
            proc.stderr.on("data", (d: Buffer) =>
                send({ type: "stderr", message: d.toString() })
            );
            proc.on("close", (code) => {
                send({ type: code === 0 ? "done" : "error", message: code === 0 ? "Installation complete!" : `Exited with ${code}` });
                controller.close();
            });
        },
    });

    return new Response(stream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        },
    });
}
