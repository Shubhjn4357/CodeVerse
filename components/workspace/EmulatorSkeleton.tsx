"use client";

import { Loader2 } from "lucide-react";

export function EmulatorSkeleton({ label = "Loading...", platform }: { label?: string; platform?: string }) {
    return (
        <div className="flex-1 w-full bg-[#1e1e1e] flex flex-col items-center justify-center overflow-hidden animate-pulse">
            <Loader2 size={32} className="animate-spin text-(--accent) mb-4" />
            <p className="text-(--text-muted) font-medium tracking-wide">
                {label}
            </p>
            {platform && (
                <p className="text-xs text-(--text-muted) opacity-60 mt-2 capitalize">
                    {platform} Simulator Environment
                </p>
            )}
        </div>
    );
}
