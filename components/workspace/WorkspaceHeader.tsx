"use client";

import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";

interface WorkspaceHeaderProps {
  workspaceId: string;
  session: Session | null;
  isAiOpen: boolean;
  onAiToggle: () => void;
  onRebuild: () => void;
}

export function WorkspaceHeader({ workspaceId, session, isAiOpen, onAiToggle, onRebuild }: WorkspaceHeaderProps) {
  return (
    <div className="h-10 flex items-center justify-between px-4 bg-(--activity-bar) border-b border-(--border-subtle) shrink-0 z-40">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-(--accent) font-bold text-sm tracking-wide hover:opacity-80 transition-opacity flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-(--accent) flex items-center justify-center text-white text-[10px]">⬡</div>
          CodeVerse
        </Link>
        <div className="h-4 w-px bg-(--border) mx-1" />
        <span className="text-xs text-(--text-muted) font-mono">Workspace: {workspaceId}</span>
      </div>
      <div className="flex items-center gap-2">
        {session?.user && (
          <div className="hidden md:flex items-center gap-2 mr-2 px-2 py-0.5 bg-(--border) rounded-full border border-(--border-subtle)">
            <div className="w-4 h-4 rounded-full bg-(--accent) flex items-center justify-center text-[10px] text-white font-bold">
              {session.user.name?.[0] || session.user.email?.[0] || "?"}
            </div>
            <span className="text-[10px] text-(--text-muted) font-medium max-w-[100px] truncate">
              {session.user.name || session.user.email}
            </span>
          </div>
        )}
        
        <button
          onClick={onAiToggle}
          className={`flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-md transition-all border ${
            isAiOpen 
              ? "bg-(--accent) text-white border-(--accent) shadow-lg shadow-(--accent)/20" 
              : "bg-(--border) hover:bg-(--border-subtle) text-(--text) border-(--border-subtle)"
          }`}
        >
          <Sparkles className={`w-3.5 h-3.5 ${isAiOpen ? "animate-pulse" : ""}`} />
          {isAiOpen ? "AI Active" : "AI Studio"}
        </button>

        <div className="w-px h-4 bg-(--border) mx-1" />

        <button
          onClick={onRebuild}
          className="px-3 py-1 text-xs font-semibold bg-(--border) hover:bg-(--border-subtle) text-(--text) rounded-md transition-colors border border-(--border-subtle) shadow-sm"
          title="Apply codeverse.json changes and restart container"
        >
          ↻ Rebuild
        </button>
      </div>
    </div>
  );
}
