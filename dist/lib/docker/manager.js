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
    // HF standard: use /app/workspaces or the resolved mount
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
    const dataPath = path_1.default.resolve(process.cwd(), 'workspaces', userId, safeName);
    // Simple port allocation (multi-workspace on HF isn't common but we handle it)
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
    // Give it a moment to bind
    await new Promise(resolve => setTimeout(resolve, 2000));
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
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
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
        // Map the local host path to the workspace
        const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
        const dataPath = process.env.DATA_PATH || path_1.default.resolve(process.cwd(), 'workspaces', userId, safeName);
        // --- WORKSPACE CONFIG LOGIC AND IMAGE BUILDING ---
        const { buildWorkspaceImage } = await Promise.resolve().then(() => __importStar(require('./builder')));
        // Let the builder handle parsing and creating the image
        const { imageName, config: codeverseConfig } = await buildWorkspaceImage(id, dataPath, onLog);
        let workspaceSpecificEnv = [];
        if (codeverseConfig.env) {
            workspaceSpecificEnv = Object.entries(codeverseConfig.env).map(([k, v]) => `${k}=${v}`);
        }
        if ((_c = codeverseConfig.ios) === null || _c === void 0 ? void 0 : _c.appetizeUrl) {
            appetizeUrl = codeverseConfig.ios.appetizeUrl;
        }
        const container = await docker.createContainer({
            Image: imageName,
            name: containerName,
            Env: [
                'AUTH=none',
                'PASSWORD=codeverse',
                'SUDO_PASSWORD=codeverse',
                'TZ=UTC',
                ...workspaceSpecificEnv
            ],
            Cmd: ['--auth', 'none'],
            HostConfig: {
                Binds: [
                    `${dataPath}:/config/workspace`
                ],
                PortBindings: {
                    '8080/tcp': [{ HostPort: '' }]
                },
                RestartPolicy: {
                    Name: 'unless-stopped'
                }
            },
            ExposedPorts: {
                '8080/tcp': {}
            }
        });
        await container.start();
        const info = await container.inspect();
        mainContainerId = container.id;
        mainPort = (_e = (_d = info.NetworkSettings.Ports['8080/tcp']) === null || _d === void 0 ? void 0 : _d[0]) === null || _e === void 0 ? void 0 : _e.HostPort;
        if (!mainPort) {
            throw new Error("Failed to map port 8080 for Code-Server");
        }
    }
    // --- 2. Optional Android sidecar container ---
    if (withAndroidEmulator) {
        const androidImage = 'budtmo/docker-android-x86-11.0';
        try {
            // 1. Check if it already exists
            const existing = docker.getContainer(androidContainerName);
            const info = await existing.inspect();
            if (!info.State.Running) {
                await existing.start();
            }
            androidContainerId = info.Id;
            androidPort = (_g = (_f = info.NetworkSettings.Ports['6080/tcp']) === null || _f === void 0 ? void 0 : _f[0]) === null || _g === void 0 ? void 0 : _g.HostPort;
        }
        catch (e) {
            const error = e;
            if (error.statusCode !== 404) {
                throw new Error(`Failed to inspect Android container: ${error.message}`);
            }
            // Ensure android image exists
            try {
                await docker.getImage(androidImage).inspect();
            }
            catch (_l) {
                console.log(`Pulling ${androidImage}... Note: this is a huge image.`);
                await new Promise((resolve, reject) => {
                    docker.pull(androidImage, (err, stream) => {
                        if (err)
                            return reject(err);
                        docker.modem.followProgress(stream, (err, res) => err ? reject(err) : resolve(res));
                    });
                });
            }
            // Start Android container
            const androidContainer = await docker.createContainer({
                Image: androidImage,
                name: androidContainerName,
                Env: ['EMULATOR_DEVICE=Samsung Galaxy S10', 'WEB_VNC=true'],
                HostConfig: {
                    Privileged: true, // Required for KVM usually, though some configs might work without
                    PortBindings: {
                        '6080/tcp': [{ HostPort: '' }] // Map noVNC port to dynamic host port
                    },
                    RestartPolicy: {
                        Name: 'unless-stopped'
                    }
                },
                ExposedPorts: {
                    '6080/tcp': {}
                }
            });
            await androidContainer.start();
            const info = await androidContainer.inspect();
            androidContainerId = androidContainer.id;
            androidPort = (_j = (_h = info.NetworkSettings.Ports['6080/tcp']) === null || _h === void 0 ? void 0 : _h[0]) === null || _j === void 0 ? void 0 : _j.HostPort;
        }
    }
    // However, if the container was ALREADY running (we short-circuited at the top), we need 
    // to read appetizeUrl manually as well.
    if (!appetizeUrl) {
        try {
            const fs = await Promise.resolve().then(() => __importStar(require('fs/promises')));
            const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
            const dataPath = process.env.DATA_PATH || path_1.default.resolve(process.cwd(), 'workspaces', userId, safeName);
            const configPath = path_1.default.join(dataPath, 'codeverse.json');
            const configContent = await fs.readFile(configPath, 'utf8');
            const customConfig = JSON.parse(configContent);
            if ((_k = customConfig.ios) === null || _k === void 0 ? void 0 : _k.appetizeUrl) {
                appetizeUrl = customConfig.ios.appetizeUrl;
            }
        }
        catch (_m) {
            // ignore if missing on running container
        }
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
/**
 * Stops and optionally removes a workspace container and its sidecars.
 */
async function stopWorkspaceContainer(id, remove = false) {
    // Check Native Mode first
    if (nativeProcesses.has(id)) {
        const { process: child } = nativeProcesses.get(id);
        child.kill();
        nativeProcesses.delete(id);
        return { success: true };
    }
    const containerName = `codeverse-workspace-${id}`;
    const androidContainerName = `codeverse-android-${id}`;
    let errorMsg = "";
    try {
        const container = docker.getContainer(containerName);
        await container.stop();
        if (remove) {
            await container.remove();
        }
    }
    catch (e) {
        const error = e;
        // Ignore 404s
        if (error.statusCode !== 404)
            errorMsg += `Workspace stop error: ${error.message}. `;
    }
    try {
        const androidContainer = docker.getContainer(androidContainerName);
        await androidContainer.stop();
        if (remove) {
            await androidContainer.remove();
        }
    }
    catch (e) {
        const error = e;
        if (error.statusCode !== 404)
            errorMsg += `Android stop error: ${error.message}. `;
    }
    if (errorMsg) {
        return { success: false, error: errorMsg };
    }
    return { success: true };
}
