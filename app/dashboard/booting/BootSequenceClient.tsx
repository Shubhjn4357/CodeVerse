"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, RefreshCw, Terminal } from "lucide-react";

export default function BootSequenceClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id");
    const withAndroid = searchParams.get("withAndroid") === "true";
    
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<"booting" | "ready" | "error">("booting");
    const endRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);

    // Stable log handler to avoid triggering synchronous re-renders in boot()
    const addLog = useCallback((msg: string) => {
        setLogs(prev => {
            if (prev.includes(msg)) return prev;
            return [...prev, msg];
        });
    }, []);

    const boot = useCallback(() => {
        if (!id) {
            addLog("[FATAL] Missing workspace identity.");
            setStatus("error");
            return;
        }

        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        setStatus("booting");
        setLogs([]);

        // 🟢 TRIGGER: Explicitly start the workspace via POST
        fetch("/api/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "start", id, withAndroidEmulator: withAndroid })
        }).catch(err => addLog(`[IDX:ERR] Failed to initiate launch: ${err.message}`));

        const eventSource = new EventSource(`/api/workspace/stream?id=${id}&withAndroid=${withAndroid}`);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener("log", (event) => {
            addLog(event.data);
        });

        eventSource.addEventListener("ready", (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.success === false) {
                    addLog(`[IDX:ERR] Engine failure: ${data.error || "Unknown"}`);
                    setStatus("error");
                } else {
                    addLog("[IDX:APP] Studio Engine Online. Synchronized.");
                    setStatus("ready");
                    router.push(`/?workspace=${encodeURIComponent(id)}`);
                }
            } catch (e) {
                console.error("Failed to parse ready event:", e);
                setStatus("error");
            } finally {
                if (eventSourceRef.current) {
                    eventSourceRef.current.close();
                    eventSourceRef.current = null;
                }
            }
        });

        eventSource.addEventListener("error", (event) => {
            try {
                const data = (event as MessageEvent).data;
                const errData = data ? JSON.parse(data) : {};
                addLog(`[IDX:CRT] ${errData.message || "Environment connection broken."}`);
            } catch {
                console.warn("Retrying SSE via IDX-Bus...");
            }
        });

        return () => {
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                eventSourceRef.current = null;
            }
        };
    }, [id, withAndroid, router, addLog]);

    useEffect(() => {
        const cleanup = boot();
        return () => { if (cleanup) cleanup(); };
    }, [boot]);

    useEffect(() => {
        if (endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    return (
        <div className="flex flex-col gap-5">
            {/* IDX Branded Terminal */}
            <div className="bg-[#0a0a0a] rounded-xl p-4 min-h-[300px] border border-[#222] shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] overflow-y-auto font-mono text-xs md:text-sm h-[500px] relative group">
                <div className="absolute top-4 right-4 text-[#333] group-hover:text-zinc-600 transition-colors pointer-events-none uppercase text-[10px] tracking-widest font-bold flex items-center gap-2">
                    <Terminal size={12} />
                    IDX Studio Engine
                </div>
                
                {logs.map((log, i) => (
                    <div key={i} className="mb-0.5 leading-relaxed tracking-tight">
                         {log.startsWith("[IDX:ERR]") || log.startsWith("[IDX:CRT]") || log.startsWith("[FATAL]") ? (
                            <span className="text-red-400/90 font-medium">{log}</span>
                        ) : log.includes("Online") || log.includes("Synchronized") || log.includes("Verified") ? (
                            <span className="text-green-400 font-bold">{log}</span>
                        ) : log.startsWith("[IDX:ENGINE]") ? (
                            <span className="text-blue-400/80">{log}</span>
                        ) : log.startsWith("[IDX:NIX]") ? (
                            <span className="text-purple-400/80">{log}</span>
                        ) : log.startsWith("[HF:STORAGE]") ? (
                            <span className="text-cyan-400/80">{log}</span>
                        ) : log.startsWith("[IDX:HOOK]") ? (
                            <span className="text-amber-400/80">{log}</span>
                        ) : log.startsWith("[IDX:UP]") || log.includes("Cachix") ? (
                            <span className="text-zinc-400 font-medium italic">{log}</span>
                        ) : (
                            <span className="text-zinc-600">{log}</span>
                        )}
                    </div>
                ))}

                {status === "booting" && (
                    <div className="flex items-center gap-2 mt-4 text-blue-400/60">
                        <Loader2 size={12} className="animate-spin" />
                        <span className="text-[11px] font-bold tracking-widest uppercase animate-pulse">Syncing environment...</span>
                    </div>
                )}
                {status === "ready" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400/60">
                        <CheckCircle2 size={12} />
                        <span className="text-[11px] font-bold tracking-widest uppercase">Environment Synchronized</span>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex items-center gap-2 mt-4 text-red-500/60">
                        <XCircle size={12} />
                        <span className="text-[11px] font-bold tracking-widest uppercase">Engine Stalled</span>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Action Buttons */}
            {status === "error" && (
                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-500">
                    <button
                        onClick={() => router.push("/")}
                        className="flex items-center gap-2 px-5 py-2.5 bg-[#161b22] hover:bg-[#21262d] text-zinc-300 hover:text-white rounded-lg text-sm font-medium transition-all border border-[#30363d] hover:border-[#444]"
                    >
                        <ArrowLeft size={14} />
                        Platform Dashboard
                    </button>
                    <button
                        onClick={() => boot()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 rounded-lg text-sm font-medium transition-all border border-blue-500/20 hover:border-blue-500/40"
                    >
                        <RefreshCw size={14} />
                        Retry Sync
                    </button>
                </div>
            )}
        </div>
    );
}
