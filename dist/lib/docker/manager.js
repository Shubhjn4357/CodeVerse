"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerManager = exports.DockerManager = exports.provisioningBus = void 0;
exports.isNativeWorkspaceRunning = isNativeWorkspaceRunning;
exports.isDockerAvailable = isDockerAvailable;
exports.stopNativeWorkspace = stopNativeWorkspace;
exports.getNativeWorkspacePort = getNativeWorkspacePort;
exports.getAndroidPort = getAndroidPort;
exports.prewarmWorkspace = prewarmWorkspace;
exports.startWorkspaceContainer = startWorkspaceContainer;
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
 * Map<workspaceId, { pid: number; port: number; process: ChildProcess }>
 */
const nativeProcesses = new Map();
/**
 * Internal Provisioning Bus to multicast logs to concurrent clients.
 */
class ProvisioningBus extends events_1.EventEmitter {
}
exports.provisioningBus = new ProvisioningBus();
/**
 * Map to track active provisioning promises to prevent redundant creation loops.
 */
const pendingProvisioning = new Map();
/**
 * Checks if a native workspace is currently running.
 */
function isNativeWorkspaceRunning(id) {
    return nativeProcesses.has(id);
}
/**
 * Helper for async delays.
 */
const delay = (ms) => new Promise(res => setTimeout(res, ms));
/**
 * Finds an available port in the 8080-8099 range.
 */
function findAvailablePort() {
    const occupiedPorts = Array.from(nativeProcesses.values()).map(p => p.port);
    // Start from a higher random range to avoid system port 8080 conflicts
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
    const entry = nativeProcesses.get(id);
    if (entry) {
        try {
            entry.process.kill();
            nativeProcesses.delete(id);
            return true;
        }
        catch (e) {
            console.error(`[MANAGER] Failed to kill code-server ${id}:`, e);
            nativeProcesses.delete(id);
        }
    }
    return false;
}
/**
 * Gets the internal port for a native workspace process.
 */
function getNativeWorkspacePort(id) {
    var _a;
    return (_a = nativeProcesses.get(id)) === null || _a === void 0 ? void 0 : _a.port;
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
    const workspaceRoot = process.env.WORKSPACE_ROOT || path_1.default.join(/*turbopackIgnore: true*/ '/home/node/app/workspaces');
    const workspacePath = path_1.default.join(/*turbopackIgnore: true*/ workspaceRoot, config.id);
    if (!fs_1.default.existsSync(workspacePath)) {
        fs_1.default.mkdirSync(/*turbopackIgnore: true*/ workspacePath, { recursive: true });
    }
    const idxConfig = idx_engine_1.IdxEngine.getIdxConfig(workspacePath);
    if (idxConfig) {
        // Run Nix sync and onCreate in background if not already warmed
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
    log(`Provisioning hermetic environment for '${config.projectName}'...`);
    // 0. HF PERSISTENCE: Restore profile from Dataset if available
    await storage_1.HFStorage.syncFromDataset((msg) => log(msg));
    storage_1.HFStorage.startAutoSave(300000); // Start 5m auto-save loop
    // 1. Prepare Workspace Directory
    const workspaceRoot = process.env.WORKSPACE_ROOT || path_1.default.join(/*turbopackIgnore: true*/ '/home/node/app/workspaces');
    const workspacePath = path_1.default.join(/*turbopackIgnore: true*/ workspaceRoot, config.id);
    const userDataPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.vscode-server');
    if (!fs_1.default.existsSync(workspacePath)) {
        fs_1.default.mkdirSync(/*turbopackIgnore: true*/ workspacePath, { recursive: true });
        log(`Allocated isolated filesystem segment: ${config.id.slice(0, 8)}`);
    }
    // 2. IDX Engine: Sync Environment (Async/Non-blocking)
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
    nativeProcesses.set(config.id, { pid: child.pid, port, process: child });
    // 7. Handshake Loop
    let attempts = 0;
    while (attempts < 60) {
        try {
            const res = await fetch(`http://127.0.0.1:${port}`);
            if (res.ok) {
                log(`Handshake verified. Studio Engine Online.`);
                // 🟢 PRIORITY SHIFT: Start hooks ONLY AFTER the IDE is confirmed ready
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
    const entry = nativeProcesses.get(config.id);
    if (entry) {
        entry.process.kill();
        nativeProcesses.delete(config.id);
    }
    const errResult = { success: false, error: "IDE_HANDSHAKE_TIMEOUT" };
    exports.provisioningBus.emit(`error:${config.id}`, errResult);
    return errResult;
}
/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
async function startWorkspaceContainer(config) {
    if (nativeProcesses.has(config.id)) {
        return {
            success: true,
            containerId: `native-${config.id}`,
            port: nativeProcesses.get(config.id).port
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
