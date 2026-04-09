import fs from 'fs';
import { spawn, ChildProcess, execFileSync, execSync } from 'child_process';
import path from 'path';
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { IdxEngine } from '../idx/idx-engine';
import { HFStorage } from '../hf/storage';
import { resolveSafeProjectPath } from '../fs/isolation';
import { ENV_CONFIG } from '../env-config';

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

interface WorkspaceRuntimePaths {
    fullWorkspaceId: string;
    shortWorkspaceId: string;
    projectPath: string;
    runtimeRootPath: string;
    runtimeWorkspacePath: string;
    userDataPath: string;
    metadataPath: string;
    npmCachePath: string;
}

interface CodeServerLaunch {
    command: string;
    args: string[];
    label: string;
    usesNpx: boolean;
    useShell: boolean;
}

const SHORT_WORKSPACE_ID_LENGTH = 8;
const RUNTIME_ROOT_DIR_NAME = '.codeverse-runtime';

function getWorkspaceRootPath(): string {
    return ENV_CONFIG.WORKSPACE_ROOT;
}

function getRuntimeRootPath(): string {
    return path.join(/*turbopackIgnore: true*/ getWorkspaceRootPath(), RUNTIME_ROOT_DIR_NAME);
}

function getShortWorkspaceId(id: string): string {
    return id.slice(0, SHORT_WORKSPACE_ID_LENGTH);
}

function isPathWithinParent(parentPath: string, targetPath: string): boolean {
    const normalizedParent = path.resolve(parentPath);
    const normalizedTarget = path.resolve(targetPath);

    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}${path.sep}`);
}

function getNativeWorkspaceEntry(id: string): { pid: number; port: number; process: WorkspaceProcess } | undefined {
    const directEntry = nativeProcesses.get(id);
    if (directEntry) {
        return directEntry;
    }

    const prefixedKey = Array.from(nativeProcesses.keys()).find((key) => id.startsWith(key));
    return prefixedKey ? nativeProcesses.get(prefixedKey) : undefined;
}

async function resolveWorkspaceRuntimePaths(config: Pick<WorkspaceConfig, 'id' | 'userId' | 'projectName'>): Promise<WorkspaceRuntimePaths> {
    const shortWorkspaceId = getShortWorkspaceId(config.id);
    const runtimeRootPath = getRuntimeRootPath();
    const projectPath = await resolveSafeProjectPath(config.userId, config.projectName);

    return {
        fullWorkspaceId: config.id,
        shortWorkspaceId,
        projectPath,
        runtimeRootPath,
        runtimeWorkspacePath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, shortWorkspaceId),
        userDataPath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}-userdata`),
        metadataPath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}.id`),
        npmCachePath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, 'npm-cache'),
    };
}

function ensureRuntimeWorkspacePath(paths: WorkspaceRuntimePaths, log?: (msg: string) => void): string {
    if (!fs.existsSync(paths.projectPath)) {
        fs.mkdirSync(paths.projectPath, { recursive: true });
    }

    fs.mkdirSync(paths.runtimeRootPath, { recursive: true });
    fs.mkdirSync(paths.userDataPath, { recursive: true });
    fs.mkdirSync(paths.npmCachePath, { recursive: true });

    if (fs.existsSync(paths.runtimeWorkspacePath)) {
        try {
            const existingTargetPath = fs.realpathSync(paths.runtimeWorkspacePath);
            if (path.resolve(existingTargetPath) === path.resolve(paths.projectPath)) {
                fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
                return paths.runtimeWorkspacePath;
            }
        } catch {
            // Fall through and repair the runtime alias.
        }

        if (!isPathWithinParent(paths.runtimeRootPath, paths.runtimeWorkspacePath)) {
            throw new Error(`Unsafe runtime workspace path: ${paths.runtimeWorkspacePath}`);
        }

        fs.rmSync(paths.runtimeWorkspacePath, { recursive: true, force: true });
    }

    try {
        fs.symlinkSync(paths.projectPath, paths.runtimeWorkspacePath, process.platform === 'win32' ? 'junction' : 'dir');
        fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log?.(`Bound runtime alias ${paths.shortWorkspaceId} -> ${paths.projectPath}`);
        return paths.runtimeWorkspacePath;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log?.(`[WARN] Runtime alias creation failed. Falling back to direct project path: ${errorMessage}`);
        return paths.projectPath;
    }
}

/**
 * Checks if a native workspace is currently running.
 * Supports fuzzy matching for reconnected sessions that might use a prefix key.
 */
export function isNativeWorkspaceRunning(id: string): boolean {
    if (pendingProvisioning.has(id)) return false;
    return getNativeWorkspaceEntry(id) !== undefined;
}

/**
 * Returns the current runtime status of a workspace.
 */
export function getWorkspaceStatus(id: string): "ready" | "provisioning" | "offline" {
    if (pendingProvisioning.has(id)) return "provisioning";
    if (getNativeWorkspaceEntry(id)) return "ready";
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

function resolveExecutableOnPath(candidates: string[]): string | null {
    const locatorCommand = process.platform === 'win32' ? 'where' : 'which';

    for (const candidate of candidates) {
        try {
            const output = execFileSync(locatorCommand, [candidate], {
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'ignore'],
            });
            const resolvedPath = output
                .split(/\r?\n/)
                .map((line) => line.trim())
                .find(Boolean);
            if (resolvedPath) {
                return resolvedPath;
            }
        } catch {
            // Fall through to the next candidate.
        }
    }

    return null;
}

function quoteWindowsCmdArg(value: string): string {
    if (value.length === 0) {
        return '""';
    }

    if (!/[ \t"]/.test(value)) {
        return value;
    }

    return `"${value.replace(/"/g, '""')}"`;
}

function resolveCodeServerLaunch(): CodeServerLaunch {
    const overrideBinary = process.env.CODE_SERVER_BIN;
    if (overrideBinary) {
        const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(overrideBinary);
        return { command: overrideBinary, args: [], label: overrideBinary, usesNpx: false, useShell };
    }

    if (process.platform === 'win32') {
        const codeServerBinary = resolveExecutableOnPath(['code-server.exe', 'code-server']);
        if (codeServerBinary) {
            return { command: codeServerBinary, args: [], label: 'code-server', usesNpx: false, useShell: false };
        }

        const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
        if (fs.existsSync(npxCliPath)) {
            return { command: process.execPath, args: [npxCliPath, '--yes', 'code-server'], label: 'node npx-cli.js code-server', usesNpx: true, useShell: false };
        }

        throw new Error('CODE_SERVER_BIN_NOT_FOUND');
    }

    const codeServerBinary = resolveExecutableOnPath(['code-server']);
    if (codeServerBinary) {
        return { command: codeServerBinary, args: [], label: 'code-server', usesNpx: false, useShell: false };
    }

    const npxBinary = resolveExecutableOnPath(['npx']);
    if (npxBinary) {
        return { command: npxBinary, args: ['--yes', 'code-server'], label: 'npx code-server', usesNpx: true, useShell: false };
    }

    throw new Error('CODE_SERVER_BIN_NOT_FOUND');
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
 * Supports fuzzy matching for reconnected sessions.
 */
export function getNativeWorkspacePort(id: string): number | undefined {
    if (pendingProvisioning.has(id)) {
        return undefined;
    }

    return getNativeWorkspaceEntry(id)?.port;
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
    const runtimePaths = await resolveWorkspaceRuntimePaths(config);
    const workspacePath = ensureRuntimeWorkspacePath(runtimePaths);

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

    try {
        log(`Provisioning hermetic environment for '${config.projectName}'...`);
        
        // 0. HF PERSISTENCE: Restore profile from Dataset if available
        try {
            await HFStorage.syncFromDataset((msg) => log(msg));
        } catch (e) {
            log(`[WARN] Persistent profile restoration failed: ${e instanceof Error ? e.message : String(e)}. Proceeding with clean environment.`);
        }
    
    // 1. Prepare Workspace Directory
    const runtimePaths = await resolveWorkspaceRuntimePaths(config);
    const workspacePath = ensureRuntimeWorkspacePath(runtimePaths, log);
    const userDataPath = runtimePaths.userDataPath;

    // 2. Register in active pool (EARLY REGISTRATION: satisfy proxy health checks)
    const port = findAvailablePort();
    nativeProcesses.set(config.id, { 
        pid: -1, // PID not yet available
        port, 
        process: { kill: () => true, pid: -1 } as unknown as WorkspaceProcess 
    });

    // 3. IDX Engine: Sync Environment
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

        // 5. Spawn code-server
        const codeServerLaunch = resolveCodeServerLaunch();
        const shellCommand = codeServerLaunch.command;
        const args = codeServerLaunch.args;
        const spawnCwd = (() => {
            try {
                return fs.realpathSync(workspacePath);
            } catch {
                return workspacePath;
            }
        })();
        
        const baseArgs = [
            '--auth', 'none',
            '--bind-addr', `127.0.0.1:${port}`,
            '--user-data-dir', userDataPath,
            '--disable-telemetry',
            '--disable-update-check',
            workspacePath
        ];

        const spawnEnv: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: workspacePath,
            npm_config_cache: runtimePaths.npmCachePath,
            npm_config_update_notifier: 'false',
        };
        delete spawnEnv.PORT;
        delete spawnEnv.SERVER_PORT;

        const launchArgs = [...args, ...baseArgs];
        const launchCommand = codeServerLaunch.useShell ? (process.env.ComSpec || 'cmd.exe') : shellCommand;
        const launchCommandArgs = codeServerLaunch.useShell
            ? ['/d', '/s', '/c', [quoteWindowsCmdArg(shellCommand), ...launchArgs.map(quoteWindowsCmdArg)].join(' ')]
            : launchArgs;

        log(`IDE launch prepared. Binary: ${shellCommand} | cwd: ${spawnCwd} | target: ${workspacePath}`);

        let child: ChildProcess;
        try {
            child = spawn(launchCommand, launchCommandArgs, {
                env: spawnEnv,
                cwd: spawnCwd,
                shell: false
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`IDE_SPAWN_CONFIGURATION_REJECTED: ${errorMessage}`);
        }

        log(`Spawning VS Code Orchestrator via ${codeServerLaunch.label} (PID: ${child.pid})...`);
        let childExited = false;
        let childFailureReason: string | null = null;

        child.on('error', (err) => {
            childFailureReason = `IDE_BINARY_FAILURE: ${err.message}`;
            log(`[FATAL] IDE binary failure: ${err.message}`);
        });
        child.stdout?.on('data', (data) => {
            const out = data.toString().trim();
            if (out.includes('listening on')) log(`[IDX:UP] ${out}`);
            else if (out.length > 0) log(`[IDE:CORE] ${out}`);
        });

        child.stderr?.on('data', (data) => {
            const err = data.toString().trim();
            if (err.length > 0) log(`[IDE:ERR] ${err}`);
        });

        child.on('close', (code, signal) => {
            childExited = true;
            if (code !== 0 || signal) {
                childFailureReason = childFailureReason ?? `IDE_PROCESS_EXIT_${code ?? 'unknown'}${signal ? `_${signal}` : ''}`;
            }
            log(`[IDE:EXIT] IDE process died with code ${code} (Signal: ${signal})`);
            nativeProcesses.delete(config.id);
        });

        // 6. Update Registry with real Process
        nativeProcesses.set(config.id, { pid: child.pid!, port, process: child });

        // 7. Handshake Loop
        let attempts = 0;
        while (attempts < 60) {
            if (childExited) {
                const rawFailureMessage = childFailureReason ?? 'IDE_PROCESS_EXITED_BEFORE_HANDSHAKE';
                const failureMessage = codeServerLaunch.usesNpx
                    ? `${rawFailureMessage}. code-server could not be bootstrapped via npx. Install code-server globally or set CODE_SERVER_BIN.`
                    : rawFailureMessage;
                log(`[FATAL] IDE bootstrap aborted before handshake: ${failureMessage}`);
                const errResult = { success: false, error: failureMessage };
                provisioningBus.emit(`error:${config.id}`, errResult);
                return errResult;
            }

            try {
                const res = await fetch(`http://127.0.0.1:${port}`);
                if (res.ok) {
                    log(`Handshake verified. Studio Engine Online.`);

                    if (idxConfig.onStart) {
                        log(`Executing background onStart lifecycle hooks...`);
                        IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
                    }

                    const finalResult: WorkspaceOperationResult = {
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
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log(`[FATAL] Provisioning pipeline collapsed: ${error}`);
        nativeProcesses.delete(config.id);
        const errResult = { success: false, error: `PROVISIONING_FAILED: ${error}` };
        provisioningBus.emit(`error:${config.id}`, errResult);
        return errResult;
    }
}

/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
export async function startWorkspaceContainer(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    const pendingWorkspace = pendingProvisioning.get(config.id);
    if (pendingWorkspace) {
        return await pendingWorkspace;
    }

    const existingPort = getNativeWorkspacePort(config.id);
    if (existingPort !== undefined) {
        return {
            success: true,
            containerId: `native-${config.id}`,
            port: existingPort
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
    const workspaceRoot = getWorkspaceRootPath();
    const runtimeRootPath = getRuntimeRootPath();
    
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
            const userDataMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})-userdata/);
            const runtimePathMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})(?:\s|$)/);
            const legacyPathMatch = line.match(/[ /](?:w|workspaces)[\/\\]([a-zA-Z0-9]{8})/);
            
            if (bindMatch) {
                const shortId = userDataMatch?.[1] ?? runtimePathMatch?.[1] ?? legacyPathMatch?.[1];
                if (!shortId) {
                    continue;
                }

                const port = parseInt(bindMatch[1], 10);
                const metadataPath = path.join(runtimeRootPath, `${shortId}.id`);
                const legacyIdFile = path.join(workspaceRoot, shortId, '.codeverse-id');
                
                let foundFullId = "";
                if (fs.existsSync(metadataPath)) {
                    foundFullId = fs.readFileSync(metadataPath, 'utf-8').trim();
                } else if (fs.existsSync(legacyIdFile)) {
                    foundFullId = fs.readFileSync(legacyIdFile, 'utf-8').trim();
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
                            kill: () => { 
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
    } catch {
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
    return { success };
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
