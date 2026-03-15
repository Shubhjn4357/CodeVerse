export type AgentProvider = "google" | "anthropic" | "openai" | "xai" | "deepseek" | "mistral" | "ollama";

export type AgentMode = "byok" | "env";

export interface AgentModel {
    id: string; // e.g., "gemini-3-pro"
    name: string;
    provider: AgentProvider;
    contextWindow: number;
    supportsVision: boolean;
    supportsTools: boolean;
    costInputPerM: number;
    costOutputPerM: number;
}

export interface ChatMessage {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    timestamp: string;
    toolCalls?: unknown[];
    tokenUsage?: {
        input: number;
        output: number;
    };
}

export interface AgentSession {
    id: string;
    title: string;
    modelId: string;
    mode: AgentMode;
    messages: ChatMessage[];
    totalCost: number;
    createdAt: string;
    updatedAt: string;
}
