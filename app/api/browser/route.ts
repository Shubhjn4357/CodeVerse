import { NextRequest, NextResponse } from "next/server";
import { browserManager } from "@/lib/browser/playwright";

export async function POST(req: NextRequest) {
    try {
        const { action, payload } = await req.json();

        switch (action) {
            case "navigate":
                if (!payload?.url) return NextResponse.json({ error: "URL required" }, { status: 400 });
                const finalUrl = await browserManager.navigate(payload.url);
                return NextResponse.json({ url: finalUrl });

            case "click":
                if (!payload?.selector) return NextResponse.json({ error: "Selector required" }, { status: 400 });
                await browserManager.click(payload.selector);
                return NextResponse.json({ success: true });

            case "type":
                if (!payload?.selector || !payload?.text) return NextResponse.json({ error: "Selector and text required" }, { status: 400 });
                await browserManager.type(payload.selector, payload.text);
                return NextResponse.json({ success: true });

            case "snapshot":
                const data = await browserManager.getSnapshot();
                return NextResponse.json(data);

            case "close":
                await browserManager.close();
                return NextResponse.json({ success: true });

            default:
                return NextResponse.json({ error: "Unknown action" }, { status: 400 });
        }
    } catch (error: any) {
        console.error("Browser API Error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
