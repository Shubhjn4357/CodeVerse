"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDockerSocketCandidates = getDockerSocketCandidates;
exports.createDockerClient = createDockerClient;
exports.resolveDockerClient = resolveDockerClient;
exports.probeDockerAvailability = probeDockerAvailability;
const dockerode_1 = __importDefault(require("dockerode"));
const DEFAULT_DOCKER_PROBE_TIMEOUT_MS = 4000;
const WINDOWS_DOCKER_SOCKET_CANDIDATES = [
    "//./pipe/docker_engine",
    "//./pipe/dockerDesktopLinuxEngine",
];
const POSIX_DOCKER_SOCKET_CANDIDATES = [
    "/var/run/docker.sock",
];
function getConfiguredSocketPath() {
    var _a;
    const configuredSocketPath = (_a = process.env.DOCKER_SOCKET_PATH) === null || _a === void 0 ? void 0 : _a.trim();
    return configuredSocketPath ? configuredSocketPath : null;
}
function getDockerSocketCandidates() {
    const configuredSocketPath = getConfiguredSocketPath();
    const platformCandidates = process.platform === "win32"
        ? [...WINDOWS_DOCKER_SOCKET_CANDIDATES]
        : [...POSIX_DOCKER_SOCKET_CANDIDATES];
    return configuredSocketPath
        ? [configuredSocketPath, ...platformCandidates.filter((candidate) => candidate !== configuredSocketPath)]
        : platformCandidates;
}
function createDockerClient(socketPath) {
    const resolvedSocketPath = socketPath !== null && socketPath !== void 0 ? socketPath : getDockerSocketCandidates()[0];
    return new dockerode_1.default({ socketPath: resolvedSocketPath });
}
async function pingDockerClient(docker, timeoutMs) {
    let timeoutId = null;
    try {
        await Promise.race([
            docker.ping().then(() => undefined),
            new Promise((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Docker ping timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timeoutId) {
            clearTimeout(timeoutId);
        }
    }
}
async function resolveDockerClient(timeoutMs = DEFAULT_DOCKER_PROBE_TIMEOUT_MS) {
    for (const socketPath of getDockerSocketCandidates()) {
        const docker = createDockerClient(socketPath);
        try {
            await pingDockerClient(docker, timeoutMs);
            return { docker, socketPath };
        }
        catch (_a) {
            continue;
        }
    }
    return null;
}
async function probeDockerAvailability(timeoutMs = DEFAULT_DOCKER_PROBE_TIMEOUT_MS) {
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
