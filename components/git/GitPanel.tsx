"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    GitBranch, GitCommit, RefreshCw, Check, Clock,
    Plus, Minus, ArrowUp, ArrowDown, History, CheckCircle2, FileCode2
} from "lucide-react";
import { toast } from "sonner";

interface GitStatus {
    staged: string[];
    modified: string[];
    untracked: string[];
    branch: string;
}

export default function GitPanel() {
    const [status, setStatus] = useState<GitStatus>({ staged: [], modified: [], untracked: [], branch: "main" });
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    // Mock initial load for UI demonstration
    // Real implementation would hit /api/git
    useEffect(() => {
        setStatus({
            staged: [],
            modified: ["app/page.tsx", "components/layout/Sidebar.tsx"],
            untracked: ["components/git/GitPanel.tsx"],
            branch: "main"
        });
    }, []);

    const refresh = () => {
        setLoading(true);
        setTimeout(() => setLoading(false), 500);
    };

    const commit = () => {
        if (!message) {
            toast.error("Please enter a commit message");
            return;
        }
        toast.success(`Committed on ${status.branch}: ${message}`);
        setMessage("");
        setStatus(s => ({ ...s, staged: [], modified: [], untracked: [] }));
    };

    return (
        <div className="sidebar h-full flex flex-col overflow-hidden">
            <div className="sidebar-header">
                <span>Source Control</span>
                <div className="flex items-center gap-1">
                    <button className="activity-btn w-6 h-6" title="Commit" onClick={commit}>
                        <Check size={12} />
                    </button>
                    <button className="activity-btn w-6 h-6" title="Refresh" onClick={refresh}>
                        <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>
            </div>

            <div className="p-2 shrink-0 border-b border-(--border-subtle)">
                <div className="bg-(--bg-2) border border-(--border) rounded px-2 py-1.5 focus-within:border-(--accent) transition-colors">
                    <textarea
                        className="w-full bg-transparent border-none outline-none text-xs text-(--text) resize-none"
                        placeholder={`Message (⌘Enter to commit on '${status.branch}')`}
                        rows={3}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                commit();
                            }
                        }}
                    />
                </div>
                <button
                    className="btn btn-secondary w-full text-xs mt-2 py-1"
                    onClick={commit}
                    disabled={!message}
                >
                    Commit
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pt-2 pb-4 flex flex-col gap-4">
                {/* Staged */}
                <div>
                    <div className="px-3 py-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                        <span>Staged Changes</span>
                        <span className="badge bg-(--bg-3) text-(--text-muted)">{status.staged.length}</span>
                    </div>
                    {status.staged.length === 0 ? (
                        <p className="px-3 py-1 text-xs text-(--text-muted) italic">No staged changes</p>
                    ) : (
                        status.staged.map((f) => (
                            <div key={f} className="flex items-center justify-between px-3 py-1 hover:bg-(--surface-hover) cursor-pointer group">
                                <div className="flex items-center gap-2 truncate">
                                    <FileCode2 size={12} className="text-(--accent)" />
                                    <span className="text-xs truncate">{f.split("/").pop()}</span>
                                    <span className="text-[10px] text-(--text-muted) truncate">{f}</span>
                                </div>
                                <button className="opacity-0 group-hover:opacity-100 p-0.5 text-(--text-muted) hover:text-(--text)"><Minus size={12} /></button>
                            </div>
                        ))
                    )}
                </div>

                {/* Changes */}
                <div>
                    <div className="px-3 py-1 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
                        <span>Changes</span>
                        <span className="badge bg-(--bg-3) text-(--text-muted)">{status.modified.length + status.untracked.length}</span>
                    </div>
                    {status.modified.length === 0 && status.untracked.length === 0 ? (
                        <p className="px-3 py-1 text-xs text-(--text-muted) italic">Working tree clean</p>
                    ) : (
                        [...status.modified, ...status.untracked].map((f) => {
                            const filename = f.split("/").pop();
                            const isUntracked = status.untracked.includes(f);
                            return (
                                <div key={f} className="flex items-center justify-between px-3 py-1 hover:bg-(--surface-hover) cursor-pointer group">
                                    <div className="flex items-center gap-2 truncate">
                                        <FileCode2 size={12} className={isUntracked ? "text-(--success)" : "text-(--warning)"} />
                                        <span className={`text-xs truncate ${isUntracked ? "text-(--success)" : "text-(--warning)"}`}>{filename}</span>
                                        <span className="text-[10px] text-(--text-muted) truncate">{f}</span>
                                        <span className="text-[10px] ml-1 font-mono text-(--text-muted)">{isUntracked ? "U" : "M"}</span>
                                    </div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100">
                                        <button className="p-0.5 text-(--text-muted) hover:text-(--text)" title="Discard"><RefreshCw size={11} /></button>
                                        <button className="p-0.5 text-(--text-muted) hover:text-(--text)" title="Stage"><Plus size={14} /></button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

        </div>
    );
}
