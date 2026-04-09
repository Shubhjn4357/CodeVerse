import Docker from "dockerode";

const DEFAULT_DOCKER_PROBE_TIMEOUT_MS = 4000;
const WINDOWS_DOCKER_SOCKET_CANDIDATES = [
    "//./pipe/docker_engine",
    "//./pipe/dockerDesktopLinuxEngine",
] as const;
const POSIX_DOCKER_SOCKET_CANDIDATES = [
    "/var/run/docker.sock",
] as const;

export interface DockerClientResolution {
    docker: Docker;
    socketPath: string;
}

export interface DockerAvailabilityResult {
    available: boolean;
    docker?: Docker;
    socketPath?: string;
    reason?: string;
}

function getConfiguredSocketPath(): string | null {
    const configuredSocketPath = process.env.DOCKER_SOCKET_PATH?.trim();
    return configuredSocketPath ? configuredSocketPath : null;
}

export function getDockerSocketCandidates(): string[] {
    const configuredSocketPath = getConfiguredSocketPath();
    const platformCandidates = process.platform === "win32"
        ? [...WINDOWS_DOCKER_SOCKET_CANDIDATES]
        : [...POSIX_DOCKER_SOCKET_CANDIDATES];

    return configuredSocketPath
        ? [configuredSocketPath, ...platformCandidates.filter((candidate) => candidate !== configuredSocketPath)]
        : platformCandidates;
}

export function createDockerClient(socketPath?: string): Docker {
    const resolvedSocketPath = socketPath ?? getDockerSocketCandidates()[0];
    return new Docker({ socketPath: resolvedSocketPath });
}

async function pingDockerClient(docker: Docker, timeoutMs: number): Promise<void> {
    let timeoutId: NodeJS.Timeout | null = null;

    try {
        await Promise.race([
            docker.ping().then(() => undefined),
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Docker ping timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    } finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}

export async function resolveDockerClient(timeoutMs: number = DEFAULT_DOCKER_PROBE_TIMEOUT_MS): Promise<DockerClientResolution | null> {
    for (const socketPath of getDockerSocketCandidates()) {
        const docker = createDockerClient(socketPath);
        try {
            await pingDockerClient(docker, timeoutMs);
            return { docker, socketPath };
        } catch {
            continue;
        }
    }

    return null;
}

export async function probeDockerAvailability(timeoutMs: number = DEFAULT_DOCKER_PROBE_TIMEOUT_MS): Promise<DockerAvailabilityResult> {
    const resolution = await resolveDockerClient(timeoutMs);
    if (!resolution) {
        return {
            available: false,
            reason: "Docker daemon unreachable",
        };
    }

    return {
        available: true,
        docker: resolution.docker,
        socketPath: resolution.socketPath,
    };
}
