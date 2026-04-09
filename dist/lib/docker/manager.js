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
const isolation_1 = require("../fs/isolation");
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
const SHORT_WORKSPACE_ID_LENGTH = 8;
const RUNTIME_ROOT_DIR_NAME = '.codeverse-runtime';
function getWorkspaceRootPath() {
    return process.env.WORKSPACE_ROOT || path_1.default.join(/*turbopackIgnore: true*/ '/home/node/w');
}
function getRuntimeRootPath() {
    return path_1.default.join(/*turbopackIgnore: true*/ getWorkspaceRootPath(), RUNTIME_ROOT_DIR_NAME);
}
function getShortWorkspaceId(id) {
    return id.slice(0, SHORT_WORKSPACE_ID_LENGTH);
}
function isPathWithinParent(parentPath, targetPath) {
    const normalizedParent = path_1.default.resolve(parentPath);
    const normalizedTarget = path_1.default.resolve(targetPath);
    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}${path_1.default.sep}`);
}
function getNativeWorkspaceEntry(id) {
    const directEntry = exports.nativeProcesses.get(id);
    if (directEntry) {
        return directEntry;
    }
    const prefixedKey = Array.from(exports.nativeProcesses.keys()).find((key) => id.startsWith(key));
    return prefixedKey ? exports.nativeProcesses.get(prefixedKey) : undefined;
}
async function resolveWorkspaceRuntimePaths(config) {
    const shortWorkspaceId = getShortWorkspaceId(config.id);
    const runtimeRootPath = getRuntimeRootPath();
    const projectPath = await (0, isolation_1.resolveSafeProjectPath)(config.userId, config.projectName);
    return {
        fullWorkspaceId: config.id,
        shortWorkspaceId,
        projectPath,
        runtimeRootPath,
        runtimeWorkspacePath: path_1.default.join(/*turbopackIgnore: true*/ runtimeRootPath, shortWorkspaceId),
        userDataPath: path_1.default.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}-userdata`),
        metadataPath: path_1.default.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}.id`),
    };
}
function ensureRuntimeWorkspacePath(paths, log) {
    if (!fs_1.default.existsSync(paths.projectPath)) {
        fs_1.default.mkdirSync(paths.projectPath, { recursive: true });
    }
    fs_1.default.mkdirSync(paths.runtimeRootPath, { recursive: true });
    fs_1.default.mkdirSync(paths.userDataPath, { recursive: true });
    if (fs_1.default.existsSync(paths.runtimeWorkspacePath)) {
        try {
            const existingTargetPath = fs_1.default.realpathSync(paths.runtimeWorkspacePath);
            if (path_1.default.resolve(existingTargetPath) === path_1.default.resolve(paths.projectPath)) {
                fs_1.default.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
                return paths.runtimeWorkspacePath;
            }
        }
        catch (_a) {
            // Fall through and repair the runtime alias.
        }
        if (!isPathWithinParent(paths.runtimeRootPath, paths.runtimeWorkspacePath)) {
            throw new Error(`Unsafe runtime workspace path: ${paths.runtimeWorkspacePath}`);
        }
        fs_1.default.rmSync(paths.runtimeWorkspacePath, { recursive: true, force: true });
    }
    try {
        fs_1.default.symlinkSync(paths.projectPath, paths.runtimeWorkspacePath, process.platform === 'win32' ? 'junction' : 'dir');
        fs_1.default.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log === null || log === void 0 ? void 0 : log(`Bound runtime alias ${paths.shortWorkspaceId} -> ${paths.projectPath}`);
        return paths.runtimeWorkspacePath;
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fs_1.default.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log === null || log === void 0 ? void 0 : log(`[WARN] Runtime alias creation failed. Falling back to direct project path: ${errorMessage}`);
        return paths.projectPath;
    }
}
/**
 * Checks if a native workspace is currently running.
 * Supports fuzzy matching for reconnected sessions that might use a prefix key.
 */
function isNativeWorkspaceRunning(id) {
    if (exports.pendingProvisioning.has(id))
        return false;
    return getNativeWorkspaceEntry(id) !== undefined;
}
/**
 * Returns the current runtime status of a workspace.
 */
function getWorkspaceStatus(id) {
    if (exports.pendingProvisioning.has(id))
        return "provisioning";
    if (getNativeWorkspaceEntry(id))
        return "ready";
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
    if (exports.pendingProvisioning.has(id)) {
        return undefined;
    }
    return (_a = getNativeWorkspaceEntry(id)) === null || _a === void 0 ? void 0 : _a.port;
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
    const runtimePaths = await resolveWorkspaceRuntimePaths(config);
    const workspacePath = ensureRuntimeWorkspacePath(runtimePaths);
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
        const runtimePaths = await resolveWorkspaceRuntimePaths(config);
        const workspacePath = ensureRuntimeWorkspacePath(runtimePaths, log);
        const userDataPath = runtimePaths.userDataPath;
        // 2. Register in active pool (EARLY REGISTRATION: satisfy proxy health checks)
        const port = findAvailablePort();
        exports.nativeProcesses.set(config.id, {
            pid: -1, // PID not yet available
            port,
            process: { kill: () => true, pid: -1 }
        });
        // 3. IDX Engine: Sync Environment
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
            exports.nativeProcesses.delete(config.id);
        });
        // 6. Update Registry with real Process
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
        exports.nativeProcesses.delete(config.id);
        const errResult = { success: false, error: "PROVISIONING_FAILED" };
        exports.provisioningBus.emit(`error:${config.id}`, errResult);
        return errResult;
    }
}
/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
async function startWorkspaceContainer(config) {
    const pendingWorkspace = exports.pendingProvisioning.get(config.id);
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
    var _a, _b;
    const workspaceRoot = getWorkspaceRootPath();
    const runtimeRootPath = getRuntimeRootPath();
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
            const userDataMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})-userdata/);
            const runtimePathMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})(?:\s|$)/);
            const legacyPathMatch = line.match(/[ /](?:w|workspaces)[\/\\]([a-zA-Z0-9]{8})/);
            if (bindMatch) {
                const shortId = (_b = (_a = userDataMatch === null || userDataMatch === void 0 ? void 0 : userDataMatch[1]) !== null && _a !== void 0 ? _a : runtimePathMatch === null || runtimePathMatch === void 0 ? void 0 : runtimePathMatch[1]) !== null && _b !== void 0 ? _b : legacyPathMatch === null || legacyPathMatch === void 0 ? void 0 : legacyPathMatch[1];
                if (!shortId) {
                    continue;
                }
                const port = parseInt(bindMatch[1], 10);
                const metadataPath = path_1.default.join(runtimeRootPath, `${shortId}.id`);
                const legacyIdFile = path_1.default.join(workspaceRoot, shortId, '.codeverse-id');
                let foundFullId = "";
                if (fs_1.default.existsSync(metadataPath)) {
                    foundFullId = fs_1.default.readFileSync(metadataPath, 'utf-8').trim();
                }
                else if (fs_1.default.existsSync(legacyIdFile)) {
                    foundFullId = fs_1.default.readFileSync(legacyIdFile, 'utf-8').trim();
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
    catch (_c) {
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
    return { success };
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
