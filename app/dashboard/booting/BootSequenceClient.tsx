"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, ArrowLeft, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export default function BootSequenceClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const id = searchParams.get("id");
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<"booting" | "ready" | "error">("booting");
    const endRef = useRef<HTMLDivElement>(null);

    const boot = useCallback(async () => {
        if (!id) {
            setLogs(["ERROR: No workspace ID provided."]);
            setStatus("error");
            return;
        }

        setStatus("booting");
        setLogs([]);

        let isMounted = true;
        const addLog = (msg: string) => {
            if (isMounted) setLogs(prev => [...prev, msg]);
        };

        try {
            addLog(`[SYSTEM] Initializing boot sequence for workspace: ${id.slice(0, 8)}...`);
            await new Promise(r => setTimeout(r, 600));

            addLog(`[NETWORK] Resolving internal DNS routing...`);
            await new Promise(r => setTimeout(r, 400));

            addLog(`[DOCKER] Sending boot command to daemon via Dockerode...`);

            const res = await fetch("/api/workspace", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "start", id })
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || "Failed to boot container");
            }

            addLog(`[DOCKER] Container successfully provisioned.`);
            addLog(`[SYSTEM] Database state updated to 'running'.`);
            await new Promise(r => setTimeout(r, 500));

            addLog(`[PROXY] Establishing reverse proxy tunnel on port 8080...`);
            await new Promise(r => setTimeout(r, 800));

            addLog(`[SYSTEM] Environment ready. Redirecting to workspace...`);
            if (isMounted) setStatus("ready");

            setTimeout(() => {
                if (isMounted) {
                    router.push(`/?workspace=${encodeURIComponent(id)}`);
                }
            }, 1000);

        } catch (err: unknown) {
            addLog(`[FATAL] ${(err as Error).message}`);
            if (isMounted) setStatus("error");
        }

        return () => { isMounted = false; };
    }, [id, router]);

    useEffect(() => {
        boot();
    }, [boot]);

    useEffect(() => {
        if (endRef.current) {
            endRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs]);

    return (
        <div className="flex flex-col gap-5">
            {/* Terminal Log */}
            <div className="bg-[#0a0a0a] rounded-xl p-4 min-h-[300px] border border-[#222] shadow-[inset_0_0_30px_rgba(0,0,0,0.6)] overflow-y-auto font-mono text-sm">
                {logs.map((log, i) => (
                    <div key={i} className="mb-1 leading-relaxed">
                        {log.startsWith("[ERROR]") || log.startsWith("[FATAL]") ? (
                            <span className="text-red-400">{log}</span>
                        ) : log.includes("ready") || log.includes("success") || log.includes("complete") ? (
                            <span className="text-green-400">{log}</span>
                        ) : log.startsWith("[SYSTEM]") ? (
                            <span className="text-blue-400">{log}</span>
                        ) : (
                            <span className="text-zinc-400">{log}</span>
                        )}
                    </div>
                ))}

                {status === "booting" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <Loader2 size={14} className="animate-spin" />
                        <span className="text-sm font-semibold animate-pulse">Running boot procedures...</span>
                    </div>
                )}
                {status === "ready" && (
                    <div className="flex items-center gap-2 mt-4 text-green-400">
                        <CheckCircle2 size={14} />
                        <span className="text-sm font-semibold">Boot successful! Redirecting...</span>
                    </div>
                )}
                {status === "error" && (
                    <div className="flex items-center gap-2 mt-4 text-red-400">
                        <XCircle size={14} />
                        <span className="text-sm font-semibold">Boot sequence failed.</span>
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
                        Retry Boot
                    </button>
                </div>
            )}
        </div>
    );
}
