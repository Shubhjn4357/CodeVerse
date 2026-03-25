"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import { VSCodeFrame } from "@/components/workspace/VSCodeFrame";
import Link from "next/link";
import type { Session } from "next-auth";

// Dynamic Dashboard import
const Dashboard = dynamic(() => import("@/components/dashboard/Dashboard"), { ssr: false });

export default function IDEClient({ session }: { session: Session | null }) {
  const searchParams = useSearchParams();
  const workspaceParam = searchParams?.get("workspace");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [refreshKey, setRefreshKey] = useState(0);

  // Apply theme globally
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    return () => setTheme("dark");
  }, [theme]);

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
    <div data-theme={theme} className="h-dvh w-screen flex flex-col bg-(--bg) overflow-hidden">
      <div className="h-10 flex items-center justify-between px-4 bg-(--activity-bar) border-b border-(--border-subtle) shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-(--accent) font-bold text-sm tracking-wide hover:opacity-80 transition-opacity">
            ⬡ CodeVerse
          </Link>
          <div className="h-4 w-px bg-(--border) mx-1" />
          <span className="text-xs text-(--text-muted) font-mono">Workspace: {workspaceParam}</span>
        </div>
        <div className="flex items-center gap-2">
          {session?.user && (
            <div className="flex items-center gap-2 mr-2 px-2 py-0.5 bg-(--border) rounded-full border border-(--border-subtle)">
              <div className="w-4 h-4 rounded-full bg-(--accent) flex items-center justify-center text-[10px] text-white font-bold">
                {session.user.name?.[0] || session.user.email?.[0] || "?"}
              </div>
              <span className="text-[10px] text-(--text-muted) font-medium max-w-[100px] truncate">
                {session.user.name || session.user.email}
              </span>
            </div>
          )}
          <button
            onClick={handleRebuild}
            className="px-3 py-1 text-xs font-semibold bg-(--border) hover:bg-(--border-subtle) text-(--text) rounded-md transition-colors border border-(--border-subtle) shadow-sm"
            title="Apply codeverse.json changes and restart container"
          >
            ↻ Rebuild Environment
          </button>
        </div>
      </div>

      <div className="flex-1 relative w-full h-full">
        <VSCodeFrame key={refreshKey} workspaceId={workspaceParam} />
      </div>

      <Toaster position="bottom-right" theme={theme} richColors />
    </div>
  );
}
