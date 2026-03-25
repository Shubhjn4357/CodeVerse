import { NextRequest, NextResponse } from "next/server";
import { readDir, readFile, writeFile, deletePath } from "@/lib/fs";
import { auth } from "@/auth";
import { resolveSafePath } from "@/lib/fs/isolation";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const subPath = searchParams.get("path") || "";
    const action = searchParams.get("action") || "list";

    try {
        const fullPath = await resolveSafePath(session.user.id, subPath);

        if (action === "list") {
            const nodes = await readDir(fullPath);
            return NextResponse.json(nodes);
        }
        if (action === "read") {
            const content = await readFile(fullPath);
            return NextResponse.json({ content });
        }
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const { path: subPath, content } = await req.json();
        if (!subPath) return NextResponse.json({ error: "Path required" }, { status: 400 });

        const fullPath = await resolveSafePath(session.user.id, subPath);
        await writeFile(fullPath, content);
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const subPath = searchParams.get("path");

    try {
        if (!subPath) return NextResponse.json({ error: "Path required" }, { status: 400 });
        const fullPath = await resolveSafePath(session.user.id, subPath);
        await deletePath(fullPath);
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
}
