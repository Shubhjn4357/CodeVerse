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

    const boot = useCallback(() => {
        if (!id) {
            setLogs(["ERROR: No workspace ID provided."]);
            setStatus("error");
            return;
        }

        setStatus("booting");
        setLogs([]);

        // Initialize Real-Time SSE Stream for workspace initialization
        const eventSource = new EventSource(`/api/workspace/stream?id=${id}&withAndroid=${withAndroid}`);

        eventSource.addEventListener("log", (event) => {
            const msg = event.data;
            setLogs(prev => [...prev, msg]);
        });

        eventSource.addEventListener("ready", (event) => {
            try {
                JSON.parse(event.data);
                setLogs(prev => [...prev, "[SYSTEM] Workspace Online. Handshake complete."]);
                setStatus("ready");
                
                // Redirect to workspace after a brief success confirmation
                setTimeout(() => {
                    router.push(`/?workspace=${encodeURIComponent(id)}`);
                }, 1000);
            } catch (e) {
                console.error("Failed to parse ready event:", e);
                setStatus("error");
            } finally {
                eventSource.close();
            }
        });

        eventSource.addEventListener("error", (event) => {
            try {
                const errData = JSON.parse((event as MessageEvent).data);
                setLogs(prev => [...prev, `[FATAL] ${errData.message || "Unknown stream error."}`]);
            } catch {
                setLogs(prev => [...prev, "[FATAL] The boot stream was interrupted unexpectedly."]);
            }
            setStatus("error");
            eventSource.close();
        });

        // Basic error handler for connection issues
        eventSource.onerror = () => {
            setLogs(prev => {
                if (prev.length > 0 && prev[prev.length - 1].startsWith("[FATAL]")) return prev;
                return [...prev, "[FATAL] Lost connection to the provisioning engine."];
            });
            setStatus("error");
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [id, withAndroid, router]);

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
            <div className="bg-[#0a0a0a] rounded-xl p-4 min-h-[300px] border border-[#222] shadow-[inset_0_0_30px_rgba(0,0,0,0.6)] overflow-y-auto font-mono text-sm h-[400px]">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 leading-relaxed">
                        {log.startsWith("[ERROR]") || log.startsWith("[FATAL]") ? (
                            <span className="text-red-400">{log}</span>
                        ) : log.includes("Ready") || log.includes("Online") || log.includes("success") || log.includes("complete") ? (
                            <span className="text-green-400">{log}</span>
                        ) : log.startsWith("[SYSTEM]") || log.startsWith("[MANAGER]") ? (
                            <span className="text-blue-400">{log}</span>
                        ) : (
                            <span className="text-zinc-500">{log}</span>
                        )}
                    </div>
                ))}

                {status === "booting" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm font-semibold animate-pulse">Establishing container link...</span>
                    </div>
                )}
                {status === "ready" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <CheckCircle2 size={14} />
                        <span className="text-sm font-semibold">Boot successful! Redirecting...</span>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex items-center gap-2 mt-4 text-red-500">
                        <XCircle size={14} />
                        <span className="text-sm font-semibold">Boot sequence interrupted.</span>
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
                        Abort Boot
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
