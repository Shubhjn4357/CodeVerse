"use client";

import { useChat } from "@ai-sdk/react";
import React, { useState, useRef, useEffect, useMemo, ChangeEvent, FormEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  User,
  Send,
  X,
  Plus,
  Wand2,
  Trash2,
  Terminal,
  FileText,
  Search as SearchIcon,
  Check,
  MessageSquare,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/cjs/styles/prism";

// Standard AI Studio message shape for strict typing
export interface StudioMessage {
    id: string;
    role: "system" | "user" | "assistant" | "data" | "tool";
    content: string;
    toolInvocations?: StudioToolInvocation[];
    createdAt?: Date;
}

export interface StudioToolInvocation {
  state: "call" | "result";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
  result?: unknown;
}

// Interface for the hook results to satisfy TSC without 'any'
interface ChatHelpers {
  messages: StudioMessage[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => void;
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  setMessages: (messages: StudioMessage[]) => void;
}

interface AIAssistantSidebarProps {
  workspaceName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface PlanStep {
  id: string;
  description: string;
  filesData?: string[];
}

interface PlanContent {
  goal: string;
  steps: PlanStep[];
}

export function AIAssistantSidebar({ workspaceName, isOpen, onClose }: AIAssistantSidebarProps) {
  const [isPlanMode, setIsPlanMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const welcomeMsg: StudioMessage = {
    id: "welcome",
    role: "assistant",
    content: `Hi! I'm your CodeVerse AI Assistant. I can help you explore this project, write code, or run terminal commands. How can I help you with **${workspaceName}** today?`,
  };

  // Safe bridge to bypass AI SDK v3 type-brand mismatches while keeping internals strict
  const chatOptions = {
    api: "/api/agent",
    body: {
      workspaceName,
      mode: isPlanMode ? "plan" : "execute",
    },
  };

  // Casting the hook result to our strictly-typed internal interface
  const chat = useChat(chatOptions as unknown as Parameters<typeof useChat>[0]) as unknown as ChatHelpers;

  const { 
    messages: chatMessages, 
    input, 
    handleInputChange, 
    handleSubmit, 
    isLoading, 
    setMessages 
  } = chat;

  // Fetch history on mount
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`/api/agent?workspaceName=${workspaceName}`);
        if (res.ok) {
          const data = await res.json() as { messages: StudioMessage[] };
          if (data.messages && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history:", err);
      }
    };
    fetchHistory();
  }, [workspaceName, setMessages]);

  const clearHistory = () => {
    setMessages([]);
  };

  const messages = useMemo<StudioMessage[]>(
    () => (chatMessages.length === 0 ? [welcomeMsg] : chatMessages),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chatMessages, workspaceName]
  );

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const renderToolInvocation = (tool: StudioToolInvocation) => {
    const isDone = tool.state === "result";
    const iconMap: Record<string, React.ReactNode> = {
      read_file: <FileText size={14} />,
      write_file: <Plus size={14} />,
      terminal_command: <Terminal size={14} />,
      search_code: <SearchIcon size={14} />,
      list_files: <MessageSquare size={14} />,
    };
    const icon = iconMap[tool.toolName] || <Wand2 size={14} />;

    return (
      <div key={tool.toolCallId} className="flex flex-col gap-2 p-3 my-2 rounded-xl bg-(--bg-2) border border-(--border-subtle) overflow-hidden shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold text-(--text-2) uppercase tracking-wider">
            <span className={isDone ? "text-(--success)" : "text-(--accent) animate-pulse"}>
              {icon}
            </span>
            <span>{tool.toolName.replace(/_/g, " ")}</span>
          </div>
          {isDone && <Check size={12} className="text-(--success)" />}
        </div>
        
        {!isDone && (
          <div className="text-[10px] font-mono text-(--text-muted) truncate opacity-70 italic">
            {JSON.stringify(tool.args)}
          </div>
        )}
        
        {isDone && !!tool.result && (
          <div className="text-[10px] font-mono bg-(--bg-3) p-2 rounded border border-(--border) text-(--text-muted) max-h-32 overflow-y-auto custom-scrollbar whitespace-pre-wrap">
            {typeof tool.result === "string" 
               ? (tool.result.length > 500 ? tool.result.slice(0, 500) + "..." : tool.result)
               : JSON.stringify(tool.result, null, 2).slice(0, 500) + (JSON.stringify(tool.result).length > 500 ? "..." : "")}
          </div>
        )}
      </div>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 220 }}
          className="fixed top-0 right-0 h-full w-[440px] bg-(--surface) border-l border-(--border) shadow-2xl z-50 flex flex-col glassmorphism overflow-hidden"
        >
          {/* Header */}
          <div className="p-4 border-b border-(--border-subtle) flex items-center justify-between bg-(--bg-2) bg-opacity-70 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-(--accent) bg-opacity-10 flex items-center justify-center text-(--accent) shadow-inner border border-(--accent) border-opacity-20">
                <Bot size={22} />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black text-(--text) tracking-tight">AI STUDIO</span>
                <span className="text-[10px] text-(--text-muted) flex items-center gap-1 uppercase font-bold tracking-tighter">
                  <div className="w-1.5 h-1.5 rounded-full bg-(--success) animate-pulse shadow-[0_0_8px_var(--success)]" />
                  Isolated • {workspaceName}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setIsPlanMode(!isPlanMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black transition-all border shadow-sm ${
                  isPlanMode 
                    ? "bg-(--warning) bg-opacity-15 text-(--warning) border-(--warning) border-opacity-40" 
                    : "bg-(--bg-3) text-(--text-muted) border-transparent hover:text-(--text) hover:bg-(--surface-hover)"
                }`}
              >
                <Wand2 size={12} />
                {isPlanMode ? "PLAN" : "DIRECT"}
              </button>
              <div className="w-px h-4 bg-(--border-subtle) mx-1" />
              <button 
                onClick={clearHistory} 
                className="p-2 hover:bg-(--error) hover:bg-opacity-10 rounded-xl transition-all text-(--text-muted) hover:text-(--error)" 
                title="Clear History"
              >
                <Trash2 size={18} />
              </button>
              <button 
                onClick={onClose} 
                className="p-2 hover:bg-(--surface-hover) rounded-xl transition-all text-(--text-muted) hover:text-(--text)"
              >
                <X size={22} />
              </button>
            </div>
          </div>

          {/* Messages Container */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-8 custom-scrollbar scroll-smooth">
            {messages.map((m) => (
              <div key={m.id} className={`flex gap-4 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
                <div className={`w-9 h-9 rounded-xl shrink-0 flex items-center justify-center shadow-sm border ${
                  m.role === "user" 
                    ? "bg-(--bg-3) text-(--text) border-(--border-subtle)" 
                    : "bg-(--accent) bg-opacity-10 text-(--accent) border-(--accent) border-opacity-20"
                }`}>
                  {m.role === "user" ? <User size={18} /> : <Bot size={18} />}
                </div>
                
                <div className={`flex flex-col gap-2 max-w-[85%] ${m.role === "user" ? "items-end" : ""}`}>
                  <div className={`px-4 py-3.5 rounded-2xl text-sm leading-relaxed shadow-md border animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                    m.role === "user"
                      ? "bg-(--accent) text-white rounded-tr-sm border-transparent"
                      : "bg-(--bg-2) text-(--text) rounded-tl-sm border-(--border-subtle)"
                  }`}>
                    {m.role === "assistant" && m.content.startsWith("{") && m.content.includes("goal") ? (
                      <div className="flex flex-col gap-4 py-1">
                        <div className="flex items-center gap-2 text-(--accent) font-black uppercase tracking-[0.2em] text-[9px]">
                          <Check size={12} className="stroke-[3px]" /> System Plan Generated
                        </div>
                        {(() => {
                          try {
                            const plan = JSON.parse(m.content) as PlanContent;
                            return (
                                <div className="space-y-4">
                                  <div className="font-bold text-sm text-(--text) bg-(--bg-3) p-3 rounded-xl border border-(--border-subtle) shadow-inner">
                                    {String(plan.goal)}
                                  </div>
                                  <div className="space-y-2.5">
                                    {(plan.steps || []).map((s, i) => (
                                      <div key={s.id || String(i)} className="flex gap-3 p-3 rounded-xl bg-(--surface) bg-opacity-50 hover:bg-(--bg-3) transition-all border border-(--border-subtle) group">
                                        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-(--accent) bg-opacity-10 text-(--accent) text-[11px] font-black shrink-0 group-hover:scale-110 transition-transform">
                                          {i+1}
                                        </span>
                                        <span className="text-xs text-(--text-2) font-medium leading-[1.6]">{String(s.description)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                            );
                          } catch { return <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>; }
                        })()}
                      </div>
                    ) : (
                      <div className="prose prose-sm prose-invert max-w-full">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                            code({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
                                const match = /language-(\w+)/.exec(className || "");
                                const isInline = !match;
                                return isInline ? (
                                <code className="bg-(--bg-3) px-1.5 py-0.5 rounded-md text-(--accent) font-mono text-[0.9em]" {...props}>
                                    {children}
                                </code>
                                ) : (
                                <div className="my-4 rounded-xl overflow-hidden border border-(--border-subtle) shadow-lg">
                                    <div className="bg-(--bg-3) px-4 py-1.5 border-b border-(--border-subtle) flex items-center justify-between">
                                        <span className="text-[10px] font-black text-(--text-muted) uppercase tracking-widest">{match[1]}</span>
                                    </div>
                                    <SyntaxHighlighter
                                        style={vscDarkPlus}
                                        language={match[1]}
                                        PreTag="div"
                                        className="m-0! text-xs! bg-(--bg-2)!"
                                    >
                                        {String(children).replace(/\n$/, "")}
                                    </SyntaxHighlighter>
                                </div>
                                );
                            },
                            }}
                        >
                            {m.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                  
                  {/* Tool Invocations */}
                  {m.toolInvocations?.map((tool: StudioToolInvocation) => renderToolInvocation(tool))}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-4 animate-in fade-in duration-500">
                <div className="w-9 h-9 rounded-xl bg-(--accent) bg-opacity-10 flex items-center justify-center text-(--accent) border border-(--accent) border-opacity-10">
                  <Bot size={18} className="animate-pulse" />
                </div>
                <div className="flex gap-1.5 p-3 px-4 bg-(--bg-2) rounded-2xl border border-(--border-subtle)">
                  <span className="w-1.5 h-1.5 rounded-full bg-(--accent) animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-(--accent) animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-(--accent) animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="p-5 bg-(--bg-2) bg-opacity-80 backdrop-blur-md border-t border-(--border-subtle)">
            <form
              onSubmit={(e: FormEvent<HTMLFormElement>) => {
                e.preventDefault();
                handleSubmit(e);
              }}
              className="relative group"
            >
              <textarea
                value={input}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => handleInputChange(e)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) (e.currentTarget.form)?.requestSubmit();
                  }
                }}
                placeholder={isPlanMode ? "Define an architecture or complex goal..." : "How can I help you today?"}
                rows={1}
                className="w-full bg-(--surface) text-(--text) text-sm rounded-2xl pl-11 pr-14 py-4 border border-(--border) focus:border-(--accent) focus:ring-4 focus:ring-(--accent) focus:ring-opacity-5 outline-none resize-none min-h-[56px] max-h-[240px] transition-all scrollbar-hide shadow-lg group-hover:border-(--border-subtle)"
                style={{ height: "auto" }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = "auto";
                  target.style.height = `${Math.min(target.scrollHeight, 240)}px`;
                }}
              />
              <div className="absolute left-4 top-[17px] text-(--text-muted) transition-colors group-focus-within:text-(--accent)">
                {isPlanMode ? <Wand2 size={20} className="text-(--warning)" /> : <MessageSquare size={20} />}
              </div>
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="absolute right-2.5 top-2.5 w-[36px] h-[36px] rounded-xl bg-(--accent) text-white hover:scale-105 active:scale-95 disabled:opacity-20 disabled:grayscale disabled:cursor-not-allowed transition-all shadow-md flex items-center justify-center overflow-hidden"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send size={18} className="translate-x-px -translate-y-px" />
                )}
              </button>
            </form>
            <div className="flex items-center justify-between px-1 mt-3.5">
                <p className="text-[9px] text-(--text-muted) flex items-center gap-1.5 font-bold uppercase tracking-widest opacity-60">
                    <Check size={10} className="text-(--success)" /> Context Captured
                </p>
                <p className="text-[9px] text-(--text-muted) flex items-center gap-1.5 font-bold uppercase tracking-widest opacity-60">
                    Shift+Enter for multi-line
                </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
