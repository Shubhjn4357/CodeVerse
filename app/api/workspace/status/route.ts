import { getWorkspaceStatus, getWorkspacePort } from "@/lib/docker/manager";
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "Missing id" }, { status: 400 });

    const status = getWorkspaceStatus(id);
    const port = getWorkspacePort(id);

    return NextResponse.json({
        success: true,
        status,
        port,
        ready: status === "ready"
    });
}
