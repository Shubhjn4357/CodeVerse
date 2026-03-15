import { openai } from "@ai-sdk/openai";
import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { mistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai"; // For Ollama / local compat
import { NextRequest } from "next/server";
import type { LanguageModel } from "ai";

export function getModel(modelId: string, req: NextRequest): LanguageModel {
    // Try to parse Bring-Your-Own-Key header
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

    // Determine provider from modelId (e.g., "claude-3-7-sonnet-20250219")
    if (modelId.startsWith("gpt-") || modelId.startsWith("o1") || modelId.startsWith("o3")) {
        const provider = createOpenAI({ apiKey: keys.openai });
        return provider(modelId);
    }

    if (modelId.startsWith("claude-")) {
        const provider = anthropic;
        // Wait, let's instantiate properly if we have custom keys 
        // In @ai-sdk/anthropic v1, we can create a custom provider instance:
        const customAnthropic = require("@ai-sdk/anthropic").createAnthropic({ apiKey: keys.anthropic });
        return customAnthropic(modelId);
    }

    if (modelId.startsWith("gemini-")) {
        const customGoogle = require("@ai-sdk/google").createGoogleGenerativeAI({ apiKey: keys.google });
        return customGoogle(modelId);
    }

    if (modelId.startsWith("mistral-")) {
        const customMistral = require("@ai-sdk/mistral").createMistral({ apiKey: keys.mistral });
        return customMistral(modelId);
    }

    if (modelId.startsWith("ollama/")) {
        const parsedId = modelId.replace("ollama/", "");
        const ollama = createOpenAI({
            baseURL: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1",
            apiKey: "ollama", // Required but ignored by ollama
        });
        return ollama(parsedId);
    }

    // Fallback
    return openai("gpt-4o-mini");
}
