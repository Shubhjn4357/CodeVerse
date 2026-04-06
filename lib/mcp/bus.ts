import { createTools } from "./tools";
import type { ToolSet } from "ai";

/**
 * Model Context Protocol (MCP) Workspace Bus.
 * Orchestrates multi-agent tool sharing across isolated CodeVerse environments.
 */
export class WorkspaceBus {
    private static activeToolsets = new Map<string, ToolSet>();

    /**
     * Registers a workspace toolset on the shared collaboration bus.
     */
    static register(id: string, userId: string, workspaceName: string): ToolSet {
        if (this.activeToolsets.has(id)) {
            return this.activeToolsets.get(id)!;
        }

        const tools = createTools(userId, workspaceName);
        this.activeToolsets.set(id, tools);
        return tools;
    }

    /**
     * Retrieves a toolset for a specific workspace context.
     * Enables agents to "switch" between environments during complex multi-phase tasks.
     */
    static getToolset(id: string): ToolSet | undefined {
        return this.activeToolsets.get(id);
    }

    /**
     * Lists all currently active workspace identities on the bus.
     */
    static listActiveWorkspaces(): string[] {
        return Array.from(this.activeToolsets.keys());
    }
}
