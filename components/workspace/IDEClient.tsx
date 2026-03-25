"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import { VSCodeFrame } from "@/components/workspace/VSCodeFrame";
import { AIAssistantSidebar } from "@/components/workspace/AIAssistantSidebar";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import type { Session } from "next-auth";

// Dynamic Dashboard import
const Dashboard = dynamic(() => import("@/components/dashboard/Dashboard"), { ssr: false });

export default function IDEClient({ session }: { session: Session | null }) {
  const searchParams = useSearchParams();
  const workspaceParam = searchParams?.get("workspace");
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [refreshKey, setRefreshKey] = useState(0);

  // Apply theme globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    // Cleanup if needed
  }, [theme]);

  // Keyboard shortcut for AI
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "i") {
        e.preventDefault();
        setIsAiOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // If no specific workspace is requested, render the Firebase-style Dashboard Control Plane
  if (!workspaceParam) {
    return (
      <div data-theme={theme} className="h-dvh flex flex-col overflow-hidden bg-(--bg)">
        <div className="flex-1 overflow-hidden">
          <Dashboard />
        </div>
        <Toaster position="bottom-right" theme={theme} richColors />
      </div>
    );
  }

  const handleRebuild = async () => {
    const promise = fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Hard-code Android true for demo purposes to match VSCodeFrame auto-starts
      body: JSON.stringify({ action: "rebuild", id: workspaceParam, image: 'codercom/code-server:latest', withAndroidEmulator: true })
    }).then(async res => {
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data;
    });

    toast.promise(promise, {
      loading: "Rebuilding Environment... This may take a minute.",
      success: () => {
        // Force VSCodeFrame to remount to fetch the new ports
        setRefreshKey(k => k + 1);
        return "Rebuild complete!";
      },
      error: "Failed to rebuild workspace."
    });
  };

  // Otherwise, render the dedicated VS Code Server instance mapped to this workspace
  return (
    <div data-theme={theme} className="h-dvh w-screen flex flex-col bg-(--bg) overflow-hidden relative">
      <div className="h-10 flex items-center justify-between px-4 bg-(--activity-bar) border-b border-(--border-subtle) shrink-0 z-40">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-(--accent) font-bold text-sm tracking-wide hover:opacity-80 transition-opacity flex items-center gap-1.5">
            <div className="w-5 h-5 rounded bg-(--accent) flex items-center justify-center text-white text-[10px]">⬡</div>
            CodeVerse
          </Link>
          <div className="h-4 w-px bg-(--border) mx-1" />
          <span className="text-xs text-(--text-muted) font-mono">Workspace: {workspaceParam}</span>
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
            onClick={() => setIsAiOpen(!isAiOpen)}
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
            onClick={handleRebuild}
            className="px-3 py-1 text-xs font-semibold bg-(--border) hover:bg-(--border-subtle) text-(--text) rounded-md transition-colors border border-(--border-subtle) shadow-sm"
            title="Apply codeverse.json changes and restart container"
          >
            ↻ Rebuild
          </button>
        </div>
      </div>

      <div className="flex-1 flex relative w-full h-full overflow-hidden">
        <main className={`flex-1 relative transition-all duration-300 ${isAiOpen ? "mr-0 md:mr-80 lg:mr-96" : "mr-0"}`}>
          <VSCodeFrame key={refreshKey} workspaceId={workspaceParam} />
        </main>
        
        <AIAssistantSidebar 
          workspaceName={workspaceParam} 
          isOpen={isAiOpen} 
          onClose={() => setIsAiOpen(false)} 
        />
      </div>

      <Toaster position="bottom-right" theme={theme} richColors />
    </div>
  );
}
