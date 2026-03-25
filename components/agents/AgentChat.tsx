"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { useAgentStore } from "@/store/agent";
import { MODELS } from "@/constants/pricing";
import { PlanView } from "./PlanView";
import {
    Bot, Send, Square, Code2, Cpu, Command
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

interface ExtendedMessage {
    id: string;
    role: "user" | "assistant" | "system" | "tool";
    content: string;
    toolInvocations?: Array<{
        toolCallId: string;
        toolName: string;
        args: Record<string, unknown>;
        state: 'call' | 'result';
        result?: unknown;
    }>;
}

interface UseChatHelpers {
    messages: unknown[];
    append: (message: { role: "user" | "assistant" | "system" | "tool"; content: string }) => Promise<string | undefined | null>;
    stop: () => void;
    isLoading: boolean;
}

export default function AgentChat() {
    const { mode, setMode, modelId, setModelId, planSteps, setPlanSteps, systemPrompt } = useAgentStore();
    const [input, setInput] = useState("");
    const [isPlanning, setIsPlanning] = useState(false);
    const [activeTab, setActiveTab] = useState<"chat" | "plan">("chat");

    // Execute mode: Standard Vercel AI useChat with tool calls capabilities mapped to route.ts
    const chatOptions = {
        api: "/api/agent",
        body: {
            modelId,
            mode: "execute",
            systemPrompt,
            byokKey: localStorage.getItem("codeverse_byok") || undefined,
        },
        onError: (err: Error) => {
            toast.error(err.message || "Agent execution failed");
        }
    };

    const chat = useChat(chatOptions as unknown as Parameters<typeof useChat>[0]) as unknown as UseChatHelpers;

    const messages = chat.messages as unknown as ExtendedMessage[];
    const { append, stop, isLoading } = chat;

    const generatePlan = async (query: string) => {
        setIsPlanning(true);
        setMode("plan");
        setActiveTab("plan");
        setInput("");

        try {
            const res = await fetch("/api/agent", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: [{ role: "user", content: query }],
                    modelId,
                    mode: "plan",
                    systemPrompt,
                    byokKey: localStorage.getItem("codeverse_byok") || undefined,
                })
            });

            if (!res.ok) throw new Error("Failed to generate plan");
            const data = await res.json() as { steps: Array<{ id: string; description: string; filesData?: string[] }> };

            setPlanSteps(data.steps.map(s => ({ ...s, status: "pending" as const })));
        } catch (e: unknown) {
            const error = e instanceof Error ? e : new Error(String(e));
            toast.error(error.message || "Plan generation failed");
        } finally {
            setIsPlanning(false);
        }
    };

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;

        if (mode === "plan" && activeTab === "plan") {
            generatePlan(input);
        } else {
            append({ role: "user", content: input });
            setInput("");
            setActiveTab("chat");
        }
    };

    const executePlanStep = async (id: string, description: string) => {
        // Dispatch a hidden message to the assistant to execute the specific step
        append({
            role: "user",
            content: `Execute the following plan step immediately and autonomoulsy using tools: ${description}`
        });
    };

    return (
        <div className="h-full flex flex-col bg-(--surface) text-(--text)">
            {/* Header */}
            <div className="h-10 flex items-center justify-between px-3 border-b border-(--border-subtle) shrink-0 bg-(--bg-2)">
                <div className="flex items-center gap-2">
                    <Bot size={14} className="text-(--accent)" />
                    <span className="font-semibold text-xs text-(--text)">AI Agent</span>
                </div>
                <select
                    className="bg-transparent text-xs text-(--text-muted) outline-none border border-(--border) rounded px-1 min-w-[120px]"
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                >
                    {Object.values(MODELS).map(m => (
                        <option key={m.id} value={m.id}>
                            {m.provider === 'ollama' ? '🏠 ' : ''}{m.name} {m.provider === 'ollama' ? '(Free)' : `(${m.provider})`}
                        </option>
                    ))}
                </select>
                {MODELS[modelId]?.provider === 'ollama' && (
                    <div className="absolute top-12 right-3 z-20">
                         <div className="px-2 py-0.5 bg-green-500/10 text-green-500 text-[10px] font-bold rounded-full border border-green-500/20 flex items-center gap-1 animate-pulse">
                            <Cpu size={10} /> LOCAL & FREE
                         </div>
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-(--border-subtle) shrink-0 bg-(--bg-2)">
                <button
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors border-b-2 ${activeTab === "chat" ? "border-(--accent) text-(--text)" : "border-transparent text-(--text-muted) hover:text-(--text)"}`}
                    onClick={() => setActiveTab("chat")}
                >
                    Execute
                </button>
                <button
                    className={`flex-1 py-1.5 text-xs font-medium transition-colors border-b-2 ${activeTab === "plan" ? "border-(--accent) text-(--text)" : "border-transparent text-(--text-muted) hover:text-(--text)"}`}
                    onClick={() => setActiveTab("plan")}
                >
                    Plan Mode
                </button>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-4">
                {activeTab === "chat" ? (
                    messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                            <Code2 size={40} className="mb-2" />
                            <p className="text-sm font-medium">Execute Mode</p>
                            <p className="text-xs">I will execute your requests directly using MCP tools.</p>
                        </div>
                    ) : (
                        messages.map((m: ExtendedMessage) => (
                            <div key={m.id} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
                                <div className="flex items-center gap-1.5 text-[10px] text-(--text-muted) uppercase tracking-wider font-semibold mb-1">
                                    {m.role === "assistant" ? <Bot size={11} /> : null}
                                    {m.role}
                                </div>
                                <div className={`text-xs max-w-[90%] p-3 rounded-xl border ${m.role === "user" ? "bg-(--accent) text-(--text-on-accent) border-transparent rounded-tr-none" : "bg-(--bg-2) border-(--border-subtle) rounded-tl-none overflow-x-auto"}`}>
                                    <ReactMarkdown
                                        components={{
                                            code({ children, ...props }) {
                                                // React-Markdown v8+ uses 'inline' in a different way or passing it via props
                                                // We can check if it's a code block vs inline code by checking for newlines or class
                                                const isInline = !props.className?.includes('language-');
                                                const content = String(children || "").replace(/\n$/, "");
                                                
                                                if (isInline) {
                                                    return <code className="bg-black/20 px-1 rounded font-mono text-[10px]" {...props}>{children}</code>;
                                                }
                                                return (
                                                    <pre className="bg-black/20 p-2 rounded overflow-auto font-mono text-[10px] mt-2 border border-black/10">
                                                        <code {...props}>{content}</code>
                                                    </pre>
                                                );
                                            }
                                        }}
                                    >
                                        {m.content || "*Thinking...*"}
                                    </ReactMarkdown>

                                    {/* Tool Invocations */}
                                    {m.toolInvocations && m.toolInvocations.map((toolInvoc) => (
                                        <div key={toolInvoc.toolCallId} className="mt-2 text-[10px] border border-(--border-subtle) bg-(--surface-hover) rounded p-1.5">
                                            <div className="flex items-center gap-1 font-semibold text-(--text) mb-1">
                                                <Command size={10} className="text-(--accent)" /> {toolInvoc.toolName}
                                            </div>
                                            <div className="text-(--text-muted) font-mono whitespace-pre-wrap truncate max-h-16">
                                                {JSON.stringify(toolInvoc.args, null, 2)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))
                    )
                ) : (
                    planSteps.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center opacity-50">
                            <Cpu size={40} className="mb-2" />
                            <p className="text-sm font-medium">Plan Mode</p>
                            <p className="text-xs p-2">Ask me to build a large feature. I will outline a structured step-by-step checklist before executing code.</p>
                        </div>
                    ) : (
                        <PlanView
                            steps={planSteps}
                            goal="Feature Implementation"
                            isExecuting={isLoading}
                            onExecuteStep={(id) => {
                                const step = planSteps.find(s => s.id === id);
                                if (step) executePlanStep(id, step.description);
                            }}
                            onExecute={() => {
                                const pending = planSteps.filter(s => s.status !== "done");
                                if (pending.length) executePlanStep(pending[0].id, pending[0].description);
                            }}
                        />
                    )
                )}

                {(isLoading || isPlanning) && activeTab === "chat" && (
                    <div className="flex items-center gap-2 text-xs text-(--text-muted)">
                        <span className="w-2.5 h-2.5 border-[1.5px] border-(--accent) border-t-transparent rounded-full animate-spin" />
                        Agent is thinking...
                    </div>
                )}
                <div className="pb-8" />
            </div>

            {/* Input Area */}
            <form onSubmit={handleSend} className="p-2 border-t border-(--border-subtle) bg-(--bg-2) shrink-0">
                <div className="relative flex items-end bg-(--bg-3) border border-(--border) rounded-xl overflow-hidden focus-within:border-(--accent) transition-colors p-1">
                    <textarea
                        className="w-full bg-transparent border-none outline-none text-xs text-(--text) resize-none p-2 min-h-[40px] max-h-[150px]"
                        placeholder={activeTab === "plan" ? "Describe a feature to build a plan for..." : "Ask the agent to code..."}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend(e);
                            }
                        }}
                    />
                    <div className="absolute right-2 bottom-2 flex gap-1">
                        {isLoading ? (
                            <button
                                type="button"
                                onClick={stop}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-(--surface-hover) text-(--text) hover:text-(--error)"
                            >
                                <Square size={12} fill="currentColor" />
                            </button>
                        ) : (
                            <button
                                type="submit"
                                disabled={!input.trim() || isPlanning}
                                className="w-7 h-7 flex items-center justify-center rounded-lg bg-(--accent) text-(--text-on-accent) disabled:opacity-50 disabled:bg-(--surface-hover) disabled:text-(--text-muted) transition-colors"
                            >
                                {activeTab === "plan" ? <Cpu size={12} /> : <Send size={12} />}
                            </button>
                        )}
                    </div>
                </div>
            </form>
        </div>
    );
}
