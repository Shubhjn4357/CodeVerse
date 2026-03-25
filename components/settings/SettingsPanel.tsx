"use client";

import { useState} from "react";
import {
    Code, Terminal, Palette,
    Key, GitBranch, Database,Save,
    ToggleLeft, ToggleRight, Eye, EyeOff, LucideIcon
} from "lucide-react";
import { toast } from "sonner";

interface Setting {
    id: string;
    label: string;
    description: string;
    type: "toggle" | "select" | "number" | "text" | "password";
    options?: { value: string; label: string }[];
    defaultValue: string | number | boolean;
}
interface SettingSection {
    id: string;
    label: string;
    icon: LucideIcon;
    settings: Setting[];
}
const SETTINGS_SECTIONS: SettingSection[] = [
    {
        id: "editor",
        label: "Editor",
        icon: Code,
        settings: [
            { id: "editor.fontSize", label: "Font Size", description: "Controls the font size in pixels", type: "number" as const, defaultValue: 14 },
            { id: "editor.fontFamily", label: "Font Family", description: "The font family for the editor", type: "text" as const, defaultValue: "JetBrains Mono, monospace" },
            { id: "editor.tabSize", label: "Tab Size", description: "Number of spaces per indent", type: "number" as const, defaultValue: 2 },
            { id: "editor.wordWrap", label: "Word Wrap", description: "Wrap long lines", type: "toggle" as const, defaultValue: false },
            { id: "editor.minimap", label: "Minimap", description: "Show minimap scrollbar", type: "toggle" as const, defaultValue: true },
            { id: "editor.lineNumbers", label: "Line Numbers", description: "Show line numbers", type: "select" as const, options: [{ value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "relative", label: "Relative" }], defaultValue: "on" },
            { id: "editor.stickyScroll", label: "Sticky Scroll", description: "Stick nested scopes to top of editor", type: "toggle" as const, defaultValue: true },
            { id: "editor.bracketPairs", label: "Bracket Pair Colorization", description: "Colorize matching brackets", type: "toggle" as const, defaultValue: true },
            { id: "editor.inlayHints", label: "Inlay Hints", description: "Show inline type and parameter hints", type: "toggle" as const, defaultValue: true },
            { id: "editor.formatOnSave", label: "Format on Save", description: "Auto-format on save with Prettier", type: "toggle" as const, defaultValue: true },
        ],
    },
    {
        id: "terminal",
        label: "Terminal",
        icon: Terminal,
        settings: [
            { id: "terminal.shell", label: "Shell", description: "Path to default shell", type: "text" as const, defaultValue: "" },
            { id: "terminal.fontSize", label: "Font Size", description: "Font size in the terminal", type: "number" as const, defaultValue: 13 },
            { id: "terminal.cursorStyle", label: "Cursor Style", description: "Shape of the terminal cursor", type: "select" as const, options: [{ value: "block", label: "Block" }, { value: "underline", label: "Underline" }, { value: "bar", label: "Bar" }], defaultValue: "block" },
            { id: "terminal.copyOnSelect", label: "Copy on Select", description: "Automatically copy selected text", type: "toggle" as const, defaultValue: false },
        ],
    },
    {
        id: "theme",
        label: "Theme",
        icon: Palette,
        settings: [
            { id: "theme.colorTheme", label: "Color Theme", description: "Overall IDE color theme", type: "select" as const, options: [{ value: "dark", label: "Dark (Slim Green)" }, { value: "light", label: "Light (Coffee)" }], defaultValue: "dark" },
            { id: "theme.iconTheme", label: "Icon Theme", description: "File icon theme", type: "select" as const, options: [{ value: "vscode-icons", label: "VS Code Icons" }], defaultValue: "vscode-icons" },
        ],
    },
    {
        id: "ai-keys",
        label: "AI API Keys",
        icon: Key,
        settings: [
            { id: "apikey.openai", label: "OpenAI API Key", description: "sk-… (GPT-4o, GPT-4)", type: "password" as const, defaultValue: "" },
            { id: "apikey.anthropic", label: "Anthropic API Key", description: "sk-ant-… (Claude)", type: "password" as const, defaultValue: "" },
            { id: "apikey.google", label: "Google AI Key", description: "AIza… (Gemini)", type: "password" as const, defaultValue: "" },
            { id: "apikey.mistral", label: "Mistral API Key", description: "(Mistral AI)", type: "password" as const, defaultValue: "" },
        ],
    },
    {
        id: "git",
        label: "Git",
        icon: GitBranch,
        settings: [
            { id: "git.userName", label: "User Name", description: "Git commit author name", type: "text" as const, defaultValue: "" },
            { id: "git.userEmail", label: "User Email", description: "Git commit author email", type: "text" as const, defaultValue: "" },
            { id: "git.defaultBranch", label: "Default Branch", description: "Name for the default branch", type: "text" as const, defaultValue: "main" },
            { id: "git.autofetch", label: "Auto Fetch", description: "Automatically fetch from remotes", type: "toggle" as const, defaultValue: true },
        ],
    },
    {
        id: "database",
        label: "Database (Turso)",
        icon: Database,
        settings: [
            { id: "turso.url", label: "Turso Database URL", description: "libsql://… connection string", type: "text" as const, defaultValue: "" },
            { id: "turso.token", label: "Turso Auth Token", description: "Authentication token", type: "password" as const, defaultValue: "" },
        ],
    },
];

export default function SettingsPanel() {
    const [activeSection, setActiveSection] = useState("editor");
    const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
        const all: Record<string, string | number | boolean> = {};
        SETTINGS_SECTIONS.forEach((s) =>
            s.settings.forEach((setting) => { all[setting.id] = setting.defaultValue; })
        );
        if (typeof window !== "undefined") {
            try {
                const stored = localStorage.getItem("codeverse_settings");
                if (stored) return { ...all, ...JSON.parse(stored) };
            } catch { }
        }
        return all;
    });
    const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

    const save = async () => {
        localStorage.setItem("codeverse_settings", JSON.stringify(values));
        // Apply theme
        if (values["theme.colorTheme"]) {
            document.documentElement.setAttribute("data-theme", values["theme.colorTheme"] as string);
        }
        toast.success("Settings saved");
    };

    const section = SETTINGS_SECTIONS.find((s) => s.id === activeSection)!;

    return (
        <div className="sidebar h-full flex flex-col overflow-hidden" style={{ width: "100%" }}>
            <div className="sidebar-header">
                <span>Settings</span>
                <button onClick={save} className="activity-btn w-6 h-6 text-(--accent)" title="Save settings">
                    <Save size={12} />
                </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Nav */}
                <div className="w-28 shrink-0 border-r border-(--border-subtle) py-2 overflow-y-auto flex flex-col gap-0.5">
                    {SETTINGS_SECTIONS.map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setActiveSection(s.id)}
                            className={`flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-medium rounded mx-1 transition-all ${activeSection === s.id ? "bg-(--bg-3) text-(--accent)" : "text-(--text-2) hover:bg-(--surface-hover)"}`}
                        >
                            <s.icon size={11} />
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                    {section.settings.map((setting) => (
                        <div key={setting.id} className="flex flex-col gap-1.5">
                            <div>
                                <p className="text-xs font-medium text-(--text)">{setting.label}</p>
                                <p className="text-[10px] text-(--text-muted)">{setting.description}</p>
                            </div>

                            {setting.type === "toggle" && (
                                <button
                                    onClick={() => setValues((v) => ({ ...v, [setting.id]: !v[setting.id] }))}
                                    className={`flex items-center gap-1.5 text-xs ${values[setting.id] ? "text-(--accent)" : "text-(--text-muted)"}`}
                                >
                                    {values[setting.id] ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                    {values[setting.id] ? "Enabled" : "Disabled"}
                                </button>
                            )}

                            {setting.type === "select" && (
                                <select
                                    className="input text-xs py-1.5"
                                    value={values[setting.id] as string}
                                    onChange={(e) => setValues((v) => ({ ...v, [setting.id]: e.target.value }))}
                                >
                                    {setting.options?.map((o) => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            )}

                            {setting.type === "number" && (
                                <input
                                    type="number"
                                    className="input text-xs py-1.5"
                                    value={values[setting.id] as number}
                                    onChange={(e) => setValues((v) => ({ ...v, [setting.id]: Number(e.target.value) }))}
                                />
                            )}

                            {(setting.type === "text") && (
                                <input
                                    type="text"
                                    className="input text-xs py-1.5 font-mono"
                                    value={values[setting.id] as string}
                                    onChange={(e) => setValues((v) => ({ ...v, [setting.id]: e.target.value }))}
                                />
                            )}

                            {setting.type === "password" && (
                                <div className="relative">
                                    <input
                                        type={showPasswords[setting.id] ? "text" : "password"}
                                        className="input text-xs py-1.5 font-mono pr-8"
                                        value={values[setting.id] as string}
                                        onChange={(e) => setValues((v) => ({ ...v, [setting.id]: e.target.value }))}
                                        placeholder="Paste key here…"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswords((p) => ({ ...p, [setting.id]: !p[setting.id] }))}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text)"
                                    >
                                        {showPasswords[setting.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}

                    <button onClick={save} className="btn btn-primary text-xs mt-2">
                        <Save size={12} /> Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
}
