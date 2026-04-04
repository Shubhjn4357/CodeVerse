import Docker from 'dockerode';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import net from 'net';

/**
 * Helper to wait for an internal port to become available
 */
async function waitForPort(port: number, timeoutMs = 30000): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            await new Promise<void>((resolve, reject) => {
                const socket = net.createConnection(port, '127.0.0.1');
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
        } catch {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }
    return false;
}

// Connect to the local Docker daemon
const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

// Native process registry to manage non-docker workspaces (HF Fallback)
const nativeProcesses = new Map<string, { process: ChildProcess, port: number }>();

// Cache for isDockerAvailable result
let dockerAvailableCache: boolean | null = null;

export async function isDockerAvailable(): Promise<boolean> {
    if (dockerAvailableCache !== null) return dockerAvailableCache;
    try {
        await docker.ping();
        dockerAvailableCache = true;
        return true;
    } catch {
        dockerAvailableCache = false;
        return false;
    }
}

/**
 * Gets the internal port for a native workspace process.
 */
export function getNativeWorkspacePort(id: string): number | undefined {
    return nativeProcesses.get(id)?.port;
}

export function getAndroidPort(id: string): number | undefined {
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
 * Native Mode Fallback: Starts code-server as a child process if Docker is missing.
 */
async function startNativeWorkspace(config: WorkspaceConfig) {
    const { id, userId, projectName, onLog = console.log } = config;
    
    if (nativeProcesses.has(id)) {
        const existing = nativeProcesses.get(id)!;
        return { success: true, containerId: `native-${id}`, port: String(existing.port) };
    }

    onLog("[SYSTEM] Docker not detected. Entering Native Isolation Mode...");
    
    const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
    const dataPath = path.resolve(process.cwd(), 'workspaces', userId, safeName);
    
    const port = 8080 + nativeProcesses.size;
    
    onLog(`[NATIVE] Booting code-server for ${projectName} on port ${port}...`);

    const child = spawn('code-server', [
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
    } else {
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
export async function startWorkspaceContainer(config: WorkspaceConfig) {
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

    let appetizeUrl: string | null = null;

    // --- 1. Main Workspace Container ---
    try {
        const existing = docker.getContainer(containerName);
        const info = await existing.inspect();
        if (!info.State.Running) {
            await existing.start();
        }
        mainContainerId = info.Id;
        mainPort = info.NetworkSettings.Ports['8080/tcp']?.[0]?.HostPort || '8080';
    } catch (e: unknown) {
        const error = e as Error & { statusCode?: number };
        if (error.statusCode !== 404) {
            throw new Error(`Failed to inspect container: ${error.message}`);
        }

        const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
        const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'workspaces', userId, safeName);

        const { buildWorkspaceImage } = await import('./builder');
        const { imageName, config: codeverseConfig } = await buildWorkspaceImage(id, dataPath, onLog);

        let workspaceSpecificEnv: string[] = [];
        if (codeverseConfig.env) {
            workspaceSpecificEnv = Object.entries(codeverseConfig.env).map(([k, v]) => `${k}=${v}`);
        }

        if (codeverseConfig.ios?.appetizeUrl) {
            appetizeUrl = codeverseConfig.ios.appetizeUrl;
        }

        onLog(`[DOCKER] Spawning container ${containerName} using image ${imageName}...`);
        const container = await docker.createContainer({
            Image: imageName,
            name: containerName,
            Env: [
                `PUID=${process.getuid?.() || 1000}`,
                `PGID=${process.getgid?.() || 1000}`,
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
        mainPort = inspect.NetworkSettings.Ports['8080/tcp']?.[0]?.HostPort;
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
            androidPort = info.NetworkSettings.Ports['6080/tcp']?.[0]?.HostPort || '6080';
        } catch (e: unknown) {
            const error = e as Error & { statusCode?: number };
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
                androidPort = inspect.NetworkSettings.Ports['6080/tcp']?.[0]?.HostPort;
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

export async function stopWorkspaceContainer(id: string) {
    if (nativeProcesses.has(id)) {
        const { process } = nativeProcesses.get(id)!;
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
        } catch {}
        
        return { success: true };
    } catch (e) {
        return { success: false, error: (e as Error).message };
    }
}
