"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, ArrowRight } from "lucide-react";
import { useAppStore } from "@/store/editor";

interface Command {
    id: string;
    label: string;
    description?: string;
    kbd?: string;
    icon?: string;
    action: () => void;
}

interface CommandPaletteProps {
    onClose: () => void;
    onOpenFile: (path: string) => void;
}

export default function CommandPalette({ onClose, onOpenFile }: CommandPaletteProps) {
    const [query, setQuery] = useState("");
    const [focused, setFocused] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const openFiles = useAppStore(s => s.openFiles);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const commands: Command[] = [
        { id: "new-terminal", label: "New Terminal", description: "Open a new terminal session", kbd: "⌃`", icon: "⬚", action: () => { onClose(); } },
        { id: "toggle-sidebar", label: "Toggle Sidebar", description: "Show or hide the sidebar", kbd: "⌘B", icon: "◧", action: () => { onClose(); } },
        { id: "format-doc", label: "Format Document", description: "Format the current file with Prettier", kbd: "⌥⇧F", icon: "⚡", action: () => { onClose(); } },
        { id: "go-to-file", label: "Go to File…", description: "Quickly open a file by name", kbd: "⌘P", icon: "📄", action: () => { onClose(); } },
        { id: "find-in-files", label: "Find in Files", description: "Search across all files", kbd: "⌘⇧F", icon: "🔍", action: () => { onClose(); } },
        { id: "git-commit", label: "Git: Commit", description: "Stage and commit changes", icon: "⎇", action: () => { onClose(); } },
        { id: "git-push", label: "Git: Push", description: "Push commits to remote", icon: "⎇", action: () => { onClose(); } },
        { id: "git-pull", label: "Git: Pull", description: "Pull from remote", icon: "⎇", action: () => { onClose(); } },
        { id: "toggle-theme", label: "Toggle Color Theme", description: "Switch between dark and light theme", icon: "🎨", action: () => { onClose(); } },
        { id: "open-settings", label: "Open Settings", description: "Customize your IDE environment", kbd: "⌘,", icon: "⚙", action: () => { onClose(); } },
        { id: "zen-mode", label: "Toggle Zen Mode", description: "Distraction-free coding", kbd: "⌘K Z", icon: "🧘", action: () => { onClose(); } },
        ...openFiles.map(f => ({
            id: `open-${f}`,
            label: f.split(/[\\/]/).pop() ?? f,
            description: f,
            icon: "📄",
            action: () => { onOpenFile(f); onClose(); }
        })),
    ];

    const filtered = query.trim()
        ? commands.filter(c =>
            c.label.toLowerCase().includes(query.toLowerCase()) ||
            c.description?.toLowerCase().includes(query.toLowerCase())
        )
        : commands;

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === "Escape") { onClose(); return; }
        if (e.key === "ArrowDown") { e.preventDefault(); setFocused(f => Math.min(f + 1, filtered.length - 1)); }
        if (e.key === "ArrowUp") { e.preventDefault(); setFocused(f => Math.max(f - 1, 0)); }
        if (e.key === "Enter") {
            e.preventDefault();
            filtered[focused]?.action();
        }
    }, [filtered, focused, onClose]);

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="command-palette-overlay"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.96, y: -10 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.96, y: -10 }}
                className="command-palette"
            >
                <div className="flex items-center border-b border-(--border-subtle)">
                    <Search size={14} className="ml-4 text-(--text-muted) shrink-0" />
                    <input
                        ref={inputRef}
                        className="command-input flex-1"
                        placeholder="Type a command or search…"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setFocused(0); }}
                        onKeyDown={handleKeyDown}
                    />
                    <span className="mr-4 text-[9px] text-(--text-muted) bg-(--bg-3) border border-(--border) rounded px-1.5 py-0.5 font-mono">ESC</span>
                </div>
                <div className="command-results">
                    {filtered.length === 0 ? (
                        <div className="p-6 text-center text-(--text-muted) text-sm">No commands found for "{query}"</div>
                    ) : (
                        filtered.map((cmd, i) => (
                            <button
                                key={cmd.id}
                                className={`command-item w-full text-left ${i === focused ? "focused" : ""}`}
                                onMouseEnter={() => setFocused(i)}
                                onClick={cmd.action}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-sm w-5 text-center shrink-0 text-(--text-muted)">{cmd.icon}</span>
                                    <div className="min-w-0">
                                        <p className="text-(--text) text-sm truncate">{cmd.label}</p>
                                        {cmd.description && (
                                            <p className="text-(--text-muted) text-xs truncate">{cmd.description}</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {cmd.kbd && <kbd className="hidden sm:block">{cmd.kbd}</kbd>}
                                    {i === focused && <ArrowRight size={12} className="text-(--accent)" />}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
