"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.dockerManager = exports.DockerManager = exports.pendingProvisioning = exports.provisioningBus = exports.dockerWorkspaces = exports.nativeProcesses = void 0;
exports.isNativeWorkspaceRunning = isNativeWorkspaceRunning;
exports.isWorkspaceRunning = isWorkspaceRunning;
exports.getWorkspaceStatus = getWorkspaceStatus;
exports.isDockerAvailable = isDockerAvailable;
exports.stopNativeWorkspace = stopNativeWorkspace;
exports.getNativeWorkspacePort = getNativeWorkspacePort;
exports.getWorkspacePort = getWorkspacePort;
exports.getAndroidPort = getAndroidPort;
exports.prewarmWorkspace = prewarmWorkspace;
exports.startWorkspaceContainer = startWorkspaceContainer;
exports.reconnectRunningWorkspaces = reconnectRunningWorkspaces;
exports.stopWorkspaceContainer = stopWorkspaceContainer;
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const events_1 = require("events");
const idx_engine_1 = require("../idx/idx-engine");
const builder_1 = require("./builder");
const client_1 = require("./client");
const storage_1 = require("../hf/storage");
const isolation_1 = require("../fs/isolation");
const env_config_1 = require("../env-config");
/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: WorkspaceProcess }>
 */
exports.nativeProcesses = new Map();
exports.dockerWorkspaces = new Map();
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
const DOCKER_CODE_SERVER_PORT = 8080;
const WORKSPACE_CONTAINER_NAME_PREFIX = 'codeverse-workspace-';
const WORKSPACE_RUNTIME_LABEL = 'codeverse.runtime';
const WORKSPACE_RUNTIME_LABEL_VALUE = 'workspace';
const WORKSPACE_ID_LABEL = 'codeverse.workspace.id';
function getWorkspaceRootPath() {
    return env_config_1.ENV_CONFIG.WORKSPACE_ROOT;
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
function getDockerWorkspaceEntry(id) {
    return exports.dockerWorkspaces.get(id);
}
function getWorkspaceRuntimeEntry(id) {
    var _a;
    return (_a = getNativeWorkspaceEntry(id)) !== null && _a !== void 0 ? _a : getDockerWorkspaceEntry(id);
}
function getWorkspaceContainerName(id) {
    return `${WORKSPACE_CONTAINER_NAME_PREFIX}${id}`;
}
function getWorkspaceContainerLabels(config) {
    return {
        [WORKSPACE_RUNTIME_LABEL]: WORKSPACE_RUNTIME_LABEL_VALUE,
        [WORKSPACE_ID_LABEL]: config.id,
        'codeverse.workspace.project': config.projectName,
        'codeverse.workspace.user': config.userId,
    };
}
function getDockerBindSourcePath(hostPath) {
    return path_1.default.resolve(hostPath);
}
function hasCustomDockerPackages(config) {
    var _a, _b, _c, _d;
    return Boolean(((_b = (_a = config.packages) === null || _a === void 0 ? void 0 : _a.apt) === null || _b === void 0 ? void 0 : _b.length)
        || ((_d = (_c = config.packages) === null || _c === void 0 ? void 0 : _c.npm) === null || _d === void 0 ? void 0 : _d.length));
}
function getWorkspaceEnvironment(config) {
    var _a;
    return Object.entries((_a = config.env) !== null && _a !== void 0 ? _a : {}).map(([key, value]) => `${key}=${value}`);
}
async function ensureDockerImageAvailable(docker, imageName, log) {
    try {
        await docker.getImage(imageName).inspect();
        return;
    }
    catch (_a) {
        log(`Pulling Docker image '${imageName}'...`);
    }
    await new Promise((resolve, reject) => {
        docker.pull(imageName, (error, stream) => {
            if (error || !stream) {
                reject(error !== null && error !== void 0 ? error : new Error(`Failed to pull Docker image '${imageName}'`));
                return;
            }
            docker.modem.followProgress(stream, (progressError) => {
                if (progressError) {
                    reject(progressError);
                    return;
                }
                resolve();
            }, (event) => {
                if (event.status) {
                    const progressLabel = event.id ? `${event.id}: ${event.status}` : event.status;
                    log(`[DOCKER:PULL] ${progressLabel}`);
                }
            });
        });
    });
}
function getPublishedPortForContainerInfo(info) {
    var _a, _b, _c;
    const bindings = (_b = (_a = info.NetworkSettings) === null || _a === void 0 ? void 0 : _a.Ports) === null || _b === void 0 ? void 0 : _b[`${DOCKER_CODE_SERVER_PORT}/tcp`];
    const hostPort = (_c = bindings === null || bindings === void 0 ? void 0 : bindings[0]) === null || _c === void 0 ? void 0 : _c.HostPort;
    if (!hostPort) {
        return undefined;
    }
    const parsedPort = Number.parseInt(hostPort, 10);
    return Number.isFinite(parsedPort) ? parsedPort : undefined;
}
function getPublishedPortForListEntry(containerInfo) {
    var _a;
    const publishedPort = (_a = containerInfo.Ports.find((portInfo) => portInfo.PrivatePort === DOCKER_CODE_SERVER_PORT && portInfo.PublicPort)) === null || _a === void 0 ? void 0 : _a.PublicPort;
    return publishedPort && Number.isFinite(publishedPort) ? publishedPort : undefined;
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
        npmCachePath: path_1.default.join(/*turbopackIgnore: true*/ runtimeRootPath, 'npm-cache'),
    };
}
function ensureRuntimeWorkspacePath(paths, log) {
    if (!fs_1.default.existsSync(paths.projectPath)) {
        fs_1.default.mkdirSync(paths.projectPath, { recursive: true });
    }
    fs_1.default.mkdirSync(paths.runtimeRootPath, { recursive: true });
    fs_1.default.mkdirSync(paths.userDataPath, { recursive: true });
    fs_1.default.mkdirSync(paths.npmCachePath, { recursive: true });
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
function isWorkspaceRunning(id) {
    if (exports.pendingProvisioning.has(id))
        return false;
    return getWorkspaceRuntimeEntry(id) !== undefined;
}
/**
 * Returns the current runtime status of a workspace.
 */
function getWorkspaceStatus(id) {
    if (exports.pendingProvisioning.has(id))
        return "provisioning";
    if (getWorkspaceRuntimeEntry(id))
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
    const occupiedPorts = [
        ...Array.from(exports.nativeProcesses.values()).map((entry) => entry.port),
        ...Array.from(exports.dockerWorkspaces.values()).map((entry) => entry.port),
    ];
    let port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    while (occupiedPorts.includes(port)) {
        port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    }
    return port;
}
function resolveExecutableOnPath(candidates) {
    const locatorCommand = process.platform === 'win32' ? 'where' : 'which';
    for (const candidate of candidates) {
        try {
            const output = (0, child_process_1.execFileSync)(locatorCommand, [candidate], {
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
        }
        catch (_a) {
            // Fall through to the next candidate.
        }
    }
    return null;
}
function resolveLocalToolNodeBinary() {
    var _a;
    if (env_config_1.ENV_CONFIG.CODE_SERVER_NODE_BIN && fs_1.default.existsSync(env_config_1.ENV_CONFIG.CODE_SERVER_NODE_BIN)) {
        return env_config_1.ENV_CONFIG.CODE_SERVER_NODE_BIN;
    }
    const localToolsRoot = path_1.default.join(process.cwd(), '.codeverse-tools');
    if (!fs_1.default.existsSync(localToolsRoot)) {
        return null;
    }
    const directNodePath = path_1.default.join(localToolsRoot, 'node', 'node.exe');
    if (fs_1.default.existsSync(directNodePath)) {
        return directNodePath;
    }
    const nodeDirs = fs_1.default.readdirSync(localToolsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^node-v22\..*-win-x64$/i.test(entry.name))
        .map((entry) => path_1.default.join(localToolsRoot, entry.name, 'node.exe'));
    return (_a = nodeDirs.find((candidate) => fs_1.default.existsSync(candidate))) !== null && _a !== void 0 ? _a : null;
}
function resolveLocalCodeServerEntry() {
    if (env_config_1.ENV_CONFIG.CODE_SERVER_ENTRY && fs_1.default.existsSync(env_config_1.ENV_CONFIG.CODE_SERVER_ENTRY)) {
        return env_config_1.ENV_CONFIG.CODE_SERVER_ENTRY;
    }
    const localEntryPath = path_1.default.join(process.cwd(), '.codeverse-tools', 'code-server', 'node_modules', 'code-server', 'out', 'node', 'entry.js');
    return fs_1.default.existsSync(localEntryPath) ? localEntryPath : null;
}
function getCurrentNodeMajorVersion() {
    const [majorVersion] = process.versions.node.split('.');
    return Number.parseInt(majorVersion !== null && majorVersion !== void 0 ? majorVersion : '0', 10);
}
function resolveCodeServerLaunch() {
    const overrideBinary = process.env.CODE_SERVER_BIN;
    if (overrideBinary) {
        const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(overrideBinary);
        return { command: overrideBinary, args: [], label: overrideBinary, usesNpx: false, useShell };
    }
    if (process.platform === 'win32') {
        const localToolNodeBinary = resolveLocalToolNodeBinary();
        const localCodeServerEntry = resolveLocalCodeServerEntry();
        if (localToolNodeBinary && localCodeServerEntry) {
            return {
                command: localToolNodeBinary,
                args: [localCodeServerEntry],
                label: 'local code-server toolchain',
                usesNpx: false,
                useShell: false
            };
        }
        const codeServerBinary = resolveExecutableOnPath(['code-server.exe', 'code-server']);
        if (codeServerBinary) {
            return { command: codeServerBinary, args: [], label: 'code-server', usesNpx: false, useShell: false };
        }
        if (getCurrentNodeMajorVersion() !== 22) {
            throw new Error('CODE_SERVER_WINDOWS_REQUIRES_NODE_22_OR_LOCAL_TOOLCHAIN');
        }
        const npxCliPath = path_1.default.join(path_1.default.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
        if (fs_1.default.existsSync(npxCliPath)) {
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
async function isDockerAvailable() {
    var _a;
    if (process.env.SIMULATE_HF === 'true') {
        return { available: false, reason: "Hugging Face Simulation Mode (Artificial Sandbox)" };
    }
    if (process.env.SPACE_ID) {
        return { available: false, reason: "Hugging Face Space (Native Sandboxed)" };
    }
    const availability = await (0, client_1.probeDockerAvailability)(env_config_1.ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
    return availability.available
        ? { available: true }
        : { available: false, reason: (_a = availability.reason) !== null && _a !== void 0 ? _a : "Docker daemon unreachable" };
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
function getWorkspacePort(id) {
    var _a;
    if (exports.pendingProvisioning.has(id)) {
        return undefined;
    }
    return (_a = getWorkspaceRuntimeEntry(id)) === null || _a === void 0 ? void 0 : _a.port;
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
async function waitForWorkspaceHeartbeat({ port, log, getFailureReason }) {
    let attempts = 0;
    while (attempts < 60) {
        const failureReason = await (getFailureReason === null || getFailureReason === void 0 ? void 0 : getFailureReason());
        if (failureReason) {
            log(`[FATAL] IDE bootstrap aborted before handshake: ${failureReason}`);
            return failureReason;
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);
        try {
            const response = await fetch(`http://127.0.0.1:${port}`, { signal: controller.signal });
            if (response.ok) {
                log(`Handshake verified. Studio Engine Online.`);
                return null;
            }
        }
        catch (_a) {
            if (attempts % 5 === 0)
                log(`[INFO] Scanning for IDE heartbeat... (Attempt ${attempts}/60)`);
            if (attempts === 15) {
                const bootstrapHint = env_config_1.ENV_CONFIG.IDX_NIX_SYNC_ENABLED
                    ? 'Nix evaluation in progress. Cold boot detected.'
                    : 'IDE bootstrap still in progress.';
                log(`[INFO] ${bootstrapHint}`);
            }
            if (attempts === 45)
                log(`[WARN] Handshake threshold approaching. IDE core high load.`);
        }
        finally {
            clearTimeout(timeoutId);
        }
        await delay(1000);
        attempts++;
    }
    log(`[FATAL] Handshake timeout on 127.0.0.1:${port}.`);
    return "IDE_HANDSHAKE_TIMEOUT";
}
async function resolveExistingWorkspaceContainer(docker, workspaceId) {
    var _a;
    const containerName = getWorkspaceContainerName(workspaceId);
    const containers = await docker.listContainers({
        all: true,
        filters: {
            name: [containerName],
        },
    });
    const exactMatch = containers.find((container) => container.Names.some((name) => name === `/${containerName}`));
    return (_a = exactMatch !== null && exactMatch !== void 0 ? exactMatch : containers[0]) !== null && _a !== void 0 ? _a : null;
}
function registerDockerWorkspaceRuntime(workspaceId, containerInfo, socketPath) {
    const publishedPort = getPublishedPortForContainerInfo(containerInfo);
    if (!publishedPort) {
        return null;
    }
    const containerEntry = {
        kind: 'docker',
        containerId: containerInfo.Id,
        containerName: containerInfo.Name.replace(/^\//, ''),
        imageName: containerInfo.Config.Image,
        port: publishedPort,
        socketPath,
    };
    exports.dockerWorkspaces.set(workspaceId, containerEntry);
    return containerEntry;
}
async function startDockerWorkspace(config, runtimePaths, workspacePath, log) {
    const dockerResolution = await (0, client_1.resolveDockerClient)(env_config_1.ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
    if (!dockerResolution) {
        return null;
    }
    const { docker, socketPath } = dockerResolution;
    const workspaceConfig = await (0, builder_1.loadWorkspaceConfig)(workspacePath);
    const containerName = getWorkspaceContainerName(config.id);
    const existingContainerInfo = await resolveExistingWorkspaceContainer(docker, config.id);
    if (existingContainerInfo) {
        const existingContainer = docker.getContainer(existingContainerInfo.Id);
        const existingInspect = await existingContainer.inspect();
        if (!existingInspect.State.Running) {
            log(`Restarting existing Docker workspace container '${containerName}'...`);
            await existingContainer.start();
        }
        else {
            log(`Reusing active Docker workspace container '${containerName}'.`);
        }
        const runningInspect = await existingContainer.inspect();
        const runningEntry = registerDockerWorkspaceRuntime(config.id, runningInspect, socketPath);
        if (!runningEntry) {
            return { success: false, error: 'DOCKER_PORT_BINDING_MISSING' };
        }
        const heartbeatError = await waitForWorkspaceHeartbeat({
            port: runningEntry.port,
            log,
            getFailureReason: async () => {
                const info = await existingContainer.inspect();
                return info.State.Running ? null : `DOCKER_CONTAINER_EXITED_${info.State.ExitCode}`;
            },
        });
        if (heartbeatError) {
            exports.dockerWorkspaces.delete(config.id);
            return { success: false, error: heartbeatError };
        }
        return {
            success: true,
            containerId: runningEntry.containerId,
            port: runningEntry.port,
            runtime: 'docker',
        };
    }
    let imageName = env_config_1.ENV_CONFIG.DOCKER_WORKSPACE_BASE_IMAGE;
    if (hasCustomDockerPackages(workspaceConfig)) {
        const buildResult = await (0, builder_1.buildWorkspaceImage)(config.id, workspacePath, log, docker);
        imageName = buildResult.imageName;
    }
    await ensureDockerImageAvailable(docker, imageName, log);
    const port = findAvailablePort();
    const workspaceContainer = await docker.createContainer({
        name: containerName,
        Image: imageName,
        WorkingDir: '/home/coder/project',
        Env: [
            'HOME=/home/coder',
            'SHELL=/bin/bash',
            ...getWorkspaceEnvironment(workspaceConfig),
        ],
        Labels: getWorkspaceContainerLabels(config),
        ExposedPorts: {
            [`${DOCKER_CODE_SERVER_PORT}/tcp`]: {},
        },
        HostConfig: {
            Binds: [
                `${getDockerBindSourcePath(workspacePath)}:/home/coder/project`,
                `${getDockerBindSourcePath(runtimePaths.userDataPath)}:/home/coder/.local/share/code-server`,
            ],
            PortBindings: {
                [`${DOCKER_CODE_SERVER_PORT}/tcp`]: [{ HostIp: '127.0.0.1', HostPort: `${port}` }],
            },
        },
        Cmd: [
            '--auth', 'none',
            '--bind-addr', `0.0.0.0:${DOCKER_CODE_SERVER_PORT}`,
            '--disable-telemetry',
            '--disable-update-check',
            '--user-data-dir', '/home/coder/.local/share/code-server',
            '/home/coder/project',
        ],
    });
    await workspaceContainer.start();
    log(`Docker workspace container '${containerName}' started from image '${imageName}'.`);
    const createdInspect = await workspaceContainer.inspect();
    const createdEntry = registerDockerWorkspaceRuntime(config.id, createdInspect, socketPath);
    if (!createdEntry) {
        return { success: false, error: 'DOCKER_PORT_BINDING_MISSING' };
    }
    const heartbeatError = await waitForWorkspaceHeartbeat({
        port: createdEntry.port,
        log,
        getFailureReason: async () => {
            const info = await workspaceContainer.inspect();
            return info.State.Running ? null : `DOCKER_CONTAINER_EXITED_${info.State.ExitCode}`;
        },
    });
    if (heartbeatError) {
        try {
            await workspaceContainer.remove({ force: true });
        }
        catch (_a) {
            // Best-effort cleanup after failed boot.
        }
        exports.dockerWorkspaces.delete(config.id);
        return { success: false, error: heartbeatError };
    }
    return {
        success: true,
        containerId: createdEntry.containerId,
        port: createdEntry.port,
        runtime: 'docker',
    };
}
/**
 * INTERNAL: Core provisioning logic with IDX support and auto-provisioning baseline.
 */
async function performProvisioning(config) {
    var _a, _b;
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
        const shouldPreferDockerRuntime = env_config_1.ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'docker'
            || (env_config_1.ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'auto' && process.platform === 'win32');
        if (shouldPreferDockerRuntime) {
            log(`Evaluating Docker runtime for workspace boot...`);
            const dockerResult = await startDockerWorkspace(config, runtimePaths, workspacePath, log);
            if (dockerResult) {
                if (dockerResult.success && idxConfig.onStart) {
                    log(`Executing background onStart lifecycle hooks...`);
                    idx_engine_1.IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
                }
                const finalDockerResult = {
                    ...dockerResult,
                    androidPort: config.withAndroidEmulator ? 6080 : undefined,
                };
                if (dockerResult.success) {
                    exports.provisioningBus.emit(`ready:${config.id}`, finalDockerResult);
                }
                else {
                    exports.provisioningBus.emit(`error:${config.id}`, finalDockerResult);
                }
                return finalDockerResult;
            }
            if (env_config_1.ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'docker') {
                const dockerUnavailableResult = {
                    success: false,
                    error: 'DOCKER_DAEMON_UNREACHABLE',
                    runtime: 'docker',
                };
                exports.provisioningBus.emit(`error:${config.id}`, dockerUnavailableResult);
                return dockerUnavailableResult;
            }
            log(`[INFO] Docker runtime unavailable. Falling back to native IDE process.`);
        }
        // 3. Spawn code-server natively
        const codeServerLaunch = resolveCodeServerLaunch();
        const port = findAvailablePort();
        const shellCommand = codeServerLaunch.command;
        const args = codeServerLaunch.args;
        const spawnCwd = (() => {
            try {
                return fs_1.default.realpathSync(workspacePath);
            }
            catch (_a) {
                return workspacePath;
            }
        })();
        const baseArgs = [
            '--auth', 'none',
            '--bind-addr', `127.0.0.1:${port}`,
            '--user-data-dir', userDataPath,
            '--disable-telemetry',
            '--disable-update-check',
            workspacePath,
        ];
        const spawnEnv = {
            ...process.env,
            HOME: workspacePath,
            npm_config_cache: runtimePaths.npmCachePath,
            npm_config_update_notifier: 'false',
        };
        delete spawnEnv.PORT;
        delete spawnEnv.SERVER_PORT;
        const launchArgs = [...args, ...baseArgs];
        log(`IDE launch prepared. Binary: ${shellCommand} | cwd: ${spawnCwd} | target: ${workspacePath}`);
        let child;
        try {
            child = (0, child_process_1.spawn)(shellCommand, launchArgs, {
                env: spawnEnv,
                cwd: spawnCwd,
                shell: false,
            });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`IDE_SPAWN_CONFIGURATION_REJECTED: ${errorMessage}`);
        }
        log(`Spawning VS Code Orchestrator via ${codeServerLaunch.label} (PID: ${child.pid})...`);
        let childExited = false;
        let childFailureReason = null;
        child.on('error', (err) => {
            childFailureReason = `IDE_BINARY_FAILURE: ${err.message}`;
            log(`[FATAL] IDE binary failure: ${err.message}`);
        });
        (_a = child.stdout) === null || _a === void 0 ? void 0 : _a.on('data', (data) => {
            const out = data.toString().trim();
            if (out.includes('listening on'))
                log(`[IDX:UP] ${out}`);
            else if (out.length > 0)
                log(`[IDE:CORE] ${out}`);
        });
        (_b = child.stderr) === null || _b === void 0 ? void 0 : _b.on('data', (data) => {
            const err = data.toString().trim();
            if (err.length > 0)
                log(`[IDE:ERR] ${err}`);
        });
        child.on('close', (code, signal) => {
            childExited = true;
            if (code !== 0 || signal) {
                childFailureReason = childFailureReason !== null && childFailureReason !== void 0 ? childFailureReason : `IDE_PROCESS_EXIT_${code !== null && code !== void 0 ? code : 'unknown'}${signal ? `_${signal}` : ''}`;
            }
            log(`[IDE:EXIT] IDE process died with code ${code} (Signal: ${signal})`);
            exports.nativeProcesses.delete(config.id);
        });
        exports.nativeProcesses.set(config.id, { kind: 'native', pid: child.pid, port, process: child });
        const handshakeError = await waitForWorkspaceHeartbeat({
            port,
            log,
            getFailureReason: async () => {
                if (!childExited) {
                    return null;
                }
                const rawFailureMessage = childFailureReason !== null && childFailureReason !== void 0 ? childFailureReason : 'IDE_PROCESS_EXITED_BEFORE_HANDSHAKE';
                return codeServerLaunch.usesNpx
                    ? `${rawFailureMessage}. code-server could not be bootstrapped via npx. Install code-server globally or set CODE_SERVER_BIN.`
                    : rawFailureMessage;
            },
        });
        if (handshakeError) {
            const entry = exports.nativeProcesses.get(config.id);
            if (entry) {
                entry.process.kill();
                exports.nativeProcesses.delete(config.id);
            }
            const errResult = { success: false, error: handshakeError };
            exports.provisioningBus.emit(`error:${config.id}`, errResult);
            return errResult;
        }
        if (idxConfig.onStart) {
            log(`Executing background onStart lifecycle hooks...`);
            idx_engine_1.IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
        }
        const finalResult = {
            success: true,
            containerId: `native-${config.id}`,
            androidPort: config.withAndroidEmulator ? 6080 : undefined,
            port,
            runtime: 'native',
        };
        exports.provisioningBus.emit(`ready:${config.id}`, finalResult);
        return finalResult;
    }
    catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log(`[FATAL] Provisioning pipeline collapsed: ${error}`);
        exports.nativeProcesses.delete(config.id);
        exports.dockerWorkspaces.delete(config.id);
        const errResult = { success: false, error: `PROVISIONING_FAILED: ${error}` };
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
    const existingRuntime = getWorkspaceRuntimeEntry(config.id);
    if (existingRuntime) {
        return {
            success: true,
            containerId: existingRuntime.kind === 'docker' ? existingRuntime.containerId : `native-${config.id}`,
            port: existingRuntime.port,
            runtime: existingRuntime.kind,
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
    var _a, _b, _c, _d, _e;
    const workspaceRoot = getWorkspaceRootPath();
    const runtimeRootPath = getRuntimeRootPath();
    console.log(`[BOOT] Probing filesystem segment: ${workspaceRoot} for existing sessions...`);
    try {
        const dockerResolution = await (0, client_1.resolveDockerClient)(env_config_1.ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
        if (dockerResolution) {
            const runningContainers = await dockerResolution.docker.listContainers({
                filters: {
                    label: [`${WORKSPACE_RUNTIME_LABEL}=${WORKSPACE_RUNTIME_LABEL_VALUE}`],
                },
            });
            for (const containerInfo of runningContainers) {
                const workspaceId = (_a = containerInfo.Labels) === null || _a === void 0 ? void 0 : _a[WORKSPACE_ID_LABEL];
                const port = getPublishedPortForListEntry(containerInfo);
                if (!workspaceId || !port) {
                    continue;
                }
                exports.dockerWorkspaces.set(workspaceId, {
                    kind: 'docker',
                    containerId: containerInfo.Id,
                    containerName: (_c = (_b = containerInfo.Names[0]) === null || _b === void 0 ? void 0 : _b.replace(/^\//, '')) !== null && _c !== void 0 ? _c : getWorkspaceContainerName(workspaceId),
                    imageName: containerInfo.Image,
                    port,
                    socketPath: dockerResolution.socketPath,
                });
                console.log(`[RECONNECT] Restored Docker workspace ${workspaceId} on port ${port}.`);
            }
        }
    }
    catch (error) {
        console.warn(`[RECONNECT:WARN] Docker workspace restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }
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
                const shortId = (_e = (_d = userDataMatch === null || userDataMatch === void 0 ? void 0 : userDataMatch[1]) !== null && _d !== void 0 ? _d : runtimePathMatch === null || runtimePathMatch === void 0 ? void 0 : runtimePathMatch[1]) !== null && _e !== void 0 ? _e : legacyPathMatch === null || legacyPathMatch === void 0 ? void 0 : legacyPathMatch[1];
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
                        kind: 'native',
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
    catch (_f) {
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
async function stopDockerWorkspace(id) {
    var _a;
    const dockerEntry = exports.dockerWorkspaces.get(id);
    const docker = dockerEntry
        ? (0, client_1.createDockerClient)(dockerEntry.socketPath)
        : (_a = (await (0, client_1.resolveDockerClient)(env_config_1.ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS))) === null || _a === void 0 ? void 0 : _a.docker;
    if (!docker) {
        exports.dockerWorkspaces.delete(id);
        return false;
    }
    const existingContainerInfo = await resolveExistingWorkspaceContainer(docker, id);
    if (!existingContainerInfo) {
        exports.dockerWorkspaces.delete(id);
        return false;
    }
    const container = docker.getContainer(existingContainerInfo.Id);
    try {
        const inspectInfo = await container.inspect();
        if (inspectInfo.State.Running) {
            await container.stop({ t: 10 });
        }
    }
    catch (_b) {
        // Container may already be stopped or missing.
    }
    try {
        await container.remove({ force: true });
    }
    catch (_c) {
        // Container may already be removed.
    }
    exports.dockerWorkspaces.delete(id);
    return true;
}
/**
 * Standardized stop method.
 */
async function stopWorkspaceContainer(id) {
    const nativeStopped = await stopNativeWorkspace(id);
    if (nativeStopped) {
        return { success: true };
    }
    const dockerStopped = await stopDockerWorkspace(id);
    return { success: dockerStopped };
}
/**
 * Modern Docker Manager class.
 */
class DockerManager {
    async getContainerStatus(id) {
        if (isWorkspaceRunning(id))
            return "running";
        return "stopped";
    }
    async stopContainer(id) {
        return (await stopWorkspaceContainer(id)).success;
    }
    async startWorkspace(config) {
        const result = await startWorkspaceContainer(config);
        return result.success;
    }
}
exports.DockerManager = DockerManager;
exports.dockerManager = new DockerManager();
