"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

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
            addLog("ERROR: No workspace ID provided.");
            setStatus("error");
            return;
        }

        // Close any existing connection before starting a new one
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
        }

        // We use a functional approach to initializing state to avoid synchronous cascade warnings
        setStatus("booting");
        setLogs([]);

        const eventSource = new EventSource(`/api/workspace/stream?id=${id}&withAndroid=${withAndroid}`);
        eventSourceRef.current = eventSource;

        eventSource.addEventListener("log", (event) => {
            addLog(event.data);
        });

        eventSource.addEventListener("ready", (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.success === false) {
                    addLog(`[FATAL] ${data.error || "Provisioning failed."}`);
                    setStatus("error");
                } else {
                    addLog("[SYSTEM] Workspace Online. Handshake complete.");
                    setStatus("ready");
                    
                    // Redirect immediately for performance
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
                addLog(`[FATAL] ${errData.message || "The deployment engine encountered an unexpected interruption."}`);
            } catch {
                console.warn("Retrying SSE connection via EventSource auto-reconnect...");
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
            {/* Terminal Log */}
            <div className="bg-[#0a0a0a] rounded-xl p-4 min-h-[300px] border border-[#222] shadow-[inset_0_0_30px_rgba(0,0,0,0.6)] overflow-y-auto font-mono text-sm h-[450px]">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 leading-relaxed">
                        {log.startsWith("[ERROR]") || log.startsWith("[FATAL]") || log.startsWith("[STDERR]") ? (
                            <span className="text-red-400">{log}</span>
                        ) : log.includes("Ready") || log.includes("Online") || log.includes("success") || log.includes("complete") ? (
                            <span className="text-green-400">{log}</span>
                        ) : log.startsWith("[SYSTEM]") || log.startsWith("[MANAGER]") || log.startsWith("[IDE-MANAGER]") || log.startsWith("[UP]") ? (
                            <span className="text-blue-400">{log}</span>
                        ) : (
                            <span className="text-zinc-500">{log}</span>
                        )}
                    </div>
                ))}

                {status === "booting" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm font-semibold animate-pulse">Synchronizing orchestration layers...</span>
                    </div>
                )}
                {status === "ready" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <CheckCircle2 size={14} />
                        <span className="text-sm font-semibold">Deployment Successful. Redirecting...</span>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex items-center gap-2 mt-4 text-red-500">
                        <XCircle size={14} />
                        <span className="text-sm font-semibold">Deployment Engine Stalled.</span>
                    </div>
                )}
                <div ref={endRef} />
            </div>

            {/* Action Buttons on Failure */}
            {status === "error" && (
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => router.push("/")}
                        className="flex items-center gap-2 px-4 py-2 bg-[#161b22] hover:bg-[#21262d] text-zinc-300 hover:text-white rounded-lg text-sm transition-all border border-[#30363d] hover:border-[#444]"
                    >
                        <ArrowLeft size={14} />
                        Back to Dashboard
                    </button>
                    <button
                        onClick={() => boot()}
                        className="flex items-center gap-2 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-400 hover:text-green-300 rounded-lg text-sm transition-all border border-green-500/20 hover:border-green-500/40"
                    >
                        <RefreshCw size={14} />
                        Retry Provisioning
                    </button>
                </div>
            )}
        </div>
    );
}
