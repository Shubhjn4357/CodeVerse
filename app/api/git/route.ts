import { NextRequest, NextResponse } from "next/server";
import {
    getGitStatus,
    getBranchList,
    commitFiles,
    getFileDiff,
    pushBranch,
    pullBranch,
    checkoutBranch,
    getGit
} from "@/lib/git";
import { auth } from "@/auth";
import { resolveSafePath } from "@/lib/fs/isolation";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const workspaceName = searchParams.get("workspaceName"); 

    if (!workspaceName) return NextResponse.json({ error: "workspaceName required" }, { status: 400 });

    try {
        const userId = session.user.id;
        const baseDir = await resolveSafePath(userId, workspaceName);

        switch (action) {
            case "status":
                return NextResponse.json(await getGitStatus(baseDir));
            case "branches":
                return NextResponse.json(await getBranchList(baseDir));
            case "diff":
                const file = searchParams.get("file");
                if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
                return NextResponse.json({ diff: await getFileDiff(file, baseDir) });
            case "log":
                const log = await getGit(baseDir).log({ maxCount: 50 });
                return NextResponse.json(log.all);
            case "checkConfig":
                const instance = getGit(baseDir);
                const name = await instance.getConfig("user.name", "local");
                const email = await instance.getConfig("user.email", "local");
                return NextResponse.json({
                    configured: !!(name.value && email.value),
                    name: name.value,
                    email: email.value
                });
            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { action, workspaceName } = body;
        if (!workspaceName) return NextResponse.json({ error: "Workspace required" }, { status: 400 });

        const baseDir = await resolveSafePath(session.user.id, workspaceName);

        switch (action) {
            case "commit":
                if (!body.message) return NextResponse.json({ error: "Message required" }, { status: 400 });
                const res = await commitFiles(body.message, body.files, baseDir);
                return NextResponse.json({ success: true, commit: res.commit });

            case "push":
                await pushBranch(baseDir);
                return NextResponse.json({ success: true });

            case "pull":
                await pullBranch(baseDir);
                return NextResponse.json({ success: true });

            case "checkout":
                if (!body.branch) return NextResponse.json({ error: "Branch required" }, { status: 400 });
                await checkoutBranch(body.branch, body.create, baseDir);
                return NextResponse.json({ success: true });

            case "setConfig":
                if (!body.name || !body.email) return NextResponse.json({ error: "Name and email required" }, { status: 400 });
                const instance = getGit(baseDir);
                await instance.addConfig("user.name", body.name, false, "local");
                await instance.addConfig("user.email", body.email, false, "local");
                return NextResponse.json({ success: true });

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
