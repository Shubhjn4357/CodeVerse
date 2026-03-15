import { Suspense } from "react";
import BootSequenceClient from "./BootSequenceClient";

export default function BootingPage() {
    return (
        <div className="h-full w-full bg-[#050505] text-(--terminal-fg) font-mono flex flex-col items-center justify-center p-6 relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,211,83,0.03)_0%,transparent_70%)] pointer-events-none" />
            
            <div className="w-full max-w-3xl flex flex-col gap-6 z-10">
                <div className="flex items-center gap-3 border-b border-[#222] pb-4">
                    <div className="flex gap-1.5">
                        <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50" />
                        <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
                        <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50" />
                    </div>
                    <span className="text-sm text-(--text-muted) tracking-widest font-semibold uppercase">Cloud IDE Orchestrator</span>
                </div>

                <Suspense fallback={<div className="text-(--text-muted) animate-pulse">Initializing connection...</div>}>
                    <BootSequenceClient />
                </Suspense>
            </div>
        </div>
    );
}
