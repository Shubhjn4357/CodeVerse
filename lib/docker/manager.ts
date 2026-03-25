import Docker from 'dockerode';
import path from 'path';

// Connect to the local Docker daemon
// This assumes Docker Desktop or Docker Engine is running locally and accessible
const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

export interface WorkspaceConfig {
    id: string;
    userId: string;
    projectName: string;
    image?: string; 
    withAndroidEmulator?: boolean;
    onLog?: (msg: string) => void;
}

/**
 * Initializes and starts a Dockerized VS Code Code-Server instance for the given workspace ID.
 * Optionally spins up a sidecar Android emulator container.
 */
export async function startWorkspaceContainer(config: WorkspaceConfig) {
    const { id, userId, projectName, withAndroidEmulator = false, onLog = console.log } = config;
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

        // Map the local host path to the workspace
        const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
        const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'workspaces', userId, safeName);

        // --- WORKSPACE CONFIG LOGIC AND IMAGE BUILDING ---
        const { buildWorkspaceImage } = await import('./builder');

        // Let the builder handle parsing and creating the image
        const { imageName, config: codeverseConfig } = await buildWorkspaceImage(id, dataPath, onLog);

        let workspaceSpecificEnv: string[] = [];
        if (codeverseConfig.env) {
            workspaceSpecificEnv = Object.entries(codeverseConfig.env).map(([k, v]) => `${k}=${v}`);
        }

        if (codeverseConfig.ios?.appetizeUrl) {
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
        mainPort = info.NetworkSettings.Ports['8080/tcp']?.[0]?.HostPort;

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
            androidPort = info.NetworkSettings.Ports['6080/tcp']?.[0]?.HostPort;
        } catch (e: unknown) {
            const error = e as Error & { statusCode?: number };
            if (error.statusCode !== 404) {
                throw new Error(`Failed to inspect Android container: ${error.message}`);
            }

            // Ensure android image exists
            try {
                await docker.getImage(androidImage).inspect();
            } catch {
                console.log(`Pulling ${androidImage}... Note: this is a huge image.`);
                await new Promise((resolve, reject) => {
                    docker.pull(androidImage, (err: unknown, stream: NodeJS.ReadableStream) => {
                        if (err) return reject(err);
                        docker.modem.followProgress(stream, (err: unknown, res: unknown[]) => err ? reject(err) : resolve(res));
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
            androidPort = info.NetworkSettings.Ports['6080/tcp']?.[0]?.HostPort;
        }
    }

    // However, if the container was ALREADY running (we short-circuited at the top), we need 
    // to read appetizeUrl manually as well.
    if (!appetizeUrl) {
        try {
            const fs = await import('fs/promises');
            const safeName = projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60);
            const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'workspaces', userId, safeName);
            const configPath = path.join(dataPath, 'codeverse.json');
            const configContent = await fs.readFile(configPath, 'utf8');
            const customConfig = JSON.parse(configContent);
            if (customConfig.ios?.appetizeUrl) {
                appetizeUrl = customConfig.ios.appetizeUrl;
            }
        } catch {
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
export async function stopWorkspaceContainer(id: string, remove = false) {
    const containerName = `codeverse-workspace-${id}`;
    const androidContainerName = `codeverse-android-${id}`;

    let errorMsg = "";

    try {
        const container = docker.getContainer(containerName);
        await container.stop();
        if (remove) {
            await container.remove();
        }
    } catch (e: unknown) {
        const error = e as Error & { statusCode?: number };
        // Ignore 404s
        if (error.statusCode !== 404) errorMsg += `Workspace stop error: ${error.message}. `;
    }

    try {
        const androidContainer = docker.getContainer(androidContainerName);
        await androidContainer.stop();
        if (remove) {
            await androidContainer.remove();
        }
    } catch (e: unknown) {
        const error = e as Error & { statusCode?: number };
        if (error.statusCode !== 404) errorMsg += `Android stop error: ${error.message}. `;
    }

    if (errorMsg) {
        return { success: false, error: errorMsg };
    }

    return { success: true };
}
