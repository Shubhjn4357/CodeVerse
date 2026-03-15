"use client";

import { useState } from "react";
import { MonitorSmartphone, Apple, Smartphone, RefreshCw, X } from "lucide-react";

interface EmulatorPaneProps {
    androidPort?: string | null;
    devServerPort?: string | null; // E.g., 3000
    appetizeUrl?: string | null;
    onClose: () => void;
}

export function EmulatorPane({ androidPort, devServerPort = "3000", appetizeUrl = null, onClose }: EmulatorPaneProps) {
    const [platform, setPlatform] = useState<"android" | "ios">("android");
    const [key, setKey] = useState(0); // Used to force reload the iframe

    const handleRefresh = () => setKey(k => k + 1);

    // Provide helpful links since dev mode mapping is direct
    const androidUrl = androidPort ? `http://localhost:${androidPort}/vnc.html?autoconnect=true&resize=scale` : null;
    const iosUrl = `http://localhost:${devServerPort}`;

    return (
        <div className="flex flex-col h-full w-full bg-(--bg) border-l border-(--border-subtle)">
            {/* Toolbar */}
            <div className="h-10 flex items-center justify-between px-3 bg-(--activity-bar) border-b border-(--border-subtle) shrink-0">
                <div className="flex items-center gap-1 bg-(--bg) p-1 rounded-md">
                    <button
                        onClick={() => setPlatform("android")}
                        className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${platform === "android" ? 'bg-(--accent) text-white' : 'text-(--text-muted) hover:text-(--text)'}`}
                    >
                        <Smartphone size={14} /> Android
                    </button>
                    <button
                        onClick={() => setPlatform("ios")}
                        className={`flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-sm transition-colors ${platform === "ios" ? 'bg-(--accent) text-white' : 'text-(--text-muted) hover:text-(--text)'}`}
                    >
                        <Apple size={14} /> iOS Web
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={handleRefresh} className="p-1.5 text-(--text-muted) hover:text-(--text) hover:bg-(--border) rounded-md transition-colors" title="Reload Frame">
                        <RefreshCw size={14} />
                    </button>
                    <button onClick={onClose} className="p-1.5 text-(--text-muted) hover:text-(--error) hover:bg-(--border) rounded-md transition-colors" title="Close Emulator">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 w-full bg-[#1e1e1e] flex items-center justify-center overflow-hidden relative">
                {platform === "android" ? (
                    androidUrl ? (
                        <iframe
                            key={`android-${key}`}
                            src={androidUrl}
                            className="w-full h-full border-0"
                            title="CodeVerse Android Emulator"
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center text-(--text-muted) space-y-3 p-6 text-center">
                            <MonitorSmartphone size={40} className="opacity-50" />
                            <p className="text-sm">Android emulator is not provisioned for this workspace.</p>
                            <p className="text-xs opacity-70">You can enable it in workspace settings.</p>
                        </div>
                    )
                ) : (
                    appetizeUrl ? (
                        <iframe
                            key={`ios-${key}`}
                            src={appetizeUrl}
                            className="w-full h-full border-0"
                            title="CodeVerse Cloud iOS Emulator"
                            scrolling="no"
                        />
                    ) : (
                        // iOS Simulated Frame Fallback
                        <div className="relative w-[375px] h-[812px] bg-black rounded-[40px] shadow-2xl overflow-hidden border-12 border-black ring-1 ring-gray-800 flex flex-col scale-[0.7] sm:scale-75 md:scale-90 lg:scale-[0.85] origin-top">
                            {/* Notch */}
                            <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
                                <div className="w-32 h-6 bg-black rounded-b-2xl"></div>
                            </div>
                            {/* Status bar simulacrum */}
                            <div className="absolute top-0 inset-x-0 h-10 pointer-events-none flex justify-between px-6 pt-3 text-white text-[10px] font-bold z-40">
                                <span>9:41</span>
                                <div className="flex gap-1">
                                    <span>📶</span>
                                    <span>🔋</span>
                                </div>
                            </div>
                            {/* Screen */}
                            <div className="flex-1 w-full bg-white relative top-[-40px] pt-[40px] h-[calc(100%+40px)]">
                                <iframe
                                    key={`ios-${key}`}
                                    src={iosUrl}
                                    className="w-full h-full border-0"
                                    title="CodeVerse iOS Simulator"
                                />
                            </div>
                            {/* Home indicator */}
                            <div className="absolute bottom-2 inset-x-0 h-1 flex justify-center z-50">
                                <div className="w-32 h-1 bg-gray-200 rounded-full"></div>
                            </div>
                        </div>
                    )
                )}
            </div>
        </div>
    );
}
