"use client";

import { useState, useCallback } from "react";
import { EmulatorPlatform } from "@/constants/emulator";

export function useEmulator(initialPlatform: EmulatorPlatform = "android") {
    const [isOpen, setIsOpen] = useState(false);
    const [platform, setPlatform] = useState<EmulatorPlatform>(initialPlatform);
    const [refreshKey, setRefreshKey] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    const toggleOpen = useCallback(() => setIsOpen(prev => !prev), []);
    const openEmulator = useCallback(() => setIsOpen(true), []);
    const closeEmulator = useCallback(() => setIsOpen(false), []);
    
    const changePlatform = useCallback((newPlatform: EmulatorPlatform) => {
        setIsLoading(true);
        setPlatform(newPlatform);
        // Reset loading after a short delay or when the platform change is acknowledged
        setTimeout(() => {
            setRefreshKey(k => k + 1);
            setIsLoading(false);
        }, 800);
    }, []);

    const refreshIframe = useCallback(() => {
        setIsLoading(true);
        setRefreshKey(k => k + 1);
        setTimeout(() => setIsLoading(false), 500);
    }, []);

    return {
        isOpen,
        platform,
        refreshKey,
        isLoading,
        setIsOpen,
        toggleOpen,
        openEmulator,
        closeEmulator,
        changePlatform,
        refreshIframe,
    };
}
