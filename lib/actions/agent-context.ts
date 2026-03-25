"use server";

import fs from "fs/promises";
import path from "path";

const WORKSPACE_ROOT = process.cwd();

/**
 * Looks for .agent directories in:
 * 1. The project's own .agent folder (codeverse/.agent)
 * 2. The parent workspace-level .Agent folder (e.g. d:\Code\.Agent)
 *
 * Returns merged context: memory, active tasks, and guidance files.
 */
export async function loadAgentContext(): Promise<{
    sessionMemory: string;
    activeTasks: string;
    guidance: string;
    usageReport: string;
}> {
    const results = {
        sessionMemory: "",
        activeTasks: "",
        guidance: "",
        usageReport: "",
    };

    // Try local .agent (lowercase) then parent-level .Agent
    const candidates = [
        path.join(WORKSPACE_ROOT, ".agent", "memory"),
        path.join(WORKSPACE_ROOT, ".agent"),
        path.join(path.dirname(WORKSPACE_ROOT), ".Agent", "memory"),
        path.join(path.dirname(WORKSPACE_ROOT), ".Agent"),
    ];

    for (const dir of candidates) {
        try {
            await fs.access(dir);

            // Load session.json
            try {
                const raw = await fs.readFile(path.join(dir, "session.json"), "utf-8");
                const data = JSON.parse(raw);
                results.sessionMemory = JSON.stringify(data, null, 2).slice(0, 4000);
            } catch { }

            // Load tasks.json
            try {
                const raw = await fs.readFile(path.join(dir, "tasks.json"), "utf-8");
                const data = JSON.parse(raw);
                const recent = (data.tasks ?? []).slice(0, 5);
                results.activeTasks = JSON.stringify(recent, null, 2).slice(0, 3000);
            } catch { }

            // Load usage-tracker.json
            try {
                const raw = await fs.readFile(path.join(dir, "usage-tracker.json"), "utf-8");
                const data = JSON.parse(raw);
                if (data.totals) {
                    results.usageReport = JSON.stringify(data.totals, null, 2).slice(0, 2000);
                }
            } catch { }

            break; // Use first valid agent dir
        } catch { }
    }

    // Load guidance from .agent markdown files (AGENT_MEMORY.md, MEMORY_PROTOCOL.md)
    const guidanceDirs = [
        path.join(WORKSPACE_ROOT, ".agent"),
        path.join(path.dirname(WORKSPACE_ROOT), ".Agent"),
    ];

    const guidanceParts: string[] = [];
    for (const dir of guidanceDirs) {
        const guideFiles = ["AGENT_MEMORY.md", "MEMORY_PROTOCOL.md", "README.md"];
        for (const gf of guideFiles) {
            try {
                const p = path.join(dir, gf);
                const raw = await fs.readFile(p, "utf-8");
                guidanceParts.push(`## ${gf}\n${raw.slice(0, 1500)}`);
            } catch { }
        }
        if (guidanceParts.length > 0) break;
    }

    results.guidance = guidanceParts.join("\n\n").slice(0, 6000);

    return results;
}

/**
 * Builds a full system prompt embedding the .agent context for agent inference
 */
export async function buildAgentSystemPrompt(agentName: string = "codeverse_ui"): Promise<string> {
    const ctx = await loadAgentContext();

    const parts = [
        `Agent: ${agentName}`,
        "You are CodeVerse, an elite agentic IDE assistant embedded in the workspace.",
        "You have access to the filesystem, git, terminal, browser automation, and search.",
        "",
    ];

    if (ctx.guidance) {
        parts.push("## Agent Guidance (from .agent/AGENT_MEMORY.md)");
        parts.push(ctx.guidance);
        parts.push("");
    }

    if (ctx.activeTasks) {
        parts.push("## Recent Tasks (from .agent/memory/tasks.json)");
        parts.push(ctx.activeTasks);
        parts.push("");
    }

    if (ctx.sessionMemory) {
        parts.push("## Session Memory");
        parts.push(ctx.sessionMemory);
        parts.push("");
    }

    if (ctx.usageReport) {
        parts.push("## Token Usage Summary");
        parts.push(ctx.usageReport);
        parts.push("");
    }

    parts.push("Always follow the agent rules from AGENT_MEMORY.md when making code changes.");
    parts.push("Think step-by-step and write real, production-grade code. No placeholders.");

    return parts.join("\n");
}
