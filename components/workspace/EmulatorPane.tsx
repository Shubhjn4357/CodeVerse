"use client";

import { useState, useEffect } from "react";
import { 
    MonitorSmartphone, 
    Apple, 
    Smartphone, 
    RefreshCw, 
    X, 
    Globe, 
    Monitor, 
    ChevronLeft, 
    ChevronRight, 
    RotateCcw 
} from "lucide-react";
import { EmulatorPlatform, EMULATOR_PLATFORMS } from "@/constants/emulator";
import { EmulatorSkeleton } from "./EmulatorSkeleton";
import { checkDeviceAvailability } from "@/lib/actions/emulator";

interface EmulatorPaneProps {
    platform: EmulatorPlatform;
    setPlatform: (p: EmulatorPlatform) => void;
    refreshKey: number;
    isLoading: boolean;
    onRefresh: () => void;
    onClose: () => void;
    androidPort?: string | null;
    devServerPort?: string | null;
    appetizeUrl?: string | null;
    workspaceId: string;
}

export function EmulatorPane({ 
    platform, 
    setPlatform, 
    refreshKey, 
    isLoading: propIsLoading,
    onRefresh, 
    onClose, 
    androidPort, 
    devServerPort = "3000", 
    appetizeUrl = null,
    workspaceId
}: EmulatorPaneProps) {
    const [availability, setAvailability] = useState<{ available: boolean, reason?: string }>({ available: true });
    const [checking, setChecking] = useState(true);

    // Initial and platform-change availability check
    useEffect(() => {
        const check = async () => {
            setChecking(true);
            const result = await checkDeviceAvailability(platform, workspaceId);
            setAvailability(result);
            setChecking(false);
        };
        check();
    }, [platform, workspaceId]);

    const isLoading = propIsLoading || checking;

    const androidUrl = androidPort ? `http://localhost:${androidPort}/vnc.html?autoconnect=true&resize=scale` : null;
    const webUrl = `http://localhost:${devServerPort}`;

    const renderContent = () => {
        if (isLoading) {
            return <EmulatorSkeleton platform={platform} label={`Provisioning ${EMULATOR_PLATFORMS[platform].label} Engine...`} />;
        }

        if (!availability.available) {
            return (
                <div className="flex flex-col items-center justify-center text-(--text-muted) space-y-4 p-8 text-center bg-(--bg)">
                    <div className="p-4 bg-(--border) rounded-full opacity-20">
                        {platform === 'windows' ? <Monitor size={48} /> : <MonitorSmartphone size={48} />}
                    </div>
                    <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-(--text)">Platform Unavailable</h3>
                        <p className="text-xs opacity-70 max-w-[240px] leading-relaxed">
                            {availability.reason || "This emulator platform is not enabled for your current workspace plan."}
                        </p>
                    </div>
                    <button className="px-4 py-2 text-xs bg-(--accent) text-white rounded-md hover:opacity-90 transition-all font-medium">
                        Enable in Settings
                    </button>
                </div>
            );
        }

        switch (platform) {
            case "android":
                return androidUrl ? (
                    <iframe
                        key={`android-${refreshKey}`}
                        src={androidUrl}
                        className="w-full h-full border-0"
                        title="CodeVerse Android Emulator"
                    />
                ) : (
                    <div className="flex flex-col items-center justify-center text-(--text-muted) space-y-3 p-6 text-center">
                        <Smartphone size={40} className="opacity-50" />
                        <p className="text-sm font-medium">Android Not Provisioned</p>
                        <p className="text-xs opacity-60">Enable Android support in your workspace settings to use KVM virtualization.</p>
                    </div>
                );

            case "ios":
                return appetizeUrl ? (
                    <iframe
                        key={`ios-${refreshKey}`}
                        src={appetizeUrl}
                        className="w-full h-full border-0"
                        title="CodeVerse Cloud iOS Emulator"
                    />
                ) : (
                    <div className="relative w-[340px] h-[680px] bg-black rounded-[48px] shadow-2xl overflow-hidden border-8 border-zinc-900 ring-1 ring-white/10 flex flex-col scale-[0.8] origin-center">
                        {/* Notch */}
                        <div className="absolute top-0 inset-x-0 h-6 flex justify-center z-50">
                            <div className="w-24 h-5 bg-zinc-900 rounded-b-2xl" />
                        </div>
                        {/* Screen */}
                        <div className="flex-1 w-full bg-white">
                            <iframe
                                key={`ios-sim-${refreshKey}`}
                                src={webUrl}
                                className="w-full h-full border-0"
                                title="iOS Web Simulator"
                            />
                        </div>
                        {/* Home Bar */}
                        <div className="absolute bottom-2 inset-x-0 h-1 flex justify-center z-50">
                            <div className="w-24 h-1 bg-zinc-400/50 rounded-full" />
                        </div>
                    </div>
                );

            case "web":
                return (
                    <div className="flex flex-col w-full h-full bg-white">
                        {/* Browser Chrome */}
                        <div className="h-10 flex items-center px-4 bg-zinc-100 border-b border-zinc-200 gap-4 shrink-0">
                            <div className="flex items-center gap-2">
                                <ChevronLeft size={16} className="text-zinc-400" />
                                <ChevronRight size={16} className="text-zinc-400" />
                                <RotateCcw size={14} className="text-zinc-600 ml-1 cursor-pointer" onClick={onRefresh} />
                            </div>
                            <div className="flex-1 h-7 bg-white rounded-md border border-zinc-200 flex items-center px-3 text-[11px] text-zinc-500 font-mono overflow-hidden whitespace-nowrap">
                                {webUrl}
                            </div>
                            <div className="w-16 h-2 bg-zinc-200 rounded-full" />
                        </div>
                        <iframe
                            key={`web-${refreshKey}`}
                            src={webUrl}
                            className="flex-1 w-full border-0"
                            title="Web Preview"
                        />
                    </div>
                );

            case "windows":
                return (
                    <div className="flex flex-col items-center justify-center text-(--text-muted) space-y-4 p-8 text-center bg-[#004a99] w-full h-full">
                         <div className="text-white text-6xl font-bold mb-4 opacity-10 select-none">Windows</div>
                         <Monitor size={64} className="text-white/40" />
                         <div className="space-y-2">
                             <h3 className="text-lg font-bold text-white">Windows Application Container</h3>
                             <p className="text-white/60 text-sm max-w-[300px]">
                                Starting Windows Subsystem for Linux (WSL) and mapping X11 display to web-socket...
                             </p>
                         </div>
                         <div className="w-48 h-1 bg-white/20 rounded-full mt-4 overflow-hidden">
                             <div className="h-full bg-white w-1/3 animate-ping" />
                         </div>
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col h-full w-full bg-(--bg) border-l border-(--border-subtle) animate-in slide-in-from-right duration-300 shadow-2xl">
            {/* Nav Tabs */}
            <div className="h-12 flex items-center justify-between px-2 bg-(--activity-bar) border-b border-(--border-subtle) shrink-0">
                <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
                    {(Object.entries(EMULATOR_PLATFORMS) as [EmulatorPlatform, { label: string }][]).map(([key, info]) => {
                        const Icon = key === 'android' ? Smartphone : key === 'ios' ? Apple : key === 'web' ? Globe : Monitor;
                        return (
                            <button
                                key={key}
                                onClick={() => setPlatform(key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap ${
                                    platform === key 
                                    ? 'bg-(--accent)/10 text-(--accent) border border-(--accent)/20' 
                                    : 'text-(--text-muted) hover:text-(--text) hover:bg-(--border)'
                                }`}
                            >
                                <Icon size={14} />
                                {info.label}
                            </button>
                        );
                    })}
                </div>

                <div className="flex items-center gap-1 ml-2">
                    <button 
                        onClick={onRefresh} 
                        className="p-2 text-(--text-muted) hover:text-(--accent) hover:bg-(--accent)/10 rounded-md transition-all" 
                        title="Hot Reload Emulator"
                    >
                        <RefreshCw size={15} />
                    </button>
                    <button 
                        onClick={onClose} 
                        className="p-2 text-(--text-muted) hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all" 
                        title="Close Panel"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 w-full bg-[#1e1e1e] relative overflow-hidden flex items-center justify-center">
                {renderContent()}
            </div>
        </div>
    );
}
