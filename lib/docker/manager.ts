import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { IdxEngine } from '../idx/idx-engine';
import { HFStorage } from '../hf/storage';

/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: ChildProcess }>
 */
const nativeProcesses = new Map<string, { pid: number; port: number; process: ChildProcess }>();

/**
 * Internal Provisioning Bus to multicast logs to concurrent clients.
 */
class ProvisioningBus extends EventEmitter {}
export const provisioningBus = new ProvisioningBus();

/**
 * Map to track active provisioning promises to prevent redundant creation loops.
 */
const pendingProvisioning = new Map<string, Promise<WorkspaceOperationResult>>();

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
 * Finds an available port in the 8080-8099 range.
 */
function findAvailablePort(): number {
    const occupiedPorts = Array.from(nativeProcesses.values()).map(p => p.port);
    for (let port = 8080; port <= 8099; port++) {
        if (!occupiedPorts.includes(port)) return port;
    }
    return Math.floor(Math.random() * (8999 - 8100) + 8100);
}

/**
 * Checks if Docker is available in the current environment.
 */
export async function isDockerAvailable(): Promise<{ available: boolean; reason?: string }> {
    const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
    
    if (process.env.SIMULATE_HF === 'true') {
        return { available: false, reason: "Hugging Face Simulation Mode (Artificial Sandbox)" };
    }
    
    if (process.env.SPACE_ID) {
        return { available: false, reason: "Hugging Face Space (Native Sandboxed)" };
    }
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
            console.error(`[MANAGER] Failed to kill code-server ${id}:`, e);
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
    status?: 'hydrating' | 'ready';
}

/**
 * PREDICTIVE HYDRATION: Pre-warms Nix profile and SDKs.
 */
export async function prewarmWorkspace(config: WorkspaceConfig): Promise<void> {
    const workspaceRoot = process.env.WORKSPACE_ROOT || path.join(/*turbopackIgnore: true*/ '/home/node/app/workspaces');
    const workspacePath = path.join(/*turbopackIgnore: true*/ workspaceRoot, config.id);
    
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    const idxConfig = IdxEngine.getIdxConfig(workspacePath);
    if (idxConfig) {
        // Run Nix sync and onCreate in background if not already warmed
        IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => {
            provisioningBus.emit(`log:${config.id}`, `[HYDRATE] ${msg}`);
        });
    }
}

/**
 * INTERNAL: Core provisioning logic with IDX support and auto-provisioning baseline.
 */
async function performProvisioning(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    const log = (msg: string) => { 
        if (config.onLog) config.onLog(`[IDX:ENGINE] ${msg}`);
        provisioningBus.emit(`log:${config.id}`, msg);
    };

    log(`Provisioning hermetic environment for '${config.projectName}'...`);
    
    // 0. HF PERSISTENCE: Restore profile from Dataset if available
    await HFStorage.syncFromDataset((msg) => log(msg));
    HFStorage.startAutoSave(300000); // Start 5m auto-save loop
    
    // 1. Prepare Workspace Directory
    const workspaceRoot = process.env.WORKSPACE_ROOT || path.join(/*turbopackIgnore: true*/ '/home/node/app/workspaces');
    const workspacePath = path.join(/*turbopackIgnore: true*/ workspaceRoot, config.id);
    const userDataPath = path.join(/*turbopackIgnore: true*/ workspacePath, '.vscode-server');
    
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        log(`Allocated isolated filesystem segment: ${config.id.slice(0, 8)}`);
    }

    // 2. IDX Engine: Sync Environment (Async/Non-blocking)
    const idxConfig = IdxEngine.getIdxConfig(workspacePath);
    log(`Declarative config detected (Packages: ${idxConfig.packages.length}). Initializing synchronization...`);
    
    await IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => log(msg));
    
    const flagPath = path.join(workspacePath, '.idx-created');
    if (!fs.existsSync(flagPath)) {
        if (idxConfig.onCreate) {
            log(`Executing onCreate lifecycle hook...`);
            await IdxEngine.runHook(workspacePath, 'onCreate', idxConfig.onCreate, (msg) => log(msg));
        }
        fs.writeFileSync(flagPath, new Date().toISOString());
    }

    if (idxConfig.onStart) {
        log(`Executing onStart lifecycle hook...`);
        await IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg));
    }

    // 4. Identify Target Port
    const port = findAvailablePort();

    // 5. Spawn Real code-server Process (Linux priority)
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

    child.on('error', (err) => log(`[FATAL] IDE binary failure: ${err.message}`));
    child.stdout.on('data', (data) => {
        const out = data.toString();
        if (out.includes('listening on')) log(`[IDX:UP] ${out.trim()}`);
    });

    // 6. Register in active pool
    nativeProcesses.set(config.id, { pid: child.pid!, port, process: child });

    // 7. Handshake Loop
    let attempts = 0;
    while (attempts < 15) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`);
            if (res.ok) {
                log(`Handshake verified. Studio Engine Online.`);
                const finalResult = {
                    success: true,
                    containerId: `native-${config.id}`,
                    androidPort: config.withAndroidEmulator ? 6080 : undefined,
                    port: port
                };
                provisioningBus.emit(`ready:${config.id}`, finalResult);
                return finalResult;
            }
        } catch {
            await delay(1000);
            attempts++;
            if (attempts % 3 === 0) log(`Warming up IDE core (attempt ${attempts}/15)...`);
        }
    }

    log(`[FATAL] Handshake timeout on 127.0.0.1:${port}.`);
    const entry = nativeProcesses.get(config.id);
    if (entry) {
        entry.process.kill();
        nativeProcesses.delete(config.id);
    }
    const errResult = { success: false, error: "IDE_HANDSHAKE_TIMEOUT" };
    provisioningBus.emit(`error:${config.id}`, errResult);
    return errResult;
}

/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
export async function startWorkspaceContainer(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    if (nativeProcesses.has(config.id)) {
        return {
            success: true,
            containerId: `native-${config.id}`,
            port: nativeProcesses.get(config.id)!.port
        };
    }

    let pending = pendingProvisioning.get(config.id);
    if (!pending) {
        pending = performProvisioning(config).finally(() => {
            pendingProvisioning.delete(config.id);
        });
        pendingProvisioning.set(config.id, pending);
    }

    return await pending;
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
