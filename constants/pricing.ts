import { AgentModel } from "../types/agent";

export const MARKUP_MULTIPLIER = 1.2; // 20% markup for ENV key usage

export const MODELS: Record<string, AgentModel> = {
    // Google
    "gemini-3-pro": {
        id: "gemini-3-pro",
        name: "Gemini 3 Pro",
        provider: "google",
        contextWindow: 2000000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 1.25,
        costOutputPerM: 5.0,
    },
    "gemini-3-flash": {
        id: "gemini-3-flash",
        name: "Gemini 3 Flash",
        provider: "google",
        contextWindow: 1000000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 0.075,
        costOutputPerM: 0.30,
    },

    // Anthropic
    "claude-opus-4-5-20251101": {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        provider: "anthropic",
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 15.0,
        costOutputPerM: 75.0,
    },
    "claude-sonnet-4-5-20250929": {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        provider: "anthropic",
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 3.0,
        costOutputPerM: 15.0,
    },

    // OpenAI
    "gpt-5.2": {
        id: "gpt-5.2",
        name: "GPT-5.2",
        provider: "openai",
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 2.50,
        costOutputPerM: 10.0,
    },
    "gpt-5.1-codex-max": {
        id: "gpt-5.1-codex-max",
        name: "GPT-5.1 Codex Max",
        provider: "openai",
        contextWindow: 128000,
        supportsVision: false,
        supportsTools: true,
        costInputPerM: 1.50,
        costOutputPerM: 6.0,
    },
    "o3-pro": {
        id: "o3-pro",
        name: "o3 Pro",
        provider: "openai",
        contextWindow: 200000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 15.0,
        costOutputPerM: 60.0,
    },

    // xAI Grok
    "grok-4.1": {
        id: "grok-4.1",
        name: "Grok 4.1",
        provider: "xai",
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 2.0,
        costOutputPerM: 10.0,
    },
    "grok-4.1-fast": {
        id: "grok-4.1-fast",
        name: "Grok 4.1 Fast (2M)",
        provider: "xai",
        contextWindow: 2000000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 0.50,
        costOutputPerM: 2.50,
    },
    "grok-code-fast-1": {
        id: "grok-code-fast-1",
        name: "Grok Code Fast 1",
        provider: "xai",
        contextWindow: 32000,
        supportsVision: false,
        supportsTools: true,
        costInputPerM: 0.15,
        costOutputPerM: 0.60,
    },

    // DeepSeek
    "deepseek-reasoner": {
        id: "deepseek-reasoner",
        name: "DeepSeek R1 / V3.2 Speciale",
        provider: "deepseek",
        contextWindow: 64000,
        supportsVision: false,
        supportsTools: true,
        costInputPerM: 0.55,
        costOutputPerM: 2.19,
    },

    // Mistral
    "mistral-large-3": {
        id: "mistral-large-3",
        name: "Mistral Large 3",
        provider: "mistral",
        contextWindow: 128000,
        supportsVision: true,
        supportsTools: true,
        costInputPerM: 2.0,
        costOutputPerM: 6.0,
    },
    "devstral-2": {
        id: "devstral-2",
        name: "Devstral 2 (Code)",
        provider: "mistral",
        contextWindow: 64000,
        supportsVision: false,
        supportsTools: true,
        costInputPerM: 0.30,
        costOutputPerM: 0.90,
    }
};
