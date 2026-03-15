import { NextRequest, NextResponse } from "next/server";
import {
    getGitStatus,
    getBranchList,
    commitFiles,
    getFileDiff,
    pushBranch,
    pullBranch,
    checkoutBranch,
    git
} from "@/lib/git";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");

    try {
        switch (action) {
            case "status":
                return NextResponse.json(await getGitStatus());
            case "branches":
                return NextResponse.json(await getBranchList());
            case "diff":
                const file = searchParams.get("file");
                if (!file) return NextResponse.json({ error: "File required" }, { status: 400 });
                return NextResponse.json({ diff: await getFileDiff(file) });
            case "log":
                const log = await git.log({ maxCount: 50 });
                return NextResponse.json(log.all);
            case "checkConfig":
                const name = await git.getConfig("user.name", "local");
                const email = await git.getConfig("user.email", "local");
                return NextResponse.json({
                    configured: !!(name.value && email.value),
                    name: name.value,
                    email: email.value
                });
            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { action } = body;

        switch (action) {
            case "commit":
                if (!body.message) return NextResponse.json({ error: "Message required" }, { status: 400 });
                const res = await commitFiles(body.message, body.files);
                return NextResponse.json({ success: true, commit: res.commit });

            case "push":
                await pushBranch();
                return NextResponse.json({ success: true });

            case "pull":
                await pullBranch();
                return NextResponse.json({ success: true });

            case "checkout":
                if (!body.branch) return NextResponse.json({ error: "Branch required" }, { status: 400 });
                await checkoutBranch(body.branch, body.create);
                return NextResponse.json({ success: true });

            case "setConfig":
                if (!body.name || !body.email) return NextResponse.json({ error: "Name and email required" }, { status: 400 });
                await git.addConfig("user.name", body.name, false, "local");
                await git.addConfig("user.email", body.email, false, "local");
                return NextResponse.json({ success: true });

            default:
                return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
