"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "@/store/editor";
import { readFileAction, saveFileAction } from "@/lib/actions/fs";
import { toast } from "sonner";

export function useEditor() {
    const activeFile = useAppStore(s => s.activeFile);
    const [contentCache, setContentCache] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);

    // Load file content when active file changes
    useEffect(() => {
        if (!activeFile) return;
        if (contentCache[activeFile] !== undefined) return; // Already loaded

        const loadContent = async () => {
            setLoading(true);
            try {
                const res = await readFileAction(activeFile);
                if (res.success && res.content) {
                    setContentCache(prev => ({ ...prev, [activeFile]: res.content }));
                } else {
                    toast.error(`Failed to load ${activeFile.split("/").pop()}`);
                }
            } catch (err) {
                console.error("Failed to load file:", err);
                toast.error(`Failed to load ${activeFile.split("/").pop()}`);
            } finally {
                setLoading(false);
            }
        };

        loadContent();
    }, [activeFile, contentCache]);

    const saveFile = async (path: string, newContent: string) => {
        setContentCache(prev => ({ ...prev, [path]: newContent }));
        const toastId = toast.loading(`Saving ${path.split("/").pop()}...`);
        try {
            await saveFileAction(path, newContent);
            toast.success("Saved successfully", { id: toastId });
        } catch (err) {
            console.error("Save error:", err);
            toast.error("Save Failed", { id: toastId });
        }
    };

    return {
        activeContent: activeFile ? contentCache[activeFile] ?? "" : "",
        loading,
        saveFile
    };
}
