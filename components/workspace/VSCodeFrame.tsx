"use client";

import { useEffect, useState } from "react";
import { Loader2, ServerCrash, Smartphone } from "lucide-react";
import { EmulatorPane } from "./EmulatorPane";
import { useEmulator } from "@/hooks/useEmulator";

interface VSCodeFrameProps {
    workspaceId: string;
}

export function VSCodeFrame({ workspaceId }: VSCodeFrameProps) {
    const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
    const [androidPort, setAndroidPort] = useState<string | null>(null);
    const [appetizeUrl, setAppetizeUrl] = useState<string | null>(null);
    const [buildLogs, setBuildLogs] = useState<string[]>([]);

    const emulator = useEmulator("android");

    useEffect(() => {
        let isMounted = true;

        const checkStatus = async () => {
            try {
                const res = await fetch(`/api/workspace/status?id=${workspaceId}`);
                const data = await res.json();
                if (data.ready && isMounted) {
                    setStatus("ready");
                    return true;
                }
            } catch (e) {
                console.error("Status probe failed:", e);
            }
            return false;
        };

        const init = async () => {
            const isReady = await checkStatus();
            if (isReady || !isMounted) return;

            const events = new EventSource(`/api/workspace/stream?id=${workspaceId}&withAndroid=true`);

            const handleLog = (e: Event) => {
                if (!isMounted) return;
                const me = e as MessageEvent;
                try {
                    const msg = JSON.parse(me.data);
                    setBuildLogs((prev) => [...prev, msg]);
                } catch {
                    setBuildLogs((prev) => [...prev, me.data]);
                }
            };

            const handleReady = (e: Event) => {
                if (!isMounted) return;
                const me = e as MessageEvent;
                try {
                    const data = JSON.parse(me.data);
                    if (data.success) {
                        if (data.appetizeUrl) setAppetizeUrl(data.appetizeUrl);
                        if (data.androidPort) {
                            setAndroidPort(data.androidPort);
                            emulator.setIsOpen(true);
                        }
                        setStatus("ready"); // Instant ready instead of 1.5s delay
                    } else {
                        setStatus("error");
                    }
                } catch (e: unknown) {
                    console.error(`[WATCHDOG:ERR] ${e instanceof Error ? e.message : String(e)}`);
                }
                events.close();
            };

            const handleError = () => {
                if (isMounted) setStatus("error");
                events.close();
            };

            events.addEventListener("log", handleLog);
            events.addEventListener("ready", handleReady);
            events.addEventListener("error", handleError);

            return () => {
                events.removeEventListener("log", handleLog);
                events.removeEventListener("ready", handleReady);
                events.removeEventListener("error", handleError);
                events.close();
            };
        };

        init();
        return () => { isMounted = false; };
    }, [workspaceId, emulator]);

    if (status === "loading") {
        return (
            <div className="flex flex-col items-center pt-24 w-full h-full bg-[#050505] text-(--text-muted) space-y-6 overflow-hidden relative">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(57,211,83,0.03)_0%,transparent_70%)] pointer-events-none" />
                
                <div className="z-10 flex flex-col items-center gap-4">
                    <Loader2 size={32} className="animate-spin text-(--accent)" />
                    <p className="text-sm font-bold tracking-widest uppercase animate-pulse text-(--accent)">Syncing Environment...</p>
                </div>

                <div className="w-full max-w-2xl bg-[#0a0a0a] rounded-xl p-4 font-mono text-[11px] overflow-y-auto h-72 z-10 border border-[#222] shadow-[inset_0_0_40px_rgba(0,0,0,0.8)] relative group">
                    <div className="absolute top-4 right-4 text-[#333] group-hover:text-zinc-600 transition-colors pointer-events-none uppercase text-[10px] tracking-widest font-bold flex items-center gap-2">
                        <Smartphone size={12} />
                        IDX Studio Engine
                    </div>
                    {buildLogs.map((log, i) => (
                        <div key={i} className="mb-0.5 leading-relaxed tracking-tight text-zinc-400">
                            <span className="text-(--accent) mr-2 opacity-50">❯</span>
                            {log}
                        </div>
                    ))}
                    <div className="animate-pulse text-(--accent) mt-2 font-bold">_</div>
                </div>

                <div className="text-[10px] opacity-40 mt-4 italic z-10 font-mono tracking-tighter">
                   [ORCHESTRATOR] Binding LSPs, mapping virtual volumes, and hydrating Nix profile.
                </div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full bg-(--bg) text-(--error) space-y-4 p-8 text-center">
                <div className="p-4 bg-(--error)/10 rounded-full mb-2">
                    <ServerCrash size={48} className="text-(--error)" />
                </div>
                <h3 className="text-lg font-bold text-(--text)">Deployment Engine Failure</h3>
                <p className="text-sm opacity-80 max-w-md leading-relaxed">
                    The orchestration layer failed to provision workspace <span className="font-mono text-xs bg-(--border) px-1 rounded">{workspaceId}</span>. 
                    This usually occurs due to Docker socket timeouts or resource exhaustion in limited cloud environments.
                </p>
                <button 
                  onClick={() => window.location.reload()}
                  className="mt-4 px-6 py-2 bg-(--error) text-white rounded-lg text-sm font-medium hover:opacity-90 transition-all"
                >
                    Retry Sequence
                </button>
            </div>
        );
    }

    const targetUrl = `/workspace/${workspaceId}/?folder=/home/coder/project`;

    return (
        <div className="w-full h-full flex overflow-hidden bg-(--bg)">
            <div className={`relative h-full transition-all duration-500 ease-in-out ${emulator.isOpen ? 'w-[60%]' : 'w-full'}`}>
                <iframe
                    src={targetUrl}
                    className="w-full h-full border-0 bg-(--bg)"
                    allow="clipboard-read; clipboard-write; display-capture"
                    title="CodeVerse Remote Engine"
                />

                {!emulator.isOpen && (
                    <button
                        onClick={emulator.toggleOpen}
                        className="absolute bottom-6 right-6 p-4 bg-(--accent) text-white rounded-full shadow-2xl hover:opacity-90 hover:scale-110 active:scale-95 transition-all z-50 flex items-center justify-center border border-white/20"
                        title="Open Built-in Emulators"
                    >
                        <Smartphone size={22} />
                    </button>
                )}
            </div>

            {/* Emulator Side Panel */}
            {emulator.isOpen && (
                <div className="w-[40%] h-full flex flex-col min-w-[360px] border-l border-(--border-subtle) bg-(--bg-2) animate-in slide-in-from-right duration-300">
                    <EmulatorPane
                        platform={emulator.platform}
                        setPlatform={emulator.changePlatform}
                        refreshKey={emulator.refreshKey}
                        isLoading={emulator.isLoading}
                        onRefresh={emulator.refreshIframe}
                        onClose={() => emulator.setIsOpen(false)}
                        androidPort={androidPort}
                        appetizeUrl={appetizeUrl}
                        workspaceId={workspaceId}
                    />
                </div>
            )}
        </div>
    );
}
