import { NextRequest, NextResponse } from "next/server";
import { logUsage, getUsageReport } from "@/lib/billing";

export async function GET() {
    try {
        const report = await getUsageReport();
        return NextResponse.json(report);
    } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const { agent = "codeverse_ui", modelId, inputTokens, outputTokens, taskTitle } = await req.json();

        if (!modelId || typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
            return NextResponse.json({ error: "Missing required tracking data" }, { status: 400 });
        }

        const entry = await logUsage(agent, modelId, inputTokens, outputTokens, taskTitle);
        return NextResponse.json({ success: true, entry });
    } catch (e: unknown) {
        const error = e instanceof Error ? e : new Error(String(e));
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
