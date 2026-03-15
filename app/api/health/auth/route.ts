import { NextResponse } from "next/server";

export async function GET() {
    const hasGithubVars = !!process.env.GITHUB_ID && !!process.env.GITHUB_SECRET;
    return NextResponse.json({ hasGithubVars });
}
