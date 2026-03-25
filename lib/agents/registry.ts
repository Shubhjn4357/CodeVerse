import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI, openai } from "@ai-sdk/openai"; 
import { NextRequest } from "next/server";
import type { LanguageModel } from "ai";

export function getModel(modelId: string, req: NextRequest): LanguageModel {
    const byok = req.headers.get("x-byok-keys");
    let keys: Record<string, string> = {
        openai: process.env.OPENAI_API_KEY || "",
        anthropic: process.env.ANTHROPIC_API_KEY || "",
        google: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
        mistral: process.env.MISTRAL_API_KEY || "",
    };

    if (byok) {
        try {
            const parsed = JSON.parse(byok);
            keys = { ...keys, ...parsed };
        } catch { }
    }

    if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
        return createOpenAI({ apiKey: keys.openai })(modelId);
    }

    if (modelId.startsWith("claude-")) {
        return createAnthropic({ apiKey: keys.anthropic })(modelId);
    }

    if (modelId.startsWith("gemini-")) {
        return createGoogleGenerativeAI({ apiKey: keys.google })(modelId);
    }

    if (modelId.startsWith("mistral-")) {
        return createMistral({ apiKey: keys.mistral })(modelId);
    }

    if (modelId.startsWith("ollama/")) {
        const parsedId = modelId.replace("ollama/", "");
        // Use host.docker.internal if running in docker to reach host Ollama, else localhost
        const baseUrl = process.env.OLLAMA_BASE_URL || (process.env.DOCKER_ENV ? "http://host.docker.internal:11434/v1" : "http://localhost:11434/v1");
        
        const ollama = createOpenAI({
            baseURL: baseUrl,
            apiKey: "ollama", 
        });
        return ollama(parsedId);
    }

    // Fallback
    return openai("gpt-4o-mini");
}
