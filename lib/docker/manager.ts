import Docker from 'dockerode';
import path from 'path';

// Connect to the local Docker daemon
// This assumes Docker Desktop or Docker Engine is running locally and accessible
const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

export interface WorkspaceConfig {
    id: string;
    image?: string; // e.g., 'codercom/code-server:latest'
    withAndroidEmulator?: boolean;
}

/**
 * Initializes and starts a Dockerized VS Code Code-Server instance for the given workspace ID.
 * Optionally spins up a sidecar Android emulator container.
 */
export async function startWorkspaceContainer(config: WorkspaceConfig) {
    const { id, image = 'codercom/code-server:latest', withAndroidEmulator = false } = config;
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
        const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'data/projects', id);

        // --- WORKSPACE CONFIG (codeverse.json) LOGIC ---
        const configPath = path.join(dataPath, 'codeverse.json');
        let workspaceSpecificEnv: string[] = [];
        let aptPackages: string[] = [];
        let npmPackages: string[] = [];

        try {
            const fs = await import('fs/promises');
            // Ensure project directory exists
            await fs.mkdir(dataPath, { recursive: true });

            try {
                const configContent = await fs.readFile(configPath, 'utf8');
                const customConfig = JSON.parse(configContent);
                if (customConfig.env) {
                    workspaceSpecificEnv = Object.entries(customConfig.env).map(([k, v]) => `${k}=${v}`);
                }
                if (Array.isArray(customConfig.packages?.apt)) {
                    aptPackages = customConfig.packages.apt;
                }
                if (Array.isArray(customConfig.packages?.npm)) {
                    npmPackages = customConfig.packages.npm;
                }
                if (customConfig.ios?.appetizeUrl) {
                    appetizeUrl = customConfig.ios.appetizeUrl;
                }
            } catch (err: unknown) {
                const fsErr = err as Error & { code?: string };
                if (fsErr.code === 'ENOENT') {
                    // Create default config if it doesn't exist
                    const defaultConfig = {
                        "env": { "PORT": "3000" },
                        "packages": {
                            "apt": [],
                            "npm": []
                        },
                        "ios": {
                            "appetizeUrl": ""
                        }
                    };
                    await fs.writeFile(configPath, JSON.stringify(defaultConfig, null, 2));
                } else {
                    console.error("Error reading codeverse.json:", err);
                }
            }
        } catch (fsErr) {
            console.error("FS Error setting up workspace dir:", fsErr);
        }

        // Ensure image exists
        try {
            await docker.getImage(image).inspect();
            console.log(`Image ${image} exists locally.`);
        } catch {
            console.log(`Pulling ${image}... This may take a minute or two.`);
            await new Promise((resolve, reject) => {
                docker.pull(image, (err: unknown, stream: NodeJS.ReadableStream) => {
                    if (err) return reject(err);
                    docker.modem.followProgress(stream, (err: unknown, res: unknown[]) => err ? reject(err) : resolve(res));
                });
            });
        }

        const container = await docker.createContainer({
            Image: image,
            name: containerName,
            Env: [
                'AUTH=none',
                'PASSWORD=codeverse',
                'SUDO_PASSWORD=codeverse',
                'TZ=UTC',
                ...workspaceSpecificEnv // Inject custom user environment variables
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

        // --- POST-BOOT PACKAGE INSTALLATION ---
        if (aptPackages.length > 0 || npmPackages.length > 0) {
            console.log(`Provisioning dynamic packages for ${id}...`);

            if (aptPackages.length > 0) {
                // To run sudo apt, we'd ideally pipe the coded password or run exec as root.
                // Assuming root User for exec simplifies this.
                const rootExec = await container.exec({
                    Cmd: ['bash', '-c', `apt-get update && apt-get install -y ${aptPackages.join(' ')}`],
                    User: 'root',
                    AttachStdout: true,
                    AttachStderr: true,
                });
                await rootExec.start({ Detach: false });
            }

            if (npmPackages.length > 0) {
                const rootExec = await container.exec({
                    Cmd: ['bash', '-c', `npm install -g ${npmPackages.join(' ')}`],
                    User: 'root',
                    AttachStdout: true,
                    AttachStderr: true,
                });
                await rootExec.start({ Detach: false });
            }
        }

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
            const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'data/projects', id);
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
