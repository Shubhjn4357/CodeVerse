import { 
    streamText, 
    generateObject, 
    LanguageModel, 
    AssistantModelMessage, 
    UserModelMessage, 
    SystemModelMessage, 
    ToolModelMessage 
} from "ai";
import { z } from "zod";
import { getModel } from "@/lib/agents/registry";
import { createTools } from "@/lib/mcp/tools";
import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";

// Define a strict union type for core messages to avoid 'any'
type CoreChatMessage = 
    | UserModelMessage 
    | AssistantModelMessage 
    | SystemModelMessage 
    | ToolModelMessage;

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    const userId = session.user.id;

    try {
        const { messages, modelId, workspaceName, mode = "execute" } = await req.json() as {
            messages: CoreChatMessage[];
            modelId?: string;
            workspaceName: string;
            mode?: "plan" | "execute";
        };
        
        if (!workspaceName) return new Response("Missing workspaceName", { status: 400 });

        // Resolve workspaceId
        const wsRes = await db.execute({
            sql: "SELECT id FROM workspaces WHERE user_id = ? AND project_name = ?",
            args: [userId, workspaceName]
        });

        if (wsRes.rows.length === 0) {
            return new Response("Workspace not found", { status: 404 });
        }
        const workspaceId = wsRes.rows[0].id as string;

        const model: LanguageModel = getModel(modelId as string, req);
        const tools = createTools(userId, workspaceName);

        const systemPrompt = `You are CodeVerse AI, a world-class autonomous coding agent. 
You are embedded in a premium "AI Studio" environment. 
Current Workspace: ${workspaceName} (Path: workspaces/${userId}/${workspaceName}/)

CORE PRINCIPLES:
1. PLAN BEFORE ACTION: Always explain high-level strategy before using tools.
2. PRECISION: Read files before editing. Ensure syntax is correct.
3. CONTEXT AWARENESS: You are part of an IDE. Help with refactoring, debugging, and feature development.
4. SAFETY: You have shell access but should remain within the workspace. Never attempt to escape the sandbox.

You have access to:
- read_file: View content.
- write_file: Create/edit files (overwrite mode).
- terminal_command: Run builds, tests, or scripts.
- search_code: Find patterns.
- list_files: Explore structure.

Respond in professional Markdown. Use code blocks for all technical output.`;

        // Save incoming user message to history
        const latestMessage = messages[messages.length - 1];
        if (latestMessage && latestMessage.role === "user") {
            const content = Array.isArray(latestMessage.content) 
                ? latestMessage.content.map(p => ('text' in p ? p.text : '')).join('')
                : latestMessage.content;
                
            await db.execute({
                sql: "INSERT INTO chat_history (id, user_id, workspace_id, role, content) VALUES (?, ?, ?, ?, ?)",
                args: [randomUUID(), userId as string, workspaceId as string, latestMessage.role, content]
            });
        }

        if (mode === "plan") {
            const result = await generateObject({
                model,
                system: systemPrompt,
                messages,
                schema: z.object({
                    goal: z.string().describe("A 1-sentence summary of the requested goal"),
                    steps: z.array(
                        z.object({
                            id: z.string(),
                            description: z.string(),
                            filesData: z.array(z.string()).optional(),
                        })
                    ).describe("The sequence of steps to execute to fulfill the user's request"),
                }),
            });

            return NextResponse.json(result.object);
        }

        const result = streamText({
            model,
            system: systemPrompt,
            messages,
            tools, // Assuming createTools returns compatible types now
            onFinish: async (completion) => {
                // Save assistant response to DB
                try {
                    await db.execute({
                        sql: "INSERT INTO chat_history (id, user_id, workspace_id, role, content, tool_invocations) VALUES (?, ?, ?, ?, ?, ?)",
                        args: [
                            randomUUID(), 
                            userId as string, 
                            workspaceId as string, 
                            "assistant", 
                            completion.text, 
                            JSON.stringify(completion.toolCalls || [])
                        ]
                    });
                } catch (dbErr) {
                    console.error("Failed to save assistant response to history:", dbErr);
                }
            }
        });

        return result.toTextStreamResponse();
    } catch (e: unknown) {
        console.error("[AGENT_ROUTE_ERROR]", e);
        const error = e instanceof Error ? e : new Error(String(e));
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
    const userId = session.user.id;

    const { searchParams } = new URL(req.url);
    const workspaceName = searchParams.get("workspaceName");
    if (!workspaceName) return new Response("Missing workspaceName", { status: 400 });

    try {
        const wsRes = await db.execute({
            sql: "SELECT id FROM workspaces WHERE user_id = ? AND project_name = ?",
            args: [userId, workspaceName]
        });

        if (wsRes.rows.length === 0) return NextResponse.json({ messages: [] });
        const workspaceId = wsRes.rows[0].id as string;

        const res = await db.execute({
            sql: "SELECT role, content, tool_invocations as toolInvocations, created_at FROM chat_history WHERE user_id = ? AND workspace_id = ? ORDER BY created_at ASC",
            args: [userId, workspaceId]
        });

        const messages = res.rows.map(row => ({
            id: randomUUID(),
            role: row.role as string,
            content: row.content as string,
            toolInvocations: row.toolInvocations ? JSON.parse(row.toolInvocations as string) : undefined
        }));

        return NextResponse.json({ messages });
    } catch (e) {
        console.error("[FETCH_HISTORY_ERROR]", e);
        return NextResponse.json({ messages: [] });
    }
}
