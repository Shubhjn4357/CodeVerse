import { NextRequest, NextResponse } from "next/server";
import { readDir, readFile, writeFile, deletePath } from "@/lib/fs";

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path") || "";
    const action = searchParams.get("action") || "list";

    try {
        if (action === "list") {
            const nodes = await readDir(path);
            return NextResponse.json(nodes);
        }
        if (action === "read") {
            const content = await readFile(path);
            return NextResponse.json({ content });
        }
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { path, content } = await req.json();
        if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });

        await writeFile(path, content);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const path = searchParams.get("path");

    try {
        if (!path) return NextResponse.json({ error: "Path required" }, { status: 400 });
        await deletePath(path);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
