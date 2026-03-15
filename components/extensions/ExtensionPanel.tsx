"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Package, Search, Star, Download, CheckCircle2,
    ToggleLeft, ToggleRight, RefreshCw, ExternalLink, X
} from "lucide-react";
import { BUILTIN_EXTENSIONS } from "@/constants/extensions";
import { toast } from "sonner";

type ExtCategory = "all" | "installed" | "Language" | "Snippets" | "Formatter" | "Linter" | "SCM" | "Tools";

const CATEGORIES: { id: ExtCategory; label: string }[] = [
    { id: "all", label: "All" },
    { id: "installed", label: "Installed" },
    { id: "Language", label: "Language" },
    { id: "Snippets", label: "Snippets" },
    { id: "Formatter", label: "Formatter" },
    { id: "Linter", label: "Linter" },
    { id: "SCM", label: "SCM" },
];

export default function ExtensionPanel() {
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState<ExtCategory>("all");
    const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(BUILTIN_EXTENSIONS.map((e) => [e.id, e.enabled]))
    );
    const [installed, setInstalled] = useState<Record<string, boolean>>(() =>
        Object.fromEntries(BUILTIN_EXTENSIONS.map((e) => [e.id, e.preinstalled]))
    );
    const [installing, setInstalling] = useState<string | null>(null);

    const toggle = (id: string) => {
        setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
        toast.success(enabled[id] ? "Extension disabled" : "Extension enabled");
    };

    const install = async (id: string) => {
        setInstalling(id);
        await new Promise((r) => setTimeout(r, 1200));
        setInstalled((prev) => ({ ...prev, [id]: true }));
        setEnabled((prev) => ({ ...prev, [id]: true }));
        setInstalling(null);
        toast.success(`Extension installed!`);
    };

    const filtered = BUILTIN_EXTENSIONS.filter((ext) => {
        const matchSearch = search
            ? ext.name.toLowerCase().includes(search.toLowerCase()) ||
            ext.description.toLowerCase().includes(search.toLowerCase())
            : true;
        const matchCat =
            category === "all" ? true :
                category === "installed" ? installed[ext.id] :
                    ext.category === category;
        return matchSearch && matchCat;
    });

    return (
        <div className="sidebar h-full flex flex-col overflow-hidden">
            {/* Header */}
            <div className="sidebar-header">
                <span>Extensions</span>
                <button className="activity-btn w-6 h-6" title="Refresh">
                    <RefreshCw size={12} />
                </button>
            </div>

            {/* Search */}
            <div className="px-2 py-2">
                <div className="relative">
                    <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-(--text-muted)" />
                    <input
                        className="input text-xs pl-7 py-1.5"
                        placeholder="Search extensions…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
            </div>

            {/* Category tabs */}
            <div className="flex gap-1 px-2 pb-2 overflow-x-auto shrink-0">
                {CATEGORIES.map((cat) => (
                    <button
                        key={cat.id}
                        onClick={() => setCategory(cat.id)}
                        className={`px-2.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-all shrink-0 ${category === cat.id ? "bg-(--accent) text-(--text-on-accent)" : "bg-(--bg-3) text-(--text-2) hover:bg-(--surface-hover)"}`}
                    >
                        {cat.label}
                    </button>
                ))}
            </div>

            {/* Extension list */}
            <div className="flex-1 overflow-y-auto px-2 py-1 flex flex-col gap-1.5">
                {filtered.map((ext) => (
                    <motion.div
                        key={ext.id}
                        layout
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="card p-3 gap-0"
                    >
                        <div className="flex items-start gap-2">
                            <div className="w-9 h-9 rounded-lg bg-(--bg-2) flex items-center justify-center text-lg shrink-0">
                                {ext.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-medium text-xs text-(--text) truncate">{ext.name}</span>
                                    {installed[ext.id] && (
                                        <span className="badge badge-accent text-[8px]">Installed</span>
                                    )}
                                </div>
                                <p className="text-(--text-muted) text-[10px] mt-0.5 line-clamp-2">{ext.description}</p>
                                <div className="flex items-center gap-1.5 mt-1.5">
                                    <span className="text-[9px] text-(--text-muted)">{ext.publisher} · v{ext.version}</span>
                                    <span className="badge bg-(--bg-3) text-(--text-muted) text-[8px]">{ext.category}</span>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-1.5 mt-2 pt-2 border-t border-(--border-subtle)">
                            {installed[ext.id] ? (
                                <button
                                    onClick={() => toggle(ext.id)}
                                    className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded transition-all ${enabled[ext.id] ? "text-(--accent) bg-[rgba(57,211,83,0.08)]" : "text-(--text-muted) bg-(--bg-2)"}`}
                                >
                                    {enabled[ext.id] ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                                    {enabled[ext.id] ? "Enabled" : "Disabled"}
                                </button>
                            ) : (
                                <button
                                    onClick={() => install(ext.id)}
                                    disabled={installing === ext.id}
                                    className="btn btn-primary py-1 px-2 text-[10px] gap-1"
                                >
                                    {installing === ext.id ? (
                                        <><span className="w-2.5 h-2.5 rounded-full border border-(--text-on-accent) border-t-transparent animate-spin" />Installing…</>
                                    ) : (
                                        <><Download size={10} /> Install</>
                                    )}
                                </button>
                            )}
                        </div>
                    </motion.div>
                ))}

                {filtered.length === 0 && (
                    <div className="text-center py-8 text-(--text-muted) text-xs">
                        <Package size={24} className="mx-auto mb-2 opacity-30" />
                        <p>No extensions found</p>
                    </div>
                )}
            </div>
        </div>
    );
}
