import fs from 'fs';
import { spawn, ChildProcess, execSync } from 'child_process';
import path from 'path';
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { IdxEngine } from '../idx/idx-engine';
import { HFStorage } from '../hf/storage';

/**
 * Lighter process interface for reconnected sessions that don't have a full Node.js ChildProcess object.
 * We only require 'kill' and 'pid' for the watchdog and management tasks.
 */
type WorkspaceProcess = Pick<ChildProcess, 'kill' | 'pid'> & {
    on?: ChildProcess['on'];
    stdout?: ChildProcess['stdout'];
    stderr?: ChildProcess['stderr'];
};

/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: WorkspaceProcess }>
 */
export const nativeProcesses = new Map<string, { pid: number; port: number; process: WorkspaceProcess }>();

/**
 * Internal Provisioning Bus to multicast logs to concurrent clients.
 */
class ProvisioningBus extends EventEmitter {}
export const provisioningBus = new ProvisioningBus();

/**
 * Map to track active provisioning promises to prevent redundant creation loops.
 */
export const pendingProvisioning = new Map<string, Promise<WorkspaceOperationResult>>();

/**
 * Checks if a native workspace is currently running.
 */
export function isNativeWorkspaceRunning(id: string): boolean {
    return nativeProcesses.has(id);
}

/**
 * Returns the current runtime status of a workspace.
 */
export function getWorkspaceStatus(id: string): "ready" | "provisioning" | "offline" {
    if (nativeProcesses.has(id)) return "ready";
    if (pendingProvisioning.has(id)) return "provisioning";
    return "offline";
}

/**
 * Helper for async delays.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Finds an available port in the 8100-9000 range.
 */
function findAvailablePort(): number {
    const occupiedPorts = Array.from(nativeProcesses.values()).map(p => p.port);
    let port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    while (occupiedPorts.includes(port)) {
        port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    }
    return port;
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
    // CRITICAL (April 2026): Shorten paths to avoid Unix Domain Socket (UDS) path limit (104 chars)
    const workspaceRoot = process.env.WORKSPACE_ROOT || path.join(/*turbopackIgnore: true*/ '/home/node/w');
    const workspacePath = path.join(/*turbopackIgnore: true*/ workspaceRoot, config.id.slice(0, 8));
    
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
    }

    const idxConfig = IdxEngine.getIdxConfig(workspacePath);
    if (idxConfig) {
        // Run Nix sync in background if not already warmed
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
    HFStorage.startAutoSave(300000); // 5m auto-save
    
    // 1. Prepare Workspace Directory
    const workspaceRoot = process.env.WORKSPACE_ROOT || path.join(/*turbopackIgnore: true*/ '/home/node/w');
    const workspacePath = path.join(/*turbopackIgnore: true*/ workspaceRoot, config.id.slice(0, 8));
    const userDataPath = path.join(/*turbopackIgnore: true*/ workspacePath, '.vscode-server');
    
    if (!fs.existsSync(workspacePath)) {
        fs.mkdirSync(workspacePath, { recursive: true });
        // Store full ID for reliable reconnection after server restarts
        fs.writeFileSync(path.join(workspacePath, '.codeverse-id'), config.id); 
        log(`Allocated isolated filesystem segment: ${config.id.slice(0, 8)}`);
    }

    // 2. IDX Engine: Sync Environment
    const idxConfig = IdxEngine.getIdxConfig(workspacePath);
    log(`Declarative config detected (Packages: ${idxConfig.packages.length}). Initializing synchronization...`);
    
    await IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => log(msg));
    
    const flagPath = path.join(/*turbopackIgnore: true*/ workspacePath, '.idx-created');
    if (!fs.existsSync(flagPath)) {
        if (idxConfig.onCreate) {
            log(`Executing onCreate lifecycle hook...`);
            await IdxEngine.runHook(workspacePath, 'onCreate', idxConfig.onCreate, (msg) => log(msg));
        }
        fs.writeFileSync(flagPath, new Date().toISOString());
    }

    // 4. Identify Target Port
    const port = findAvailablePort();

    // 5. Spawn code-server
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

    const spawnEnv: NodeJS.ProcessEnv = { ...process.env, HOME: workspacePath };
    delete spawnEnv.PORT;
    delete spawnEnv.SERVER_PORT;

    const child = spawn(shellCommand, [...args, ...baseArgs], {
        env: spawnEnv,
        cwd: workspacePath,
        shell: process.platform === 'win32'
    });

    log(`Spawning VS Code Orchestrator (PID: ${child.pid})...`);

    child.on('error', (err) => log(`[FATAL] IDE binary failure: ${err.message}`));
    child.stdout.on('data', (data) => {
        const out = data.toString().trim();
        if (out.includes('listening on')) log(`[IDX:UP] ${out}`);
        else if (out.length > 0) log(`[IDE:CORE] ${out}`);
    });

    child.stderr.on('data', (data) => {
        const err = data.toString().trim();
        if (err.length > 0) log(`[IDE:ERR] ${err}`);
    });

    child.on('close', (code, signal) => {
        log(`[IDE:EXIT] IDE process died with code ${code} (Signal: ${signal})`);
    });

    // 6. Register in active pool
    nativeProcesses.set(config.id, { pid: child.pid!, port, process: child });

    // 7. Handshake Loop
    let attempts = 0;
    while (attempts < 60) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`);
            if (res.ok) {
                log(`Handshake verified. Studio Engine Online.`);

                if (idxConfig.onStart) {
                    log(`Executing background onStart lifecycle hooks...`);
                    IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
                }

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
            if (attempts % 5 === 0) log(`[INFO] Scanning for IDE heartbeat... (Attempt ${attempts}/60)`);
            if (attempts === 15) log(`[INFO] Nix evaluation in progress. Cold boot detected.`);
            if (attempts === 45) log(`[WARN] Handshake threshold approaching. IDE core high load.`);
            await delay(1000);
            attempts++;
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
 * 🛠️ SELF-HEALING: Scans for running code-server instances to repopulate the proxy map.
 * This allows the IDE to survive server restarts or cold boots by probing active ports.
 */
export async function reconnectRunningWorkspaces() {
    const workspaceRoot = process.env.WORKSPACE_ROOT || '/home/node/w';
    
    console.log(`[BOOT] Probing filesystem segment: ${workspaceRoot} for existing sessions...`);
    try {
        // Find all code-server processes
        // Note: Using a more robust ps grep that works across most POSIX environments
        const psCmd = process.platform === 'win32' ? 'tasklist' : "ps aux | grep code-server | grep -v grep";
        const output = execSync(psCmd).toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Looking for: ... --bind-addr 127.0.0.1:8548 ... w/44c7597c
            const bindMatch = line.match(/--bind-addr 127\.0\.0\.1:(\d+)/);
            // Flexible path match: look for the ID prefix after 'w/' or 'workspaces/' or just the root
            const pathMatch = line.match(/[ /](?:w|workspaces)\/([a-zA-Z0-9]{8})/);
            
            if (bindMatch && pathMatch) {
                const port = parseInt(bindMatch[1]);
                const shortId = pathMatch[1];
                const fullPath = path.join(workspaceRoot, shortId);
                const idFile = path.join(fullPath, '.codeverse-id');
                
                let foundFullId = "";
                if (fs.existsSync(idFile)) {
                    foundFullId = fs.readFileSync(idFile, 'utf-8').trim();
                } else {
                    // Fallback: If no ID file, we use the shortId as the temporary key.
                    foundFullId = shortId;
                    console.warn(`[RECONNECT:WARN] No .codeverse-id for session ${shortId}. Using prefix mapping.`);
                }
                
                if (foundFullId && !nativeProcesses.has(foundFullId)) {
                    // Capture PID reliably from ps output (column 2)
                    const psParts = line.trim().split(/\s+/);
                    const pid = parseInt(psParts[1]);
                    
                    console.log(`[RECONNECT] Identified active IDE ${foundFullId} (PID: ${pid}) on port ${port}. Restoration complete.`);
                    nativeProcesses.set(foundFullId, { 
                        pid, 
                        port, 
                        process: { 
                            pid,
                            kill: (_signal?: string | number) => { 
                                try { 
                                    process.kill(pid, 'SIGKILL'); 
                                    return true;
                                } catch {
                                    try { execSync(`fuser -k ${port}/tcp`); } catch {}
                                    return true; 
                                }
                            }
                        } as WorkspaceProcess 
                    });
                }
            }
        }
    } catch (e) {
        // No processes found or ps failed
    }
}

/**
 * 🟢 ENGINE WATCHDOG: Background health monitor for native IDE processes.
 */
function startEngineWatchdog() {
    setInterval(async () => {
        for (const [id, entry] of nativeProcesses.entries()) {
            try {
                // 1. Zombie Check
                try {
                    process.kill(entry.pid, 0); 
                } catch {
                    console.log(`[WATCHDOG] Process ${entry.pid} for ${id} is missing. Pruning.`);
                    nativeProcesses.delete(id);
                    continue;
                }

                // 2. Healthz Polling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                try {
                    const res = await fetch(`http://127.0.0.1:${entry.port}`, { signal: controller.signal });
                    if (!res.ok) throw new Error('Unhealthy');
                } catch {
                    console.warn(`[WATCHDOG] IDE ${id} (Port ${entry.port}) is non-responsive.`);
                    // Optional: force restart if unhealthy for multiple cycles
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (e) {
                console.error(`[WATCHDOG:ERR] ${e}`);
            }
        }
    }, 60000);
}

startEngineWatchdog();

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
