"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSession } from "next-auth/react";
import {
    Plus, FolderOpen, Star, Search, ChevronDown,
    X, Globe, LayoutTemplate, Terminal, Loader2, Check,
    AlertCircle, Code2, Zap, Power, User, Trash2, MoreVertical, ExternalLink
} from "lucide-react";
import { TEMPLATE_REGISTRY } from "@/constants/extensions";
import Image from "next/image";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";

interface Project {
    id: string;
    name: string;
    path: string;
    gitRemote: string;
    hasPackageJson: boolean;
    starred: boolean;
    containerStatus?: "checking" | "running" | "stopped";
}

type PackageManager = "npm" | "pnpm" | "bun" | "yarn";
type Step = "source" | "setup" | "installing";
type Source = "git" | "template";

interface ConfirmDialogState {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
}

export default function Dashboard() {
    const { data: session } = useSession();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [projectFilter, setProjectFilter] = useState<"all" | "starred">("all");
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
        open: false, title: "", message: "", onConfirm: () => { }
    });

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch("/api/projects");
            const data = await res.json() as { projects: Project[] };

            // Default them to 'checking'
            const mapped = (data.projects ?? []).map(p => ({ ...p, containerStatus: "checking" as const }));
            setProjects(mapped);

            // Kickoff async status checks for Docker containers
            checkContainerStatuses();
        } catch {
            setProjects([]);
        } finally {
            setLoading(false);
        }
    }, []);
    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);


    const checkContainerStatuses = async () => {
        try {
            const res = await fetch("/api/workspace?action=statusAll");
            if (res.ok) {
                const { statuses } = await res.json();
                setProjects(prev => prev.map(p => ({
                    ...p,
                    containerStatus: statuses[p.id] === 'running' ? 'running' : 'stopped'
                })));
            }
        } catch {
            setProjects(prev => prev.map(p => ({ ...p, containerStatus: 'stopped' })));
        }
    }

    const stopContainer = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setProjects(prev => prev.map(p => p.id === id ? { ...p, containerStatus: 'checking' } : p));
        try {
            await fetch("/api/workspace", {
                method: "POST",
                body: JSON.stringify({ action: "stop", id })
            });
            setProjects(prev => prev.map(p => p.id === id ? { ...p, containerStatus: 'stopped' } : p));
        } catch (error) {
            console.error("Stop failed", error);
            checkContainerStatuses(); // Revert status visually
        }
    }

    const filtered = projects.filter((p) => {
        const matchesQuery = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter = projectFilter === "all" || (projectFilter === "starred" && p.starred);
        return matchesQuery && matchesFilter;
    });

    const toggleStar = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        // Optimistic local toggle (persisted in local state; no backend for starred field yet)
        setProjects(prev => prev.map(p => p.id === id ? { ...p, starred: !p.starred } : p));
    };

    const deleteProject = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        setConfirmDialog({
            open: true,
            title: "Delete Project",
            message: `Are you sure you want to delete "${name}"? This will permanently remove all project files and cannot be undone.`,
            confirmLabel: "Delete Project",
            danger: true,
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }));
                try {
                    const res = await fetch(`/api/projects?workspaceId=${encodeURIComponent(id)}`, { method: "DELETE" });
                    if (res.ok) {
                        setProjects(prev => prev.filter(p => p.id !== id));
                    } else {
                        const err = await res.json() as { error: string };
                        setConfirmDialog({
                            open: true,
                            title: "Delete Failed",
                            message: `Could not delete "${name}": ${err.error}`,
                            confirmLabel: "OK",
                            danger: false,
                            onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                        });
                    }
                } catch {
                    setConfirmDialog({
                        open: true,
                        title: "Delete Failed",
                        message: "An unexpected error occurred while deleting the project. Please try again.",
                        confirmLabel: "OK",
                        danger: false,
                        onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                    });
                }
            }
        });
    };

    const openProject = (project: Project) => {
        window.location.href = `/dashboard/booting?id=${encodeURIComponent(project.id)}`;
    };

    return (
        <div className="h-full bg-(--bg) flex flex-col overflow-hidden">
            {/* Top Nav */}
            <div className="h-14 border-b border-(--border-subtle) flex items-center justify-between px-8 shrink-0 bg-(--bg-2) shadow-sm z-10">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-(--accent) bg-opacity-10 flex items-center justify-center">
                        <Terminal size={18} className="text-(--accent-foreground)" />
                    </div>
                    <span className="text-(--text) font-semibold tracking-wide">CodeVerse <span className="font-light opacity-60">Studio</span></span>
                </div>
                <div className="flex items-center gap-4">
                    <DropdownMenu.Root>
                        <DropdownMenu.Trigger asChild>
                            <button className="relative p-2 text-(--text-muted) hover:text-(--text) transition-colors rounded-full hover:bg-(--surface-hover) outline-none cursor-pointer">
                                <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-(--warning) ring-2 ring-(--bg-2)" />
                                <span className="text-sm">🔔</span>
                            </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                            <DropdownMenu.Content className="z-50 min-w-[320px] bg-(--surface) border border-(--border) rounded-xl shadow-lg p-2 animate-fade-in" align="end" sideOffset={8}>
                                <div className="flex items-center justify-between px-2 py-2 border-b border-(--border-subtle) mb-2">
                                    <span className="text-sm font-semibold text-(--text)">Notifications</span>
                                    <button className="text-[11px] text-(--text-muted) hover:text-(--text) transition-colors">Mark all as read</button>
                                </div>
                                <div className="flex flex-col gap-1 p-8 items-center justify-center text-center">
                                    <div className="w-12 h-12 rounded-full bg-(--bg-2) flex items-center justify-center mb-2">
                                        <AlertCircle size={20} className="text-(--text-muted)" />
                                    </div>
                                    <span className="text-(--text) font-medium text-sm">You&apos;re all caught up!</span>
                                    <span className="text-(--text-muted) text-xs mt-1">No new notifications right now.</span>
                                </div>
                            </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                    <div className="h-4 w-px bg-(--border)" />
                    <div className="flex items-center gap-3 pl-1">
                        <div className="flex flex-col items-end">
                            <span className="text-sm font-semibold text-(--text) leading-tight">{session?.user?.name || "User"}</span>
                            <span className="text-[10px] text-(--text-muted) font-mono">{session?.user?.email || "anonymous@codeverse.io"}</span>
                        </div>
                        {session?.user?.image ? (
                            <Image unoptimized src={session.user.image} alt="Profile" width={36} height={36} className="w-9 h-9 rounded-full ring-2 ring-(--border-subtle)" />
                        ) : (
                            <div className="w-9 h-9 rounded-full ring-2 ring-(--border-subtle) bg-(--surface) flex items-center justify-center text-(--text-muted)">
                                <User size={16} />
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-hidden dashboard-grid">
                {/* Left Panel */}
                <div className="border-r border-(--border-subtle) flex flex-col overflow-y-auto p-6 gap-6">
                    {/* Greeting */}
                    <div>
                        <h1 className="text-2xl font-bold text-(--text)">
                            Hello, <span className="text-(--accent)">{session?.user?.name?.split(" ")[0] || "User"}</span>
                        </h1>
                        <p className="text-(--text-2) text-sm mt-1">Welcome back to CodeVerse Studio</p>
                    </div>

                    {/* Create New */}
                    <div>
                        <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest mb-3">Get Started</p>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="w-full flex items-center gap-4 p-4 rounded-xl border border-(--border) bg-(--surface) hover:border-(--accent) hover:bg-(--surface-hover) transition-all group text-left"
                        >
                            <div className="w-10 h-10 rounded-lg bg-(--accent) bg-opacity-10 flex items-center justify-center group-hover:bg-opacity-20 transition-all">
                                <Plus size={20} className="text-(--accent-foreground)" />
                            </div>
                            <div>
                                <p className="font-semibold text-(--text) text-sm">Create a new project</p>
                                <p className="text-(--text-muted) text-xs mt-0.5">Clone from Git or start from a template</p>
                            </div>
                        </button>
                    </div>

                    {/* Templates */}
                    <div>
                        <p className="text-xs font-semibold text-(--text-muted) uppercase tracking-widest mb-3">Try a template</p>
                        <div className="flex flex-col gap-2">
                            {TEMPLATE_REGISTRY.slice(0, 5).map((t) => (
                                <button
                                    key={t.id}
                                    onClick={() => setShowCreateModal(true)}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-(--border-subtle) bg-(--surface) hover:border-(--accent) transition-all text-left group"
                                >
                                    <span className="text-lg">{t.icon}</span>
                                    <div className="min-w-0">
                                        <p className="font-medium text-(--text) text-sm truncate">{t.name}</p>
                                        <p className="text-(--text-muted) text-xs truncate">{t.description.slice(0, 55)}…</p>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Panel */}
                <div className="flex flex-col overflow-hidden">
                    {/* Search + Filter */}
                    <div className="p-4 border-b border-(--border-subtle) flex items-center gap-3">
                        <div className="relative flex-1 px-2 input">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted) pointer-events-none" />
                            <input
                                className="border-0 w-full px-9 py-2 text-sm focus-visible:outline-none"
                                placeholder="Search all projects and workspaces"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <DropdownMenu.Root>
                            <DropdownMenu.Trigger asChild>
                                <button className="btn btn-secondary py-2 gap-1 text-xs outline-none cursor-pointer">
                                    {projectFilter === "all" ? <FolderOpen size={13} /> : <Star size={13} className="text-(--warning)" />}
                                    {projectFilter === "all" ? "All Projects" : "Starred"}
                                    <ChevronDown size={12} className="ml-1 text-(--text-muted)" />
                                </button>
                            </DropdownMenu.Trigger>
                            <DropdownMenu.Portal>
                                <DropdownMenu.Content className="z-50 min-w-[180px] bg-(--surface) border border-(--border) rounded-xl shadow-lg p-1 animate-fade-in" align="end" sideOffset={8}>
                                    <DropdownMenu.Item
                                        onClick={() => setProjectFilter("all")}
                                        className="text-sm px-3 py-2 text-(--text) hover:bg-(--surface-hover) hover:text-(--accent) outline-none cursor-pointer rounded-lg flex items-center justify-between group transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <FolderOpen size={14} className="text-(--text-muted) group-hover:text-(--accent) transition-colors" />
                                            All Projects
                                        </div>
                                        {projectFilter === "all" && <Check size={14} className="text-(--accent)" />}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                        onClick={() => setProjectFilter("starred")}
                                        className="text-sm px-3 py-2 text-(--text) hover:bg-(--surface-hover) hover:text-(--warning) outline-none cursor-pointer rounded-lg flex items-center justify-between group transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Star size={14} className="text-(--text-muted) group-hover:text-(--warning) transition-colors" />
                                            Starred
                                        </div>
                                        {projectFilter === "starred" && <Check size={14} className="text-(--warning)" />}
                                    </DropdownMenu.Item>
                                </DropdownMenu.Content>
                            </DropdownMenu.Portal>
                        </DropdownMenu.Root>
                    </div>

                    {/* Project List */}
                    <div className="flex-1 overflow-y-auto p-2">
                        {loading ? (
                            <div className="flex flex-col gap-2 p-2">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="skeleton h-14 rounded-lg" />
                                ))}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-4">
                                <div className="w-16 h-16 rounded-2xl bg-(--bg-2) flex items-center justify-center">
                                    <Code2 size={28} className="text-(--text-muted)" />
                                </div>
                                <div>
                                    <p className="text-(--text) font-medium">No projects yet</p>
                                    <p className="text-(--text-muted) text-sm mt-1">Create your first project to get started</p>
                                </div>
                                <button onClick={() => setShowCreateModal(true)} className="btn btn-primary text-sm">
                                    <Plus size={15} /> Create Project
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 p-2 pb-8">
                                {filtered.map((project) => (
                                    <motion.div
                                        key={project.id}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        onClick={() => openProject(project)}
                                        className="relative flex flex-col p-5 rounded-2xl border border-(--border-subtle) bg-(--surface) hover:border-(--accent) shadow-sm hover:shadow-md transition-all text-left group cursor-pointer overflow-hidden isolate"
                                    >
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-(--accent) opacity-[0.03] rounded-bl-full -z-10 group-hover:opacity-[0.06] transition-all" />

                                        <div className="flex justify-between items-start mb-4">
                                            <div className="w-10 h-10 rounded-xl bg-[rgba(57,211,83,0.1)] flex items-center justify-center shrink-0 border border-[rgba(57,211,83,0.15)] shadow-sm group-hover:scale-110 transition-transform">
                                                <FolderOpen size={18} className="text-(--accent)" />
                                            </div>

                                            <DropdownMenu.Root>
                                                <DropdownMenu.Trigger asChild>
                                                    <button
                                                        className="p-1.5 opacity-0 group-hover:opacity-100 transition-all rounded-md hover:bg-(--bg-3) text-(--text-muted) hover:text-(--text) -mt-1 -mr-1 z-20 outline-none"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <MoreVertical size={14} />
                                                    </button>
                                                </DropdownMenu.Trigger>
                                                <DropdownMenu.Portal>
                                                    <DropdownMenu.Content
                                                        className="z-50 min-w-[160px] bg-(--surface) border border-(--border) rounded-xl shadow-xl p-1 animate-fade-in"
                                                        align="end"
                                                        sideOffset={4}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <DropdownMenu.Item
                                                            onClick={(e) => { e.stopPropagation(); openProject(project); }}
                                                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg text-(--text) hover:bg-(--surface-hover) hover:text-(--accent) outline-none cursor-pointer transition-colors"
                                                        >
                                                            <ExternalLink size={13} /> Open
                                                        </DropdownMenu.Item>
                                                        <DropdownMenu.Item
                                                            onClick={(e) => toggleStar(e, project.id)}
                                                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg text-(--text) hover:bg-(--surface-hover) hover:text-(--warning) outline-none cursor-pointer transition-colors"
                                                        >
                                                            <Star size={13} className={project.starred ? "text-(--warning) fill-(--warning)" : ""} />
                                                            {project.starred ? "Unstar" : "Star"}
                                                        </DropdownMenu.Item>
                                                        <DropdownMenu.Separator className="h-px bg-(--border-subtle) my-1" />
                                                        <DropdownMenu.Item
                                                            onClick={(e) => deleteProject(e, project.id, project.name)}
                                                            className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg text-(--error) hover:bg-[rgba(248,81,73,0.1)] outline-none cursor-pointer transition-colors"
                                                        >
                                                            <Trash2 size={13} /> Delete Project
                                                        </DropdownMenu.Item>
                                                    </DropdownMenu.Content>
                                                </DropdownMenu.Portal>
                                            </DropdownMenu.Root>
                                        </div>

                                        <div className="flex-1 min-w-0 mb-4">
                                            <p className="font-semibold text-(--text) text-base truncate pr-2 group-hover:text-(--accent) transition-colors">
                                                {project.name}
                                            </p>
                                            <p className="text-(--text-muted) text-[11px] truncate mt-1">
                                                ID: {project.id.slice(0, 8)}...
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 mt-auto shrink-0 z-10">
                                            {/* Docker Container Status Badge */}
                                            {project.containerStatus === 'running' && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[rgba(57,211,83,0.1)] border border-[rgba(57,211,83,0.2)] text-(--success) text-[11px] font-medium font-mono lowercase dropdown-container">
                                                    <span className="relative flex h-1.5 w-1.5">
                                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-(--success) opacity-75"></span>
                                                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-(--success)"></span>
                                                    </span>
                                                    Active
                                                    <button
                                                        onClick={(e) => stopContainer(e, project.id)}
                                                        title="Stop Container"
                                                        className="ml-1 p-0.5 hover:bg-(--success) hover:text-white rounded-md transition-colors isolate -mr-0.5"
                                                    >
                                                        <Power size={11} />
                                                    </button>
                                                </div>
                                            )}
                                            {project.containerStatus === 'stopped' && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--surface-hover) border border-(--border-subtle) text-(--text-muted) text-[11px] font-medium font-mono lowercase">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-(--text-muted) opacity-50" />
                                                    Stopped
                                                </div>
                                            )}
                                            {project.containerStatus === 'checking' && (
                                                <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-(--surface-hover) border border-(--border-subtle) text-(--text-muted) text-[11px] font-medium font-mono lowercase">
                                                    <Loader2 size={11} className="animate-spin" />
                                                    Checking
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Create Project Modal */}
            <AnimatePresence>
                {showCreateModal && (
                    <CreateProjectModal
                        onClose={() => setShowCreateModal(false)}
                        onCreated={() => { setShowCreateModal(false); fetchProjects(); }}
                    />
                )}
            </AnimatePresence>

            {/* Custom Confirm / Alert Dialog */}
            <AnimatePresence>
                {confirmDialog.open && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-10001 flex items-center justify-center p-4"
                        style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)" }}
                        onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                    >
                        <motion.div
                            initial={{ scale: 0.94, y: 16 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.94, y: 16 }}
                            transition={{ type: "spring", stiffness: 280, damping: 22 }}
                            className="w-full max-w-md bg-(--surface) border border-(--border) rounded-2xl shadow-2xl overflow-hidden"
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Dialog Header */}
                            <div className="flex items-center justify-between px-6 pt-6 pb-3">
                                <div className="flex items-center gap-3">
                                    {confirmDialog.danger ? (
                                        <div className="w-9 h-9 rounded-xl bg-[rgba(248,81,73,0.12)] flex items-center justify-center shrink-0">
                                            <Trash2 size={16} className="text-(--error)" />
                                        </div>
                                    ) : (
                                        <div className="w-9 h-9 rounded-xl bg-[rgba(88,166,255,0.12)] flex items-center justify-center shrink-0">
                                            <AlertCircle size={16} className="text-(--info)" />
                                        </div>
                                    )}
                                    <h2 className="text-base font-bold text-(--text)">{confirmDialog.title}</h2>
                                </div>
                                <button
                                    onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                                    className="p-1.5 rounded-lg text-(--text-muted) hover:text-(--text) hover:bg-(--surface-hover) transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Divider */}
                            <div className="h-px bg-(--border-subtle) mx-6" />

                            {/* Dialog Body */}
                            <div className="px-6 py-5">
                                <p className="text-sm text-(--text-2) leading-relaxed">{confirmDialog.message}</p>
                            </div>

                            {/* Dialog Footer */}
                            <div className="flex items-center justify-end gap-3 px-6 pb-6">
                                {confirmDialog.danger && (
                                    <button
                                        onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
                                        className="btn btn-secondary"
                                    >
                                        Cancel
                                    </button>
                                )}
                                <button
                                    onClick={confirmDialog.onConfirm}
                                    className={`btn ${confirmDialog.danger
                                            ? "bg-[rgba(248,81,73,0.15)] hover:bg-[rgba(248,81,73,0.25)] text-(--error) border border-[rgba(248,81,73,0.3)] hover:border-[rgba(248,81,73,0.5)]"
                                            : "btn-primary"
                                        }`}
                                >
                                    {confirmDialog.danger && <Trash2 size={13} />}
                                    {confirmDialog.confirmLabel ?? "Confirm"}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

function CreateProjectModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: (projectPath: string) => void;
}) {
    const [step, setStep] = useState<Step>("source");
    const [source, setSource] = useState<Source>("git");
    const [projectName, setProjectName] = useState("");
    const [repoUrl, setRepoUrl] = useState("");
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
    const [pm, setPm] = useState<PackageManager>("npm");
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
    const [projectPath, setProjectPath] = useState("");
    const logRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logRef.current) {
            logRef.current.scrollTop = logRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

    const startCreation = async () => {
        if (!projectName.trim()) return;
        setStep("installing");
        setStatus("running");
        setLogs([]);

        const action = source === "git" ? "clone" : "scaffold";
        const body =
            source === "git"
                ? { repoUrl, projectName }
                : { templateId: selectedTemplate, projectName, packageManager: pm };

        try {
            const res = await fetch(`/api/projects?action=${action}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value);
                const lines = text.split("\n").filter((l) => l.startsWith("data: "));
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line.replace("data: ", "")) as {
                            type: string;
                            message?: string;
                            projectPath?: string;
                            projectName?: string;
                        };
                        if (event.message) addLog(event.message);
                        if (event.type === "done") {
                            setProjectPath(event.projectPath ?? "");
                            // Run install if scaffolding
                            if (source === "template") {
                                await runInstall(event.projectPath ?? "");
                            } else {
                                setStatus("done");
                            }
                        }
                        if (event.type === "error") {
                            setStatus("error");
                        }
                    } catch { }
                }
            }
        } catch (e) {
            addLog(`Error: ${String(e)}`);
            setStatus("error");
        }
    };

    const runInstall = async (pPath: string) => {
        addLog(`\nRunning ${pm} install…`);
        try {
            const res = await fetch("/api/projects?action=install", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ projectPath: pPath, packageManager: pm }),
            });

            const reader = res.body!.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const text = decoder.decode(value);
                const lines = text.split("\n").filter((l) => l.startsWith("data: "));
                for (const line of lines) {
                    try {
                        const event = JSON.parse(line.replace("data: ", "")) as { type: string; message?: string };
                        if (event.message) addLog(event.message);
                        if (event.type === "done") setStatus("done");
                        if (event.type === "error") setStatus("error");
                    } catch { }
                }
            }
        } catch (e) {
            addLog(`Install error: ${String(e)}`);
            setStatus("error");
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay"
            onClick={(e) => e.target === e.currentTarget && onClose()}
        >
            <motion.div
                initial={{ scale: 0.95, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 20 }}
                className="modal"
                style={{ width: "min(600px, 95vw)" }}
            >
                {/* Header */}
                <div className="modal-header">
                    <div>
                        <h2 className="text-base font-bold text-(--text)">
                            {step === "source"
                                ? "Create new project"
                                : step === "setup"
                                    ? "Configure project"
                                    : "Setting up your project…"}
                        </h2>
                        {step === "source" && (
                            <p className="text-xs text-(--text-muted) mt-0.5">Clone a repository or start from a template</p>
                        )}
                    </div>
                    <button onClick={onClose} className="activity-btn">
                        <X size={16} />
                    </button>
                </div>

                <div className="modal-body">
                    {/* Step 1 – Source */}
                    {step === "source" && (
                        <div className="flex flex-col gap-5">
                            {/* Source Toggle */}
                            <div className="flex rounded-lg border border-(--border) overflow-hidden">
                                <button
                                    onClick={() => setSource("git")}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${source === "git" ? "bg-(--accent) text-(--text-on-accent)" : "bg-transparent text-(--text-2) hover:bg-(--surface-hover)"}`}
                                >
                                    <Globe size={14} /> From Git
                                </button>
                                <button
                                    onClick={() => setSource("template")}
                                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-all ${source === "template" ? "bg-(--accent) text-(--text-on-accent)" : "bg-transparent text-(--text-2) hover:bg-(--surface-hover)"}`}
                                >
                                    <LayoutTemplate size={14} /> From Template
                                </button>
                            </div>

                            {/* Project Name */}
                            <div>
                                <label className="text-xs text-(--text-2) mb-1.5 block font-medium">Project Name</label>
                                <input
                                    className="input"
                                    placeholder="my-awesome-project"
                                    value={projectName}
                                    onChange={(e) => setProjectName(e.target.value.toLowerCase().replace(/\s/g, "-"))}
                                />
                            </div>

                            {source === "git" ? (
                                <div>
                                    <label className="text-xs text-(--text-2) mb-1.5 block font-medium">Repository URL</label>
                                    <input
                                        className="input"
                                        placeholder="https://github.com/user/repo.git"
                                        value={repoUrl}
                                        onChange={(e) => setRepoUrl(e.target.value)}
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="text-xs text-(--text-2) mb-1.5 block font-medium">Template</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {TEMPLATE_REGISTRY.map((t) => (
                                            <button
                                                key={t.id}
                                                onClick={() => setSelectedTemplate(t.id)}
                                                className={`flex items-center gap-2 p-3 rounded-lg border text-left transition-all ${selectedTemplate === t.id ? "border-(--accent) bg-[rgba(57,211,83,0.08)]" : "border-(--border) hover:border-(--accent) bg-(--surface)"}`}
                                            >
                                                <span className="text-xl">{t.icon}</span>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-xs text-(--text) truncate">{t.name}</p>
                                                    <div className="flex flex-wrap gap-1 mt-1">
                                                        {t.stack.slice(0, 2).map((s) => (
                                                            <span key={s} className="badge badge-info text-[9px]">{s}</span>
                                                        ))}
                                                    </div>
                                                </div>
                                                {selectedTemplate === t.id && (
                                                    <Check size={14} className="text-(--accent) ml-auto shrink-0" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={() => setStep("setup")}
                                disabled={!projectName || (source === "git" ? !repoUrl : !selectedTemplate)}
                                className="btn btn-primary w-full justify-center"
                            >
                                Continue
                            </button>
                        </div>
                    )}

                    {/* Step 2 – Package Manager */}
                    {step === "setup" && (
                        <div className="flex flex-col gap-5">
                            <div>
                                <label className="text-xs text-(--text-2) mb-2 block font-medium">Package Manager</label>
                                <div className="grid grid-cols-4 gap-2">
                                    {(["npm", "pnpm", "bun", "yarn"] as PackageManager[]).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPm(p)}
                                            className={`py-3 rounded-lg border text-sm font-medium transition-all ${pm === p ? "border-(--accent) bg-[rgba(57,211,83,0.08)] text-(--accent)" : "border-(--border) text-(--text-2) hover:border-(--accent)"}`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-lg bg-(--bg-2) border border-(--border-subtle) p-3">
                                <p className="text-xs text-(--text-muted) mb-1">Summary</p>
                                <p className="text-sm text-(--text)">
                                    <span className="text-(--accent) font-medium">{projectName}</span>
                                    {" "}via{" "}
                                    {source === "git" ? (
                                        <><Globe size={11} className="inline" /> {repoUrl}</>
                                    ) : (
                                        <><LayoutTemplate size={11} className="inline" /> {selectedTemplate}</>
                                    )}
                                </p>
                            </div>

                            <div className="flex gap-2">
                                <button onClick={() => setStep("source")} className="btn btn-secondary flex-1 justify-center">Back</button>
                                <button onClick={startCreation} className="btn btn-primary flex-1 justify-center">
                                    <Zap size={14} /> Create Project
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Step 3 – Installing */}
                    {step === "installing" && (
                        <div className="flex flex-col gap-4">
                            {/* Status */}
                            <div className="flex items-center gap-3">
                                {status === "running" && <Loader2 size={18} className="animate-spin text-(--accent)" />}
                                {status === "done" && <Check size={18} className="text-(--success)" />}
                                {status === "error" && <AlertCircle size={18} className="text-(--error)" />}
                                <div>
                                    <p className="text-sm font-medium text-(--text)">
                                        {status === "running" && "Setting up your project…"}
                                        {status === "done" && "Project ready!"}
                                        {status === "error" && "Something went wrong"}
                                    </p>
                                    <p className="text-xs text-(--text-muted)">{projectName}</p>
                                </div>
                            </div>

                            {/* Log terminal */}
                            <div
                                ref={logRef}
                                className="bg-(--terminal-bg) rounded-lg p-3 h-48 overflow-y-auto font-mono text-xs text-(--terminal-fg) border border-(--border-subtle)"
                            >
                                {logs.map((l, i) => (
                                    <div key={i} className="leading-5 whitespace-pre-wrap break-all">{l}</div>
                                ))}
                                {status === "running" && (
                                    <div className="inline-block w-2 h-3 bg-(--terminal-cursor) animate-pulse-accent ml-0.5" />
                                )}
                            </div>

                            {/* Actions */}
                            {status === "done" && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => { onCreated(projectPath); }}
                                        className="btn btn-primary flex-1 justify-center"
                                    >
                                        <Code2 size={14} /> Open in Editor
                                    </button>
                                    <button onClick={onClose} className="btn btn-secondary">
                                        Later
                                    </button>
                                </div>
                            )}
                            {status === "error" && (
                                <button onClick={() => { setStep("source"); setStatus("idle"); }} className="btn btn-secondary w-full justify-center">
                                    Try Again
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </motion.div>
    );
}
