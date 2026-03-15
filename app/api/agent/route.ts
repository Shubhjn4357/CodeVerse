import { streamText, generateObject, LanguageModel } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/agents/registry";
import { coreTools } from "@/lib/mcp/tools";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
    try {
        const { messages, modelId, mode = "execute", systemPrompt } = await req.json();
        const model: LanguageModel = getModel(modelId, req);

        if (mode === "plan") {
            // In plan mode, we don't stream immediately. We generate a structured JSON plan first.
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

            return new Response(JSON.stringify(result.object), {
                headers: { "Content-Type": "application/json" }
            });
        }

        // Execute mode: Standard stream-text with workspace tool calls enabled
        const result = streamText({
            model,
            system: systemPrompt,
            messages,
            tools: coreTools as any,
        });

        return result.toTextStreamResponse();
    } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
