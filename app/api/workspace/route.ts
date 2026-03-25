import { NextResponse } from "next/server";
import { startWorkspaceContainer, stopWorkspaceContainer } from "@/lib/docker/manager";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function GET(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    if (action === "statusAll") {
        try {
            // Fetch all workspaces for user and return their statuses
            const res = await db.execute({
                sql: "SELECT id, status FROM workspaces WHERE user_id = ?",
                args: [session.user.id]
            });

            const statuses: Record<string, string> = {};
            res.rows.forEach(row => {
                statuses[row.id as string] = row.status as string;
            });

            return NextResponse.json({ statuses });
        } catch (e: unknown) {
            console.error("[WORKSPACE_API_ERROR]", e);
            return NextResponse.json({ error: (e as Error).message }, { status: 500 });
        }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}

export async function POST(req: Request) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { action, id, image } = body;

        if (!id) {
            return NextResponse.json({ error: "Missing workspace id" }, { status: 400 });
        }

        // Verify ownership and get project name
        const verifyObj = await db.execute({
            sql: "SELECT id, project_name FROM workspaces WHERE id = ? AND user_id = ?",
            args: [id, session.user.id]
        });

        if (verifyObj.rows.length === 0) {
            return NextResponse.json({ error: "Workspace not found or unauthorized" }, { status: 404 });
        }

        const projectName = verifyObj.rows[0].project_name as string;

        if (action === "start") {
            const { withAndroidEmulator } = body;
            const result = await startWorkspaceContainer({ 
                id, 
                userId: session.user.id, 
                projectName,
                image, 
                withAndroidEmulator 
            });
            if (result.success) {
                await db.execute({
                    sql: "UPDATE workspaces SET status = 'running', container_id = ?, android_container_id = ?, android_port = ? WHERE id = ?",
                    args: [result.containerId || null, result.androidContainerId || null, result.androidPort || null, id]
                });
            }
            return NextResponse.json(result);
        } else if (action === "stop") {
            const result = await stopWorkspaceContainer(id);
            if (result.success) {
                await db.execute({
                    sql: "UPDATE workspaces SET status = 'stopped' WHERE id = ?",
                    args: [id]
                });
            }
            return NextResponse.json(result);
        } else if (action === "rebuild") {
            const { withAndroidEmulator } = body;
            // 1. Fully destroy existing containers
            await stopWorkspaceContainer(id, true);

            // 2. Recreate them (this will pick up codeverse.json changes)
            const result = await startWorkspaceContainer({ 
                id, 
                userId: session.user.id, 
                projectName,
                image, 
                withAndroidEmulator 
            });

            if (result.success) {
                await db.execute({
                    sql: "UPDATE workspaces SET status = 'running', container_id = ?, android_container_id = ?, android_port = ? WHERE id = ?",
                    args: [result.containerId || null, result.androidContainerId || null, result.androidPort || null, id]
                });
            }
            return NextResponse.json(result);
        }

        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
