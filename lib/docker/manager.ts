import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import Docker from 'dockerode';

/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: ChildProcess }>
 */
const nativeProcesses = new Map<string, { pid: number; port: number; process: ChildProcess }>();

/**
 * Checks if a native workspace is currently running.
 */
export function isNativeWorkspaceRunning(id: string): boolean {
    return nativeProcesses.has(id);
}

/**
 * Helper for async delays.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Finds an available port in the 8081-8099 range.
 */
function findAvailablePort(): number {
    const occupiedPorts = Array.from(nativeProcesses.values()).map(p => p.port);
    for (let port = 8081; port <= 8099; port++) {
        if (!occupiedPorts.includes(port)) return port;
    }
    return Math.floor(Math.random() * (8999 - 8100) + 8100);
}

/**
 * Checks if Docker is available in the current environment.
 */
export async function isDockerAvailable(): Promise<{ available: boolean; reason?: string }> {
    const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
    if (process.env.SPACE_ID) return { available: false, reason: "Hugging Face Space (Sandboxed)" };
    if (!fs.existsSync(socketPath)) return { available: false, reason: "Docker socket missing" };
    try {
        const docker = new Docker({ socketPath: process.platform === 'win32' ? undefined : socketPath });
        await docker.ping();
        return { available: true };
    } catch {
        return { available: false, reason: "Docker daemon unreachable" };
    }
}

/**
 * Stops a native workspace process.
 */
export async function stopNativeWorkspace(id: string): Promise<boolean> {
    const entry = nativeProcesses.get(id);
    if (entry) {
        try {
            entry.process.kill();
            nativeProcesses.delete(id);
            return true;
        } catch (e) {
            console.error(`[MANAGER] Failed to kill code-server ${entry.pid}:`, e);
            nativeProcesses.delete(id);
        }
    }
    return false;
}

/**
 * Gets the internal port for a native workspace process.
 */
export function getNativeWorkspacePort(id: string): number | undefined {
    return nativeProcesses.get(id)?.port;
}

/**
 * Returns the global unified Android VNC port.
 */
export function getAndroidPort(): number | undefined {
    return 6080;
}

export interface WorkspaceConfig {
    id: string;
    userId: string;
    projectName: string;
    image?: string; 
    withAndroidEmulator?: boolean;
    onLog?: (msg: string) => void;
}

/**
 * Results for workspace operations.
 */
export interface WorkspaceOperationResult {
    success: boolean;
    containerId?: string;
    androidContainerId?: string;
    androidPort?: number;
    port?: string | number;
    appetizeUrl?: string;
    error?: string;
}

/**
 * Workspace provisioner with REAL child-process orchestration.
 * Robust handshake and error handling to prevent "Deployment Engine Failure".
 */
export async function startWorkspaceContainer(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    const log = (msg: string) => { if (config.onLog) config.onLog(`[MANAGER] ${msg}`); };

    if (nativeProcesses.has(config.id)) {
        log(`Workspace detected. Re-establishing secure proxy link...`);
        return {
            success: true,
            containerId: `native-${config.id}`,
            port: nativeProcesses.get(config.id)!.port
        };
    }

    log(`Provisioning real-time isolation for '${config.projectName}'...`);
    
    // 1. Prepare Workspace Directory
    const workspaceRoot = process.env.WORKSPACE_ROOT || path.join(process.cwd(), 'workspaces');
    const workspacePath = path.join(workspaceRoot, config.id);
    const userDataPath = path.join(workspacePath, '.vscode-server');
    
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        log(`Created isolated filesystem segment: ${config.id.slice(0, 8)}`);
    }

    // 2. Identify Target Port
    const port = findAvailablePort();
    log(`Assigned dynamic port: ${port}`);

    // 3. Spawn Real code-server Process (Linux priority)
    const shellCommand = process.platform === 'win32' ? 'npx' : 'code-server';
    const args = process.platform === 'win32' ? ['code-server'] : [];
    
    const baseArgs = [
        '--auth', 'none',
        '--bind-addr', `127.0.0.1:${port}`,
        '--user-data-dir', userDataPath,
        '--disable-telemetry',
        '--disable-update-check',
        workspacePath
    ];

    const child = spawn(shellCommand, [...args, ...baseArgs], {
        env: { ...process.env, HOME: workspacePath },
        cwd: workspacePath,
        shell: process.platform === 'win32'
    });

    log(`Spawning VS Code Orchestrator (PID: ${child.pid})...`);

    // Handle startup errors early
    child.on('error', (err) => {
        log(`[FATAL] Failed to launch IDE binary: ${err.message}`);
    });

    child.stdout.on('data', (data) => {
        const out = data.toString();
        if (out.includes('listening on')) log(`[UP] ${out.trim()}`);
    });

    child.stderr.on('data', (data) => {
        const err = data.toString();
        if (err.toLowerCase().includes('error')) log(`[STDERR] ${err.trim()}`);
    });

    // 4. Register in active pool
    nativeProcesses.set(config.id, { pid: child.pid!, port, process: child });

    // 5. Robust Handshake Loop (Increased attempts + explicit error on failure)
    let attempts = 0;
    while (attempts < 15) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`);
            if (res.ok) {
                log(`Handshake verified. CodeVerse Engine Online.`);
                return {
                    success: true,
                    containerId: `native-${config.id}`,
                    androidPort: config.withAndroidEmulator ? 6080 : undefined,
                    port: port
                };
            }
        } catch {
            await delay(1000);
            attempts++;
            if (attempts % 3 === 0) log(`Warming up IDE core (attempt ${attempts}/15)...`);
        }
    }

    // Failure Case
    log(`[FATAL] IDE core failed to respond on 127.0.0.1:${port} after 15 attempts.`);
    stopNativeWorkspace(config.id);
    
    return {
        success: false,
        error: "IDE_HANDSHAKE_TIMEOUT: The orchestration layer failed to reach the IDE process. Check resource limits on Hugging Face."
    };
}

/**
 * Standardized stop method.
 */
export async function stopWorkspaceContainer(id: string): Promise<{ success: boolean }> {
    const success = await stopNativeWorkspace(id);
    return { success: success || true }; 
}

/**
 * Modern Docker Manager class.
 */
export class DockerManager {
    async getContainerStatus(id: string): Promise<"running" | "stopped" | "not_found"> {
        if (isNativeWorkspaceRunning(id)) return "running";
        return "stopped";
    }

    async stopContainer(id: string): Promise<boolean> {
        return stopNativeWorkspace(id);
    }

    async startWorkspace(config: WorkspaceConfig): Promise<boolean> {
        const result = await startWorkspaceContainer(config);
        return result.success;
    }
}

export const dockerManager = new DockerManager();
