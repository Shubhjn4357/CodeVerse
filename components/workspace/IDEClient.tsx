"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import { VSCodeFrame } from "@/components/workspace/VSCodeFrame";
import { AIAssistantSidebar } from "@/components/workspace/AIAssistantSidebar";
import { WorkspaceHeader } from "@/components/workspace/WorkspaceHeader";
import type { Session } from "next-auth";

// Dynamic Dashboard import
const Dashboard = dynamic(() => import("@/components/dashboard/Dashboard"), { ssr: false });

export default function IDEClient({ session }: { session: Session | null }) {
  const searchParams = useSearchParams();
  const workspaceParam = searchParams?.get("workspace");
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [theme] = useState<"dark" | "light">("dark");
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
      <WorkspaceHeader 
        workspaceId={workspaceParam}
        session={session}
        isAiOpen={isAiOpen}
        onAiToggle={() => setIsAiOpen(!isAiOpen)}
        onRebuild={handleRebuild}
      />

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
