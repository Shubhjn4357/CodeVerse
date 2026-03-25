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
    const [port, setPort] = useState<string | null>(null);
    const [androidPort, setAndroidPort] = useState<string | null>(null);
    const [appetizeUrl, setAppetizeUrl] = useState<string | null>(null);
    const [buildLogs, setBuildLogs] = useState<string[]>([]);

    const emulator = useEmulator("android");

    useEffect(() => {
        const events = new EventSource(`/api/workspace/stream?id=${workspaceId}&withAndroid=true`);

        events.addEventListener("log", (e) => {
            try {
                const msg = JSON.parse(e.data);
                setBuildLogs((prev) => [...prev, msg]);
            } catch {
                setBuildLogs((prev) => [...prev, e.data]);
            }
        });

        events.addEventListener("ready", (e) => {
            try {
                const data = JSON.parse(e.data);
                if (data.success && data.port) {
                    setPort(data.port);
                    if (data.appetizeUrl) setAppetizeUrl(data.appetizeUrl);
                    if (data.androidPort) {
                        setAndroidPort(data.androidPort);
                        emulator.setIsOpen(true);
                    }
                    setTimeout(() => setStatus("ready"), 1500);
                } else {
                    setStatus("error");
                }
            } catch {
                setStatus("error");
            }
            events.close();
        });

        events.addEventListener("error", () => {
            setStatus("error");
            events.close();
        });

        return () => events.close();
    }, [workspaceId, emulator]);

    if (status === "loading") {
        return (
            <div className="flex flex-col items-center pt-24 w-full h-full bg-(--bg) text-(--text-muted) space-y-4">
                <Loader2 size={32} className="animate-spin text-(--accent)" />
                <p className="animate-pulse">Provisioning containerized VS Code engine...</p>
                <div className="text-xs opacity-60">Initializing code-server, binding LSPs, and mapping volumes.</div>

                <div className="w-full max-w-2xl bg-black rounded-lg p-4 font-mono text-xs overflow-y-auto h-64 mt-8 shadow-xl border border-gray-800 flex flex-col items-start text-left">
                    {buildLogs.map((log, i) => (
                        <div key={i} className="text-gray-300 w-full break-all">
                            <span className="text-green-500 mr-2">❯</span>
                            {log}
                        </div>
                    ))}
                    <div className="animate-pulse text-gray-500 mt-2">_</div>
                </div>

                <div className="text-[10px] opacity-40 mt-4">Also booting Android Container (This takes significantly longer...)</div>
            </div>
        );
    }

    if (status === "error") {
        return (
            <div className="flex flex-col items-center justify-center w-full h-full bg-(--bg) text-(--error) space-y-4">
                <ServerCrash size={48} />
                <h3 className="text-lg font-bold text-(--text)">Failed to boot Workspace</h3>
                <p className="text-sm opacity-80 text-center max-w-md">
                    The Docker engine failed to provision the `code-server` container for workspace {workspaceId}.
                    Please ensure the Docker daemon is running and the codercom/code-server image is available.
                </p>
            </div>
        );
    }

    const targetUrl = `http://localhost:${port}/?folder=/config/workspace`;
    const devServerPort = "3000";

    return (
        <div className="w-full h-full flex overflow-hidden">
            <div className={`relative h-full transition-all duration-300 ${emulator.isOpen ? 'w-[60%]' : 'w-full'}`}>
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
                <div className="w-[40%] h-full flex flex-col min-w-[320px]">
                    <EmulatorPane
                        platform={emulator.platform}
                        setPlatform={emulator.changePlatform}
                        refreshKey={emulator.refreshKey}
                        isLoading={emulator.isLoading}
                        onRefresh={emulator.refreshIframe}
                        onClose={emulator.closeEmulator}
                        androidPort={androidPort}
                        devServerPort={devServerPort}
                        appetizeUrl={appetizeUrl}
                        workspaceId={workspaceId}
                    />
                </div>
            )}
        </div>
    );
}
