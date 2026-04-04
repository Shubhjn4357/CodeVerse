"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDockerAvailable = isDockerAvailable;
exports.getNativeWorkspacePort = getNativeWorkspacePort;
exports.getAndroidPort = getAndroidPort;
exports.startWorkspaceContainer = startWorkspaceContainer;
exports.stopWorkspaceContainer = stopWorkspaceContainer;
const dockerode_1 = __importDefault(require("dockerode"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const net_1 = __importDefault(require("net"));
/**
 * Helper to wait for an internal port to become available
 */
async function waitForPort(port, timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await new Promise((resolve, reject) => {
                const socket = net_1.default.createConnection(port, '127.0.0.1');
                socket.on('connect', () => {
                    socket.end();
                    resolve();
                });
                socket.on('error', reject);
                setTimeout(() => {
                    socket.destroy();
                    reject(new Error('timeout'));
                }, 500);
            });
            return true;
        }
        catch (_a) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return false;
}
// Connect to the local Docker daemon
const docker = new dockerode_1.default({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });
// Native process registry to manage non-docker workspaces (HF Fallback)
const nativeProcesses = new Map();
// Cache for isDockerAvailable result
let dockerAvailableCache = null;
async function isDockerAvailable() {
    if (dockerAvailableCache !== null)
        return dockerAvailableCache;
    try {
        await docker.ping();
        dockerAvailableCache = true;
        return true;
    }
    catch (_a) {
        dockerAvailableCache = false;
        return false;
    }
}
/**
 * Gets the internal port for a native workspace process.
 */
function getNativeWorkspacePort(id) {
    var _a;
    return (_a = nativeProcesses.get(id)) === null || _a === void 0 ? void 0 : _a.port;
}
function getAndroidPort(id) {
    return 6080;
}
/**
 * Native Mode Fallback: Starts code-server as a child process if Docker is missing.
 */
async function startNativeWorkspace(config) {
    const { id, userId, projectName, onLog = console.log } = config;
    if (nativeProcesses.has(id)) {
        const existing = nativeProcesses.get(id);
        return { success: true, containerId: `native-${id}`, port: String(existing.port) };
    }
    onLog("[SYSTEM] Docker not detected. Entering Native Isolation Mode...");
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
    const dataPath = path_1.default.resolve(process.cwd(), 'workspaces', userId, safeName);
    const port = 8080 + nativeProcesses.size;
    onLog(`[NATIVE] Booting code-server for ${projectName} on port ${port}...`);
    const child = (0, child_process_1.spawn)('code-server', [
        '--auth', 'none',
        '--port', String(port),
        '--disable-telemetry',
        '--bind-addr', `0.0.0.0:${port}`,
        dataPath
    ], {
        env: { ...process.env, HOME: dataPath },
        shell: true
    });
    child.stdout.on('data', (data) => onLog(`[NATIVE-STDOUT] ${data}`));
    child.stderr.on('data', (data) => onLog(`[NATIVE-STDERR] ${data}`));
    nativeProcesses.set(id, { process: child, port });
    // Wait for code-server to be ready
    onLog(`[NATIVE] Waiting for code-server to bind to 127.0.0.1:${port}...`);
    const ready = await waitForPort(port);
    if (!ready) {
        onLog(`[FATAL] code-server failed to bind within timeout.`);
    }
    else {
        onLog(`[READY] code-server is now listening on port ${port}.`);
    }
    return {
        success: true,
        containerId: `native-${id}`,
        port: String(port),
        androidContainerId: null,
        androidPort: null,
        appetizeUrl: null
    };
}
/**
 * Initializes and starts a Dockerized VS Code Code-Server instance for the given workspace ID.
 * Optionally spins up a sidecar Android emulator container.
 */
async function startWorkspaceContainer(config) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    const { id, userId, projectName, withAndroidEmulator = false, onLog = console.log } = config;
    // Check availability first
    if (!await isDockerAvailable()) {
        return startNativeWorkspace(config);
    }
    const containerName = `codeverse-workspace-${id}`;
    const androidContainerName = `codeverse-android-${id}`;
    let mainContainerId;
    let mainPort;
    let androidContainerId;
    let androidPort;
    let appetizeUrl = null;
    // --- 1. Main Workspace Container ---
    try {
        const existing = docker.getContainer(containerName);
        const info = await existing.inspect();
        if (!info.State.Running) {
            await existing.start();
        }
        mainContainerId = info.Id;
        mainPort = ((_b = (_a = info.NetworkSettings.Ports['8080/tcp']) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.HostPort) || '8080';
    }
    catch (e) {
        const error = e;
        if (error.statusCode !== 404) {
            throw new Error(`Failed to inspect container: ${error.message}`);
        }
        const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
        const dataPath = process.env.DATA_PATH || path_1.default.resolve(process.cwd(), 'workspaces', userId, safeName);
        const { buildWorkspaceImage } = await Promise.resolve().then(() => __importStar(require('./builder')));
        const { imageName, config: codeverseConfig } = await buildWorkspaceImage(id, dataPath, onLog);
        let workspaceSpecificEnv = [];
        if (codeverseConfig.env) {
            workspaceSpecificEnv = Object.entries(codeverseConfig.env).map(([k, v]) => `${k}=${v}`);
        }
        if ((_c = codeverseConfig.ios) === null || _c === void 0 ? void 0 : _c.appetizeUrl) {
            appetizeUrl = codeverseConfig.ios.appetizeUrl;
        }
        onLog(`[DOCKER] Spawning container ${containerName} using image ${imageName}...`);
        const container = await docker.createContainer({
            Image: imageName,
            name: containerName,
            Env: [
                `PUID=${((_d = process.getuid) === null || _d === void 0 ? void 0 : _d.call(process)) || 1000}`,
                `PGID=${((_e = process.getgid) === null || _e === void 0 ? void 0 : _e.call(process)) || 1000}`,
                `TZ=Etc/UTC`,
                ...workspaceSpecificEnv
            ],
            HostConfig: {
                Binds: [`${dataPath}:/home/coder/project`],
                PortBindings: {
                    '8080/tcp': [{ HostPort: '0' }]
                },
                RestartPolicy: { Name: 'unless-stopped' }
            }
        });
        await container.start();
        const inspect = await container.inspect();
        mainContainerId = inspect.Id;
        mainPort = (_g = (_f = inspect.NetworkSettings.Ports['8080/tcp']) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.HostPort;
    }
    // --- 2. Android Sidecar Container (Optional) ---
    if (withAndroidEmulator) {
        try {
            const existing = docker.getContainer(androidContainerName);
            const info = await existing.inspect();
            if (!info.State.Running) {
                await existing.start();
            }
            androidContainerId = info.Id;
            androidPort = ((_j = (_h = info.NetworkSettings.Ports['6080/tcp']) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.HostPort) || '6080';
        }
        catch (e) {
            const error = e;
            if (error.statusCode === 404) {
                onLog(`[DOCKER] Spawning Android sidecar ${androidContainerName}...`);
                const container = await docker.createContainer({
                    Image: 'shubhjn/codeverse-android:latest',
                    name: androidContainerName,
                    HostConfig: {
                        PortBindings: {
                            '6080/tcp': [{ HostPort: '0' }]
                        },
                        RestartPolicy: { Name: 'unless-stopped' },
                        Privileged: true
                    }
                });
                await container.start();
                const inspect = await container.inspect();
                androidContainerId = inspect.Id;
                androidPort = (_l = (_k = inspect.NetworkSettings.Ports['6080/tcp']) === null || _k === void 0 ? void 0 : _k[0]) === null || _l === void 0 ? void 0 : _l.HostPort;
            }
        }
    }
    // Polling for readiness
    if (mainPort) {
        onLog(`[DOCKER] Waiting for code-server to be ready at port ${mainPort}...`);
        await waitForPort(parseInt(mainPort));
    }
    return {
        success: true,
        containerId: mainContainerId,
        port: mainPort,
        androidContainerId,
        androidPort,
        appetizeUrl
    };
}
async function stopWorkspaceContainer(id) {
    if (nativeProcesses.has(id)) {
        const { process } = nativeProcesses.get(id);
        process.kill();
        nativeProcesses.delete(id);
        return { success: true };
    }
    try {
        const containerName = `codeverse-workspace-${id}`;
        const container = docker.getContainer(containerName);
        await container.stop();
        try {
            const androidContainerName = `codeverse-android-${id}`;
            const androidContainer = docker.getContainer(androidContainerName);
            await androidContainer.stop();
        }
        catch (_a) { }
        return { success: true };
    }
    catch (e) {
        return { success: false, error: e.message };
    }
}
