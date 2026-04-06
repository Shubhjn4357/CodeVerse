import { EventEmitter } from 'events';

/**
 * WorkspaceBus: Orchestrator for Multi-Agent Tooling & MCP Collaboration.
 * Standardized in 2026 for high-performance intra-workspace communication.
 */
export interface MCPTool<T = unknown, R = unknown> {
    name: string;
    description: string;
    schema: Record<string, unknown>; 
    handler: (args: T) => Promise<R>;
}

export class WorkspaceBus extends EventEmitter {
    private static instance: WorkspaceBus;
    private tools: Map<string, MCPTool<unknown, unknown>> = new Map();

    private constructor() {
        super();
        this.setMaxListeners(100);
    }

    public static getInstance(): WorkspaceBus {
        if (!WorkspaceBus.instance) {
            WorkspaceBus.instance = new WorkspaceBus();
        }
        return WorkspaceBus.instance;
    }

    /**
     * Registers a new tool in the global workspace registry.
     */
    public registerTool<T, R>(tool: MCPTool<T, R>): void {
        this.tools.set(tool.name, tool as MCPTool<unknown, unknown>);
        this.emit('tool:registered', tool.name);
        console.log(`[WORKSPACE-BUS] Registered tool: ${tool.name}`);
    }

    /**
     * Discovers all available tools for a given workspace context.
     */
    public getAvailableTools(): MCPTool<unknown, unknown>[] {
        return Array.from(this.tools.values());
    }

    /**
     * Dispatches a tool execution request across the bus.
     */
    public async callTool<T, R>(name: string, args: T): Promise<R> {
        const tool = this.tools.get(name);
        if (!tool) throw new Error(`Tool '${name}' not found on the WorkspaceBus.`);
        
        try {
            this.emit('tool:call', { name, args });
            const result = await (tool.handler as (args: T) => Promise<R>)(args);
            this.emit('tool:result', { name, result });
            return result;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.emit('tool:error', { name, error: message });
            throw error;
        }
    }
}

export const workspaceBus = WorkspaceBus.getInstance();
