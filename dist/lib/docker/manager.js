"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerManager = exports.DockerManager = exports.pendingProvisioning = exports.provisioningBus = exports.nativeProcesses = void 0;
exports.isNativeWorkspaceRunning = isNativeWorkspaceRunning;
exports.getWorkspaceStatus = getWorkspaceStatus;
exports.isDockerAvailable = isDockerAvailable;
exports.stopNativeWorkspace = stopNativeWorkspace;
exports.getNativeWorkspacePort = getNativeWorkspacePort;
exports.getAndroidPort = getAndroidPort;
exports.prewarmWorkspace = prewarmWorkspace;
exports.startWorkspaceContainer = startWorkspaceContainer;
exports.reconnectRunningWorkspaces = reconnectRunningWorkspaces;
exports.stopWorkspaceContainer = stopWorkspaceContainer;
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const dockerode_1 = __importDefault(require("dockerode"));
const events_1 = require("events");
const idx_engine_1 = require("../idx/idx-engine");
const storage_1 = require("../hf/storage");
/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: WorkspaceProcess }>
 */
exports.nativeProcesses = new Map();
/**
 * Internal Provisioning Bus to multicast logs to concurrent clients.
 */
class ProvisioningBus extends events_1.EventEmitter {
}
exports.provisioningBus = new ProvisioningBus();
/**
 * Map to track active provisioning promises to prevent redundant creation loops.
 */
exports.pendingProvisioning = new Map();
/**
 * Checks if a native workspace is currently running.
 * Supports fuzzy matching for reconnected sessions that might use a prefix key.
 */
function isNativeWorkspaceRunning(id) {
    if (exports.nativeProcesses.has(id))
        return true;
    // Prefix fallback for reconnected sessions
    return Array.from(exports.nativeProcesses.keys()).some(k => id.startsWith(k));
}
/**
 * Returns the current runtime status of a workspace.
 */
function getWorkspaceStatus(id) {
    if (exports.nativeProcesses.has(id))
        return "ready";
    if (exports.pendingProvisioning.has(id))
        return "provisioning";
    return "offline";
}
/**
 * Helper for async delays.
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));
/**
 * Finds an available port in the 8100-9000 range.
 */
function findAvailablePort() {
    const occupiedPorts = Array.from(exports.nativeProcesses.values()).map(p => p.port);
    let port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    while (occupiedPorts.includes(port)) {
        port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    }
    return port;
}
/**
 * Checks if Docker is available in the current environment.
 */
async function isDockerAvailable() {
    const socketPath = process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
    if (process.env.SIMULATE_HF === 'true') {
        return { available: false, reason: "Hugging Face Simulation Mode (Artificial Sandbox)" };
    }
    if (process.env.SPACE_ID) {
        return { available: false, reason: "Hugging Face Space (Native Sandboxed)" };
    }
    try {
        const docker = new dockerode_1.default({ socketPath: process.platform === 'win32' ? undefined : socketPath });
        await docker.ping();
        return { available: true };
    }
    catch (_a) {
        return { available: false, reason: "Docker daemon unreachable" };
    }
}
/**
 * Stops a native workspace process.
 */
async function stopNativeWorkspace(id) {
    const entry = exports.nativeProcesses.get(id);
    if (entry) {
        try {
            entry.process.kill();
            exports.nativeProcesses.delete(id);
            return true;
        }
        catch (e) {
            console.error(`[MANAGER] Failed to kill code-server ${id}:`, e);
            exports.nativeProcesses.delete(id);
        }
    }
    return false;
}
/**
 * Gets the internal port for a native workspace process.
 * Supports fuzzy matching for reconnected sessions.
 */
function getNativeWorkspacePort(id) {
    var _a;
    const entry = exports.nativeProcesses.get(id);
    if (entry)
        return entry.port;
    // Prefix fallback
    const key = Array.from(exports.nativeProcesses.keys()).find(k => id.startsWith(k));
    return key ? (_a = exports.nativeProcesses.get(key)) === null || _a === void 0 ? void 0 : _a.port : undefined;
}
/**
 * Returns the global unified Android VNC port.
 */
function getAndroidPort() {
    return 6080;
}
/**
 * PREDICTIVE HYDRATION: Pre-warms Nix profile and SDKs.
 */
async function prewarmWorkspace(config) {
    // CRITICAL (April 2026): Shorten paths to avoid Unix Domain Socket (UDS) path limit (104 chars)
    const workspaceRoot = process.env.WORKSPACE_ROOT || path_1.default.join(/*turbopackIgnore: true*/ '/home/node/w');
    const workspacePath = path_1.default.join(/*turbopackIgnore: true*/ workspaceRoot, config.id.slice(0, 8));
    if (!fs_1.default.existsSync(workspacePath)) {
        fs_1.default.mkdirSync(workspacePath, { recursive: true });
    }
    const idxConfig = idx_engine_1.IdxEngine.getIdxConfig(workspacePath);
    if (idxConfig) {
        // Run Nix sync in background if not already warmed
        idx_engine_1.IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => {
            exports.provisioningBus.emit(`log:${config.id}`, `[HYDRATE] ${msg}`);
        });
    }
}
/**
 * INTERNAL: Core provisioning logic with IDX support and auto-provisioning baseline.
 */
async function performProvisioning(config) {
    const log = (msg) => {
        if (config.onLog)
            config.onLog(`[IDX:ENGINE] ${msg}`);
        exports.provisioningBus.emit(`log:${config.id}`, msg);
    };
    try {
        log(`Provisioning hermetic environment for '${config.projectName}'...`);
        // 0. HF PERSISTENCE: Restore profile from Dataset if available
        try {
            await storage_1.HFStorage.syncFromDataset((msg) => log(msg));
        }
        catch (e) {
            log(`[WARN] Persistent profile restoration failed: ${e instanceof Error ? e.message : String(e)}. Proceeding with clean environment.`);
        }
        // 1. Prepare Workspace Directory
        const workspaceRoot = process.env.WORKSPACE_ROOT || path_1.default.join(/*turbopackIgnore: true*/ '/home/node/w');
        const workspacePath = path_1.default.join(/*turbopackIgnore: true*/ workspaceRoot, config.id.slice(0, 8));
        const userDataPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.vscode-server');
        if (!fs_1.default.existsSync(workspacePath)) {
            fs_1.default.mkdirSync(workspacePath, { recursive: true });
            // Store full ID for reliable reconnection after server restarts
            fs_1.default.writeFileSync(path_1.default.join(workspacePath, '.codeverse-id'), config.id);
            log(`Allocated isolated filesystem segment: ${config.id.slice(0, 8)}`);
        }
        // 2. IDX Engine: Sync Environment
        const idxConfig = idx_engine_1.IdxEngine.getIdxConfig(workspacePath);
        log(`Declarative config detected (Packages: ${idxConfig.packages.length}). Initializing synchronization...`);
        await idx_engine_1.IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => log(msg));
        const flagPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.idx-created');
        if (!fs_1.default.existsSync(flagPath)) {
            if (idxConfig.onCreate) {
                log(`Executing onCreate lifecycle hook...`);
                await idx_engine_1.IdxEngine.runHook(workspacePath, 'onCreate', idxConfig.onCreate, (msg) => log(msg));
            }
            fs_1.default.writeFileSync(flagPath, new Date().toISOString());
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
        const spawnEnv = { ...process.env, HOME: workspacePath };
        delete spawnEnv.PORT;
        delete spawnEnv.SERVER_PORT;
        const child = (0, child_process_1.spawn)(shellCommand, [...args, ...baseArgs], {
            env: spawnEnv,
            cwd: workspacePath,
            shell: process.platform === 'win32'
        });
        log(`Spawning VS Code Orchestrator (PID: ${child.pid})...`);
        child.on('error', (err) => log(`[FATAL] IDE binary failure: ${err.message}`));
        child.stdout.on('data', (data) => {
            const out = data.toString().trim();
            if (out.includes('listening on'))
                log(`[IDX:UP] ${out}`);
            else if (out.length > 0)
                log(`[IDE:CORE] ${out}`);
        });
        child.stderr.on('data', (data) => {
            const err = data.toString().trim();
            if (err.length > 0)
                log(`[IDE:ERR] ${err}`);
        });
        child.on('close', (code, signal) => {
            log(`[IDE:EXIT] IDE process died with code ${code} (Signal: ${signal})`);
        });
        // 6. Register in active pool
        exports.nativeProcesses.set(config.id, { pid: child.pid, port, process: child });
        // 7. Handshake Loop
        let attempts = 0;
        while (attempts < 60) {
            try {
                const res = await fetch(`http://127.0.0.1:${port}`);
                if (res.ok) {
                    log(`Handshake verified. Studio Engine Online.`);
                    if (idxConfig.onStart) {
                        log(`Executing background onStart lifecycle hooks...`);
                        idx_engine_1.IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
                    }
                    const finalResult = {
                        success: true,
                        containerId: `native-${config.id}`,
                        androidPort: config.withAndroidEmulator ? 6080 : undefined,
                        port: port
                    };
                    exports.provisioningBus.emit(`ready:${config.id}`, finalResult);
                    return finalResult;
                }
            }
            catch (_a) {
                if (attempts % 5 === 0)
                    log(`[INFO] Scanning for IDE heartbeat... (Attempt ${attempts}/60)`);
                if (attempts === 15)
                    log(`[INFO] Nix evaluation in progress. Cold boot detected.`);
                if (attempts === 45)
                    log(`[WARN] Handshake threshold approaching. IDE core high load.`);
                await delay(1000);
                attempts++;
            }
        }
        log(`[FATAL] Handshake timeout on 127.0.0.1:${port}.`);
        const entry = exports.nativeProcesses.get(config.id);
        if (entry) {
            entry.process.kill();
            exports.nativeProcesses.delete(config.id);
        }
        const errResult = { success: false, error: "IDE_HANDSHAKE_TIMEOUT" };
        exports.provisioningBus.emit(`error:${config.id}`, errResult);
        return errResult;
    }
    catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log(`[FATAL] Provisioning pipeline collapsed: ${error}`);
        const errResult = { success: false, error: "PROVISIONING_FAILED" };
        exports.provisioningBus.emit(`error:${config.id}`, errResult);
        return errResult;
    }
}
/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
async function startWorkspaceContainer(config) {
    if (exports.nativeProcesses.has(config.id)) {
        return {
            success: true,
            containerId: `native-${config.id}`,
            port: exports.nativeProcesses.get(config.id).port
        };
    }
    let pending = exports.pendingProvisioning.get(config.id);
    if (!pending) {
        pending = performProvisioning(config).finally(() => {
            exports.pendingProvisioning.delete(config.id);
        });
        exports.pendingProvisioning.set(config.id, pending);
    }
    return await pending;
}
/**
 * 🛠️ SELF-HEALING: Scans for running code-server instances to repopulate the proxy map.
 * This allows the IDE to survive server restarts or cold boots by probing active ports.
 */
async function reconnectRunningWorkspaces() {
    const workspaceRoot = process.env.WORKSPACE_ROOT || '/home/node/w';
    console.log(`[BOOT] Probing filesystem segment: ${workspaceRoot} for existing sessions...`);
    try {
        // Find all code-server processes
        // Note: Using a more robust ps grep that works across most POSIX environments
        const psCmd = process.platform === 'win32' ? 'tasklist' : "ps aux | grep code-server | grep -v grep";
        const output = (0, child_process_1.execSync)(psCmd).toString();
        const lines = output.split('\n');
        for (const line of lines) {
            // Looking for: ... --bind-addr 127.0.0.1:8548 ... w/44c7597c
            const bindMatch = line.match(/--bind-addr 127\.0\.0\.1:(\d+)/);
            // Flexible path match: look for the ID prefix after 'w/' or 'workspaces/' or just the root
            const pathMatch = line.match(/[ /](?:w|workspaces)\/([a-zA-Z0-9]{8})/);
            if (bindMatch && pathMatch) {
                const port = parseInt(bindMatch[1]);
                const shortId = pathMatch[1];
                const fullPath = path_1.default.join(workspaceRoot, shortId);
                const idFile = path_1.default.join(fullPath, '.codeverse-id');
                let foundFullId = "";
                if (fs_1.default.existsSync(idFile)) {
                    foundFullId = fs_1.default.readFileSync(idFile, 'utf-8').trim();
                }
                else {
                    // Fallback: If no ID file, we use the shortId as the temporary key.
                    foundFullId = shortId;
                    console.warn(`[RECONNECT:WARN] No .codeverse-id for session ${shortId}. Using prefix mapping.`);
                }
                if (foundFullId && !exports.nativeProcesses.has(foundFullId)) {
                    // Capture PID reliably from ps output (column 2)
                    const psParts = line.trim().split(/\s+/);
                    const pid = parseInt(psParts[1]);
                    console.log(`[RECONNECT] Identified active IDE ${foundFullId} (PID: ${pid}) on port ${port}. Restoration complete.`);
                    exports.nativeProcesses.set(foundFullId, {
                        pid,
                        port,
                        process: {
                            pid,
                            kill: () => {
                                try {
                                    process.kill(pid, 'SIGKILL');
                                    return true;
                                }
                                catch (_a) {
                                    try {
                                        (0, child_process_1.execSync)(`fuser -k ${port}/tcp`);
                                    }
                                    catch (_b) { }
                                    return true;
                                }
                            }
                        }
                    });
                }
            }
        }
    }
    catch (e) {
        // No processes found or ps failed
    }
}
/**
 * 🟢 ENGINE WATCHDOG: Background health monitor for native IDE processes.
 */
function startEngineWatchdog() {
    setInterval(async () => {
        for (const [id, entry] of exports.nativeProcesses.entries()) {
            try {
                // 1. Zombie Check
                try {
                    process.kill(entry.pid, 0);
                }
                catch (_a) {
                    console.log(`[WATCHDOG] Process ${entry.pid} for ${id} is missing. Pruning.`);
                    exports.nativeProcesses.delete(id);
                    continue;
                }
                // 2. Healthz Polling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                try {
                    const res = await fetch(`http://127.0.0.1:${entry.port}`, { signal: controller.signal });
                    if (!res.ok)
                        throw new Error('Unhealthy');
                }
                catch (_b) {
                    console.warn(`[WATCHDOG] IDE ${id} (Port ${entry.port}) is non-responsive.`);
                    // Optional: force restart if unhealthy for multiple cycles
                }
                finally {
                    clearTimeout(timeoutId);
                }
            }
            catch (e) {
                console.error(`[WATCHDOG:ERR] ${e}`);
            }
        }
    }, 60000);
}
startEngineWatchdog();
/**
 * Standardized stop method.
 */
async function stopWorkspaceContainer(id) {
    const success = await stopNativeWorkspace(id);
    return { success: success || true };
}
/**
 * Modern Docker Manager class.
 */
class DockerManager {
    async getContainerStatus(id) {
        if (isNativeWorkspaceRunning(id))
            return "running";
        return "stopped";
    }
    async stopContainer(id) {
        return stopNativeWorkspace(id);
    }
    async startWorkspace(config) {
        const result = await startWorkspaceContainer(config);
        return result.success;
    }
}
exports.DockerManager = DockerManager;
exports.dockerManager = new DockerManager();
