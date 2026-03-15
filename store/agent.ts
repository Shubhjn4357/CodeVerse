import { create } from "zustand";

export interface UIMessage {
    id: string;
    role: "user" | "assistant" | "system" | "data";
    content: string;
    ui?: React.ReactNode;
    toolInvocations?: unknown[];
}

export type AgentMode = "plan" | "execute";

export interface PlanStep {
    id: string;
    description: string;
    filesData?: string[];
    status: "pending" | "running" | "done" | "error";
    error?: string;
}

interface AgentState {
    messages: UIMessage[];
    mode: AgentMode;
    planSteps: PlanStep[];
    isExecutingPlan: boolean;
    modelId: string;
    systemPrompt: string;

    setMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
    setMode: (mode: AgentMode) => void;
    setPlanSteps: (steps: PlanStep[]) => void;
    updatePlanStep: (id: string, update: Partial<PlanStep>) => void;
    setExecutingPlan: (exec: boolean) => void;
    setModelId: (id: string) => void;
    setSystemPrompt: (prompt: string) => void;
    clear: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
    messages: [],
    mode: "execute",
    planSteps: [],
    isExecutingPlan: false,
    modelId: "gpt-4o",
    systemPrompt: "You are CodeVerse, an expert AI software engineer. You have full access to the user's workspace, code, terminal, and browser. When asked to implement a feature, prefer to write real code. In Plan mode, create step-by-step checklists.",

    setMessages: (updater) => set((state) => ({
        messages: typeof updater === "function" ? updater(state.messages) : updater
    })),
    setMode: (mode) => set({ mode }),
    setPlanSteps: (planSteps) => set({ planSteps }),
    updatePlanStep: (id, update) => set((state) => ({
        planSteps: state.planSteps.map(s => s.id === id ? { ...s, ...update } : s)
    })),
    setExecutingPlan: (isExecutingPlan) => set({ isExecutingPlan }),
    setModelId: (modelId) => set({ modelId }),
    setSystemPrompt: (systemPrompt) => set({ systemPrompt }),
    clear: () => set({ messages: [], planSteps: [], isExecutingPlan: false }),
}));
