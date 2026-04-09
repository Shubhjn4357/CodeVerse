import fs from 'fs';
import { spawn, ChildProcess, execFileSync, execSync } from 'child_process';
import path from 'path';
import Docker from 'dockerode';
import { EventEmitter } from 'events';
import { IdxEngine } from '../idx/idx-engine';
import { buildWorkspaceImage, loadWorkspaceConfig, type CodeverseConfig } from './builder';
import { createDockerClient, probeDockerAvailability, resolveDockerClient } from './client';
import { HFStorage } from '../hf/storage';
import { resolveSafeProjectPath } from '../fs/isolation';
import { ENV_CONFIG } from '../env-config';

/**
 * Lighter process interface for reconnected sessions that don't have a full Node.js ChildProcess object.
 * We only require 'kill' and 'pid' for the watchdog and management tasks.
 */
type WorkspaceProcess = Pick<ChildProcess, 'kill' | 'pid'> & {
    on?: ChildProcess['on'];
    stdout?: ChildProcess['stdout'];
    stderr?: ChildProcess['stderr'];
};

type WorkspaceRuntimeKind = 'native' | 'docker';

interface NativeWorkspaceRuntimeEntry {
    kind: 'native';
    pid: number;
    port: number;
    process: WorkspaceProcess;
}

interface DockerWorkspaceRuntimeEntry {
    kind: 'docker';
    containerId: string;
    containerName: string;
    imageName: string;
    port: number;
    socketPath: string;
}

type WorkspaceRuntimeEntry = NativeWorkspaceRuntimeEntry | DockerWorkspaceRuntimeEntry;

/**
 * Registry for native workspace processes (IDE instances running outside Docker)
 * Map<workspaceId, { pid: number; port: number; process: WorkspaceProcess }>
 */
export const nativeProcesses = new Map<string, NativeWorkspaceRuntimeEntry>();
export const dockerWorkspaces = new Map<string, DockerWorkspaceRuntimeEntry>();

/**
 * Internal Provisioning Bus to multicast logs to concurrent clients.
 */
class ProvisioningBus extends EventEmitter {}
export const provisioningBus = new ProvisioningBus();

/**
 * Map to track active provisioning promises to prevent redundant creation loops.
 */
export const pendingProvisioning = new Map<string, Promise<WorkspaceOperationResult>>();

interface WorkspaceRuntimePaths {
    fullWorkspaceId: string;
    shortWorkspaceId: string;
    projectPath: string;
    runtimeRootPath: string;
    runtimeWorkspacePath: string;
    userDataPath: string;
    metadataPath: string;
    npmCachePath: string;
}

interface CodeServerLaunch {
    command: string;
    args: string[];
    label: string;
    usesNpx: boolean;
    useShell: boolean;
}

const SHORT_WORKSPACE_ID_LENGTH = 8;
const RUNTIME_ROOT_DIR_NAME = '.codeverse-runtime';
const DOCKER_CODE_SERVER_PORT = 8080;
const WORKSPACE_CONTAINER_NAME_PREFIX = 'codeverse-workspace-';
const WORKSPACE_RUNTIME_LABEL = 'codeverse.runtime';
const WORKSPACE_RUNTIME_LABEL_VALUE = 'workspace';
const WORKSPACE_ID_LABEL = 'codeverse.workspace.id';

function getWorkspaceRootPath(): string {
    return ENV_CONFIG.WORKSPACE_ROOT;
}

function getRuntimeRootPath(): string {
    return path.join(/*turbopackIgnore: true*/ getWorkspaceRootPath(), RUNTIME_ROOT_DIR_NAME);
}

function getShortWorkspaceId(id: string): string {
    return id.slice(0, SHORT_WORKSPACE_ID_LENGTH);
}

function isPathWithinParent(parentPath: string, targetPath: string): boolean {
    const normalizedParent = path.resolve(parentPath);
    const normalizedTarget = path.resolve(targetPath);

    return normalizedTarget === normalizedParent || normalizedTarget.startsWith(`${normalizedParent}${path.sep}`);
}

function getNativeWorkspaceEntry(id: string): NativeWorkspaceRuntimeEntry | undefined {
    const directEntry = nativeProcesses.get(id);
    if (directEntry) {
        return directEntry;
    }

    const prefixedKey = Array.from(nativeProcesses.keys()).find((key) => id.startsWith(key));
    return prefixedKey ? nativeProcesses.get(prefixedKey) : undefined;
}

function getDockerWorkspaceEntry(id: string): DockerWorkspaceRuntimeEntry | undefined {
    return dockerWorkspaces.get(id);
}

function getWorkspaceRuntimeEntry(id: string): WorkspaceRuntimeEntry | undefined {
    return getNativeWorkspaceEntry(id)
        ?? getDockerWorkspaceEntry(id);
}

function getWorkspaceContainerName(id: string): string {
    return `${WORKSPACE_CONTAINER_NAME_PREFIX}${id}`;
}

function getWorkspaceContainerLabels(config: Pick<WorkspaceConfig, 'id' | 'projectName' | 'userId'>): Record<string, string> {
    return {
        [WORKSPACE_RUNTIME_LABEL]: WORKSPACE_RUNTIME_LABEL_VALUE,
        [WORKSPACE_ID_LABEL]: config.id,
        'codeverse.workspace.project': config.projectName,
        'codeverse.workspace.user': config.userId,
    };
}

function getDockerBindSourcePath(hostPath: string): string {
    return path.resolve(hostPath);
}

function hasCustomDockerPackages(config: CodeverseConfig): boolean {
    return Boolean(
        config.packages?.apt?.length
        || config.packages?.npm?.length
    );
}

function getWorkspaceEnvironment(config: CodeverseConfig): string[] {
    return Object.entries(config.env ?? {}).map(([key, value]) => `${key}=${value}`);
}

async function ensureDockerImageAvailable(docker: Docker, imageName: string, log: (msg: string) => void): Promise<void> {
    try {
        await docker.getImage(imageName).inspect();
        return;
    } catch {
        log(`Pulling Docker image '${imageName}'...`);
    }

    await new Promise<void>((resolve, reject) => {
        docker.pull(imageName, (error: Error | null, stream?: NodeJS.ReadableStream) => {
            if (error || !stream) {
                reject(error ?? new Error(`Failed to pull Docker image '${imageName}'`));
                return;
            }

            docker.modem.followProgress(
                stream,
                (progressError: Error | null) => {
                    if (progressError) {
                        reject(progressError);
                        return;
                    }

                    resolve();
                },
                (event: { status?: string; id?: string }) => {
                    if (event.status) {
                        const progressLabel = event.id ? `${event.id}: ${event.status}` : event.status;
                        log(`[DOCKER:PULL] ${progressLabel}`);
                    }
                }
            );
        });
    });
}

function getPublishedPortForContainerInfo(info: Docker.ContainerInspectInfo): number | undefined {
    const bindings = info.NetworkSettings?.Ports?.[`${DOCKER_CODE_SERVER_PORT}/tcp`];
    const hostPort = bindings?.[0]?.HostPort;
    if (!hostPort) {
        return undefined;
    }

    const parsedPort = Number.parseInt(hostPort, 10);
    return Number.isFinite(parsedPort) ? parsedPort : undefined;
}

function getPublishedPortForListEntry(containerInfo: Docker.ContainerInfo): number | undefined {
    const publishedPort = containerInfo.Ports.find((portInfo) => portInfo.PrivatePort === DOCKER_CODE_SERVER_PORT && portInfo.PublicPort)?.PublicPort;
    return publishedPort && Number.isFinite(publishedPort) ? publishedPort : undefined;
}

async function resolveWorkspaceRuntimePaths(config: Pick<WorkspaceConfig, 'id' | 'userId' | 'projectName'>): Promise<WorkspaceRuntimePaths> {
    const shortWorkspaceId = getShortWorkspaceId(config.id);
    const runtimeRootPath = getRuntimeRootPath();
    const projectPath = await resolveSafeProjectPath(config.userId, config.projectName);

    return {
        fullWorkspaceId: config.id,
        shortWorkspaceId,
        projectPath,
        runtimeRootPath,
        runtimeWorkspacePath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, shortWorkspaceId),
        userDataPath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}-userdata`),
        metadataPath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, `${shortWorkspaceId}.id`),
        npmCachePath: path.join(/*turbopackIgnore: true*/ runtimeRootPath, 'npm-cache'),
    };
}

function ensureRuntimeWorkspacePath(paths: WorkspaceRuntimePaths, log?: (msg: string) => void): string {
    if (!fs.existsSync(paths.projectPath)) {
        fs.mkdirSync(paths.projectPath, { recursive: true });
    }

    fs.mkdirSync(paths.runtimeRootPath, { recursive: true });
    fs.mkdirSync(paths.userDataPath, { recursive: true });
    fs.mkdirSync(paths.npmCachePath, { recursive: true });

    if (fs.existsSync(paths.runtimeWorkspacePath)) {
        try {
            const existingTargetPath = fs.realpathSync(paths.runtimeWorkspacePath);
            if (path.resolve(existingTargetPath) === path.resolve(paths.projectPath)) {
                fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
                return paths.runtimeWorkspacePath;
            }
        } catch {
            // Fall through and repair the runtime alias.
        }

        if (!isPathWithinParent(paths.runtimeRootPath, paths.runtimeWorkspacePath)) {
            throw new Error(`Unsafe runtime workspace path: ${paths.runtimeWorkspacePath}`);
        }

        fs.rmSync(paths.runtimeWorkspacePath, { recursive: true, force: true });
    }

    try {
        fs.symlinkSync(paths.projectPath, paths.runtimeWorkspacePath, process.platform === 'win32' ? 'junction' : 'dir');
        fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log?.(`Bound runtime alias ${paths.shortWorkspaceId} -> ${paths.projectPath}`);
        return paths.runtimeWorkspacePath;
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        fs.writeFileSync(paths.metadataPath, paths.fullWorkspaceId);
        log?.(`[WARN] Runtime alias creation failed. Falling back to direct project path: ${errorMessage}`);
        return paths.projectPath;
    }
}

/**
 * Checks if a native workspace is currently running.
 * Supports fuzzy matching for reconnected sessions that might use a prefix key.
 */
export function isNativeWorkspaceRunning(id: string): boolean {
    if (pendingProvisioning.has(id)) return false;
    return getNativeWorkspaceEntry(id) !== undefined;
}

export function isWorkspaceRunning(id: string): boolean {
    if (pendingProvisioning.has(id)) return false;
    return getWorkspaceRuntimeEntry(id) !== undefined;
}

/**
 * Returns the current runtime status of a workspace.
 */
export function getWorkspaceStatus(id: string): "ready" | "provisioning" | "offline" {
    if (pendingProvisioning.has(id)) return "provisioning";
    if (getWorkspaceRuntimeEntry(id)) return "ready";
    return "offline";
}

/**
 * Helper for async delays.
 */
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Finds an available port in the 8100-9000 range.
 */
function findAvailablePort(): number {
    const occupiedPorts = [
        ...Array.from(nativeProcesses.values()).map((entry) => entry.port),
        ...Array.from(dockerWorkspaces.values()).map((entry) => entry.port),
    ];
    let port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    while (occupiedPorts.includes(port)) {
        port = Math.floor(Math.random() * (9000 - 8100) + 8100);
    }
    return port;
}

function resolveExecutableOnPath(candidates: string[]): string | null {
    const locatorCommand = process.platform === 'win32' ? 'where' : 'which';

    for (const candidate of candidates) {
        try {
            const output = execFileSync(locatorCommand, [candidate], {
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
        } catch {
            // Fall through to the next candidate.
        }
    }

    return null;
}

function resolveLocalToolNodeBinary(): string | null {
    if (ENV_CONFIG.CODE_SERVER_NODE_BIN && fs.existsSync(ENV_CONFIG.CODE_SERVER_NODE_BIN)) {
        return ENV_CONFIG.CODE_SERVER_NODE_BIN;
    }

    const localToolsRoot = path.join(process.cwd(), '.codeverse-tools');
    if (!fs.existsSync(localToolsRoot)) {
        return null;
    }

    const directNodePath = path.join(localToolsRoot, 'node', 'node.exe');
    if (fs.existsSync(directNodePath)) {
        return directNodePath;
    }

    const nodeDirs = fs.readdirSync(localToolsRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^node-v22\..*-win-x64$/i.test(entry.name))
        .map((entry) => path.join(localToolsRoot, entry.name, 'node.exe'));

    return nodeDirs.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function resolveLocalCodeServerEntry(): string | null {
    if (ENV_CONFIG.CODE_SERVER_ENTRY && fs.existsSync(ENV_CONFIG.CODE_SERVER_ENTRY)) {
        return ENV_CONFIG.CODE_SERVER_ENTRY;
    }

    const localEntryPath = path.join(process.cwd(), '.codeverse-tools', 'code-server', 'node_modules', 'code-server', 'out', 'node', 'entry.js');
    return fs.existsSync(localEntryPath) ? localEntryPath : null;
}

function getCurrentNodeMajorVersion(): number {
    const [majorVersion] = process.versions.node.split('.');
    return Number.parseInt(majorVersion ?? '0', 10);
}

function resolveCodeServerLaunch(): CodeServerLaunch {
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

        const npxCliPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js');
        if (fs.existsSync(npxCliPath)) {
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
export async function isDockerAvailable(): Promise<{ available: boolean; reason?: string }> {
    if (process.env.SIMULATE_HF === 'true') {
        return { available: false, reason: "Hugging Face Simulation Mode (Artificial Sandbox)" };
    }
    
    if (process.env.SPACE_ID) {
        return { available: false, reason: "Hugging Face Space (Native Sandboxed)" };
    }

    const availability = await probeDockerAvailability(ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
    return availability.available
        ? { available: true }
        : { available: false, reason: availability.reason ?? "Docker daemon unreachable" };
}

/**
 * Stops a native workspace process.
 */
export async function stopNativeWorkspace(id: string): Promise<boolean> {
    const entry = nativeProcesses.get(id);
    if (entry) {
        try {
            entry.process.kill();
            nativeProcesses.delete(id);
            return true;
        } catch (e) {
            console.error(`[MANAGER] Failed to kill code-server ${id}:`, e);
            nativeProcesses.delete(id);
        }
    }
    return false;
}

/**
 * Gets the internal port for a native workspace process.
 * Supports fuzzy matching for reconnected sessions.
 */
export function getNativeWorkspacePort(id: string): number | undefined {
    if (pendingProvisioning.has(id)) {
        return undefined;
    }

    return getNativeWorkspaceEntry(id)?.port;
}

export function getWorkspacePort(id: string): number | undefined {
    if (pendingProvisioning.has(id)) {
        return undefined;
    }

    return getWorkspaceRuntimeEntry(id)?.port;
}

/**
 * Returns the global unified Android VNC port.
 */
export function getAndroidPort(): number | undefined {
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
 * Results for workspace operations.
 */
export interface WorkspaceOperationResult {
    success: boolean;
    containerId?: string;
    androidContainerId?: string;
    androidPort?: number;
    port?: string | number;
    appetizeUrl?: string;
    error?: string;
    runtime?: WorkspaceRuntimeKind;
    status?: 'hydrating' | 'ready';
}

/**
 * PREDICTIVE HYDRATION: Pre-warms Nix profile and SDKs.
 */
export async function prewarmWorkspace(config: WorkspaceConfig): Promise<void> {
    const runtimePaths = await resolveWorkspaceRuntimePaths(config);
    const workspacePath = ensureRuntimeWorkspacePath(runtimePaths);

    const idxConfig = IdxEngine.getIdxConfig(workspacePath);
    if (idxConfig) {
        // Run Nix sync in background if not already warmed
        IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => {
            provisioningBus.emit(`log:${config.id}`, `[HYDRATE] ${msg}`);
        });
    }
}

interface WorkspaceHeartbeatOptions {
    port: number;
    log: (msg: string) => void;
    getFailureReason?: () => Promise<string | null>;
}

async function waitForWorkspaceHeartbeat({ port, log, getFailureReason }: WorkspaceHeartbeatOptions): Promise<string | null> {
    let attempts = 0;

    while (attempts < 60) {
        const failureReason = await getFailureReason?.();
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
        } catch {
            if (attempts % 5 === 0) log(`[INFO] Scanning for IDE heartbeat... (Attempt ${attempts}/60)`);
            if (attempts === 15) {
                const bootstrapHint = ENV_CONFIG.IDX_NIX_SYNC_ENABLED
                    ? 'Nix evaluation in progress. Cold boot detected.'
                    : 'IDE bootstrap still in progress.';
                log(`[INFO] ${bootstrapHint}`);
            }
            if (attempts === 45) log(`[WARN] Handshake threshold approaching. IDE core high load.`);
        } finally {
            clearTimeout(timeoutId);
        }

        await delay(1000);
        attempts++;
    }

    log(`[FATAL] Handshake timeout on 127.0.0.1:${port}.`);
    return "IDE_HANDSHAKE_TIMEOUT";
}

async function resolveExistingWorkspaceContainer(docker: Docker, workspaceId: string): Promise<Docker.ContainerInfo | null> {
    const containerName = getWorkspaceContainerName(workspaceId);
    const containers = await docker.listContainers({
        all: true,
        filters: {
            name: [containerName],
        },
    });

    const exactMatch = containers.find((container) => container.Names.some((name) => name === `/${containerName}`));
    return exactMatch ?? containers[0] ?? null;
}

function registerDockerWorkspaceRuntime(
    workspaceId: string,
    containerInfo: Docker.ContainerInspectInfo,
    socketPath: string
): DockerWorkspaceRuntimeEntry | null {
    const publishedPort = getPublishedPortForContainerInfo(containerInfo);
    if (!publishedPort) {
        return null;
    }

    const containerEntry: DockerWorkspaceRuntimeEntry = {
        kind: 'docker',
        containerId: containerInfo.Id,
        containerName: containerInfo.Name.replace(/^\//, ''),
        imageName: containerInfo.Config.Image,
        port: publishedPort,
        socketPath,
    };

    dockerWorkspaces.set(workspaceId, containerEntry);
    return containerEntry;
}

async function startDockerWorkspace(
    config: WorkspaceConfig,
    runtimePaths: WorkspaceRuntimePaths,
    workspacePath: string,
    log: (msg: string) => void
): Promise<WorkspaceOperationResult | null> {
    const dockerResolution = await resolveDockerClient(ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
    if (!dockerResolution) {
        return null;
    }

    const { docker, socketPath } = dockerResolution;
    const workspaceConfig = await loadWorkspaceConfig(workspacePath);
    const containerName = getWorkspaceContainerName(config.id);
    const existingContainerInfo = await resolveExistingWorkspaceContainer(docker, config.id);

    if (existingContainerInfo) {
        const existingContainer = docker.getContainer(existingContainerInfo.Id);
        const existingInspect = await existingContainer.inspect();

        if (!existingInspect.State.Running) {
            log(`Restarting existing Docker workspace container '${containerName}'...`);
            await existingContainer.start();
        } else {
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
            dockerWorkspaces.delete(config.id);
            return { success: false, error: heartbeatError };
        }

        return {
            success: true,
            containerId: runningEntry.containerId,
            port: runningEntry.port,
            runtime: 'docker',
        };
    }

    let imageName = ENV_CONFIG.DOCKER_WORKSPACE_BASE_IMAGE;
    if (hasCustomDockerPackages(workspaceConfig)) {
        const buildResult = await buildWorkspaceImage(config.id, workspacePath, log, docker);
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
        } catch {
            // Best-effort cleanup after failed boot.
        }
        dockerWorkspaces.delete(config.id);
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
async function performProvisioning(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    const log = (msg: string) => { 
        if (config.onLog) config.onLog(`[IDX:ENGINE] ${msg}`);
        provisioningBus.emit(`log:${config.id}`, msg);
    };

    try {
        log(`Provisioning hermetic environment for '${config.projectName}'...`);
        
        // 0. HF PERSISTENCE: Restore profile from Dataset if available
        try {
            await HFStorage.syncFromDataset((msg) => log(msg));
        } catch (e) {
            log(`[WARN] Persistent profile restoration failed: ${e instanceof Error ? e.message : String(e)}. Proceeding with clean environment.`);
        }

        // 1. Prepare Workspace Directory
        const runtimePaths = await resolveWorkspaceRuntimePaths(config);
        const workspacePath = ensureRuntimeWorkspacePath(runtimePaths, log);
        const userDataPath = runtimePaths.userDataPath;

        // 2. IDX Engine: Sync Environment
        const idxConfig = IdxEngine.getIdxConfig(workspacePath);
        log(`Declarative config detected (Packages: ${idxConfig.packages.length}). Initializing synchronization...`);

        await IdxEngine.syncNixEnvironment(workspacePath, idxConfig, (msg) => log(msg));

        const flagPath = path.join(/*turbopackIgnore: true*/ workspacePath, '.idx-created');
        if (!fs.existsSync(flagPath)) {
            if (idxConfig.onCreate) {
                log(`Executing onCreate lifecycle hook...`);
                await IdxEngine.runHook(workspacePath, 'onCreate', idxConfig.onCreate, (msg) => log(msg));
            }
            fs.writeFileSync(flagPath, new Date().toISOString());
        }

        const shouldPreferDockerRuntime = ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'docker'
            || (ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'auto' && process.platform === 'win32');
        if (shouldPreferDockerRuntime) {
            log(`Evaluating Docker runtime for workspace boot...`);
            const dockerResult = await startDockerWorkspace(config, runtimePaths, workspacePath, log);
            if (dockerResult) {
                if (dockerResult.success && idxConfig.onStart) {
                    log(`Executing background onStart lifecycle hooks...`);
                    IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
                }

                const finalDockerResult: WorkspaceOperationResult = {
                    ...dockerResult,
                    androidPort: config.withAndroidEmulator ? 6080 : undefined,
                };

                if (dockerResult.success) {
                    provisioningBus.emit(`ready:${config.id}`, finalDockerResult);
                } else {
                    provisioningBus.emit(`error:${config.id}`, finalDockerResult);
                }

                return finalDockerResult;
            }

            if (ENV_CONFIG.WORKSPACE_RUNTIME_PREFERENCE === 'docker') {
                const dockerUnavailableResult: WorkspaceOperationResult = {
                    success: false,
                    error: 'DOCKER_DAEMON_UNREACHABLE',
                    runtime: 'docker',
                };
                provisioningBus.emit(`error:${config.id}`, dockerUnavailableResult);
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
                return fs.realpathSync(workspacePath);
            } catch {
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

        const spawnEnv: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: workspacePath,
            npm_config_cache: runtimePaths.npmCachePath,
            npm_config_update_notifier: 'false',
        };
        delete spawnEnv.PORT;
        delete spawnEnv.SERVER_PORT;

        const launchArgs = [...args, ...baseArgs];

        log(`IDE launch prepared. Binary: ${shellCommand} | cwd: ${spawnCwd} | target: ${workspacePath}`);

        let child: ChildProcess;
        try {
            child = spawn(shellCommand, launchArgs, {
                env: spawnEnv,
                cwd: spawnCwd,
                shell: false,
            });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`IDE_SPAWN_CONFIGURATION_REJECTED: ${errorMessage}`);
        }

        log(`Spawning VS Code Orchestrator via ${codeServerLaunch.label} (PID: ${child.pid})...`);
        let childExited = false;
        let childFailureReason: string | null = null;

        child.on('error', (err) => {
            childFailureReason = `IDE_BINARY_FAILURE: ${err.message}`;
            log(`[FATAL] IDE binary failure: ${err.message}`);
        });
        child.stdout?.on('data', (data) => {
            const out = data.toString().trim();
            if (out.includes('listening on')) log(`[IDX:UP] ${out}`);
            else if (out.length > 0) log(`[IDE:CORE] ${out}`);
        });

        child.stderr?.on('data', (data) => {
            const err = data.toString().trim();
            if (err.length > 0) log(`[IDE:ERR] ${err}`);
        });

        child.on('close', (code, signal) => {
            childExited = true;
            if (code !== 0 || signal) {
                childFailureReason = childFailureReason ?? `IDE_PROCESS_EXIT_${code ?? 'unknown'}${signal ? `_${signal}` : ''}`;
            }
            log(`[IDE:EXIT] IDE process died with code ${code} (Signal: ${signal})`);
            nativeProcesses.delete(config.id);
        });

        nativeProcesses.set(config.id, { kind: 'native', pid: child.pid!, port, process: child });

        const handshakeError = await waitForWorkspaceHeartbeat({
            port,
            log,
            getFailureReason: async () => {
                if (!childExited) {
                    return null;
                }

                const rawFailureMessage = childFailureReason ?? 'IDE_PROCESS_EXITED_BEFORE_HANDSHAKE';
                return codeServerLaunch.usesNpx
                    ? `${rawFailureMessage}. code-server could not be bootstrapped via npx. Install code-server globally or set CODE_SERVER_BIN.`
                    : rawFailureMessage;
            },
        });

        if (handshakeError) {
            const entry = nativeProcesses.get(config.id);
            if (entry) {
                entry.process.kill();
                nativeProcesses.delete(config.id);
            }
            const errResult = { success: false, error: handshakeError };
            provisioningBus.emit(`error:${config.id}`, errResult);
            return errResult;
        }

        if (idxConfig.onStart) {
            log(`Executing background onStart lifecycle hooks...`);
            IdxEngine.runHook(workspacePath, 'onStart', idxConfig.onStart, (msg) => log(msg), true);
        }

        const finalResult: WorkspaceOperationResult = {
            success: true,
            containerId: `native-${config.id}`,
            androidPort: config.withAndroidEmulator ? 6080 : undefined,
            port,
            runtime: 'native',
        };
        provisioningBus.emit(`ready:${config.id}`, finalResult);
        return finalResult;
    } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        log(`[FATAL] Provisioning pipeline collapsed: ${error}`);
        nativeProcesses.delete(config.id);
        dockerWorkspaces.delete(config.id);
        const errResult = { success: false, error: `PROVISIONING_FAILED: ${error}` };
        provisioningBus.emit(`error:${config.id}`, errResult);
        return errResult;
    }
}

/**
 * Workspace provisioner with ATOMIC single-instance locking.
 */
export async function startWorkspaceContainer(config: WorkspaceConfig): Promise<WorkspaceOperationResult> {
    const pendingWorkspace = pendingProvisioning.get(config.id);
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
 * 🛠️ SELF-HEALING: Scans for running code-server instances to repopulate the proxy map.
 * This allows the IDE to survive server restarts or cold boots by probing active ports.
 */
export async function reconnectRunningWorkspaces() {
    const workspaceRoot = getWorkspaceRootPath();
    const runtimeRootPath = getRuntimeRootPath();
    
    console.log(`[BOOT] Probing filesystem segment: ${workspaceRoot} for existing sessions...`);
    try {
        const dockerResolution = await resolveDockerClient(ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
        if (dockerResolution) {
            const runningContainers = await dockerResolution.docker.listContainers({
                filters: {
                    label: [`${WORKSPACE_RUNTIME_LABEL}=${WORKSPACE_RUNTIME_LABEL_VALUE}`],
                },
            });

            for (const containerInfo of runningContainers) {
                const workspaceId = containerInfo.Labels?.[WORKSPACE_ID_LABEL];
                const port = getPublishedPortForListEntry(containerInfo);
                if (!workspaceId || !port) {
                    continue;
                }

                dockerWorkspaces.set(workspaceId, {
                    kind: 'docker',
                    containerId: containerInfo.Id,
                    containerName: containerInfo.Names[0]?.replace(/^\//, '') ?? getWorkspaceContainerName(workspaceId),
                    imageName: containerInfo.Image,
                    port,
                    socketPath: dockerResolution.socketPath,
                });
                console.log(`[RECONNECT] Restored Docker workspace ${workspaceId} on port ${port}.`);
            }
        }
    } catch (error) {
        console.warn(`[RECONNECT:WARN] Docker workspace restore failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    try {
        // Find all code-server processes
        // Note: Using a more robust ps grep that works across most POSIX environments
        const psCmd = process.platform === 'win32' ? 'tasklist' : "ps aux | grep code-server | grep -v grep";
        const output = execSync(psCmd).toString();
        const lines = output.split('\n');
        
        for (const line of lines) {
            // Looking for: ... --bind-addr 127.0.0.1:8548 ... w/44c7597c
            const bindMatch = line.match(/--bind-addr 127\.0\.0\.1:(\d+)/);
            const userDataMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})-userdata/);
            const runtimePathMatch = line.match(/\.codeverse-runtime[\/\\]([a-zA-Z0-9]{8})(?:\s|$)/);
            const legacyPathMatch = line.match(/[ /](?:w|workspaces)[\/\\]([a-zA-Z0-9]{8})/);
            
            if (bindMatch) {
                const shortId = userDataMatch?.[1] ?? runtimePathMatch?.[1] ?? legacyPathMatch?.[1];
                if (!shortId) {
                    continue;
                }

                const port = parseInt(bindMatch[1], 10);
                const metadataPath = path.join(runtimeRootPath, `${shortId}.id`);
                const legacyIdFile = path.join(workspaceRoot, shortId, '.codeverse-id');
                
                let foundFullId = "";
                if (fs.existsSync(metadataPath)) {
                    foundFullId = fs.readFileSync(metadataPath, 'utf-8').trim();
                } else if (fs.existsSync(legacyIdFile)) {
                    foundFullId = fs.readFileSync(legacyIdFile, 'utf-8').trim();
                } else {
                    // Fallback: If no ID file, we use the shortId as the temporary key.
                    foundFullId = shortId;
                    console.warn(`[RECONNECT:WARN] No .codeverse-id for session ${shortId}. Using prefix mapping.`);
                }
                
                if (foundFullId && !nativeProcesses.has(foundFullId)) {
                    // Capture PID reliably from ps output (column 2)
                    const psParts = line.trim().split(/\s+/);
                    const pid = parseInt(psParts[1]);
                    
                    console.log(`[RECONNECT] Identified active IDE ${foundFullId} (PID: ${pid}) on port ${port}. Restoration complete.`);
                    nativeProcesses.set(foundFullId, { 
                        kind: 'native',
                        pid, 
                        port, 
                        process: { 
                            pid,
                            kill: () => { 
                                try { 
                                    process.kill(pid, 'SIGKILL'); 
                                    return true;
                                } catch {
                                    try { execSync(`fuser -k ${port}/tcp`); } catch {}
                                    return true; 
                                }
                            }
                        } as WorkspaceProcess 
                    });
                }
            }
        }
    } catch {
        // No processes found or ps failed
    }
}

/**
 * 🟢 ENGINE WATCHDOG: Background health monitor for native IDE processes.
 */
function startEngineWatchdog() {
    setInterval(async () => {
        for (const [id, entry] of nativeProcesses.entries()) {
            try {
                // 1. Zombie Check
                try {
                    process.kill(entry.pid, 0); 
                } catch {
                    console.log(`[WATCHDOG] Process ${entry.pid} for ${id} is missing. Pruning.`);
                    nativeProcesses.delete(id);
                    continue;
                }

                // 2. Healthz Polling
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000);
                
                try {
                    const res = await fetch(`http://127.0.0.1:${entry.port}`, { signal: controller.signal });
                    if (!res.ok) throw new Error('Unhealthy');
                } catch {
                    console.warn(`[WATCHDOG] IDE ${id} (Port ${entry.port}) is non-responsive.`);
                    // Optional: force restart if unhealthy for multiple cycles
                } finally {
                    clearTimeout(timeoutId);
                }
            } catch (e) {
                console.error(`[WATCHDOG:ERR] ${e}`);
            }
        }
    }, 60000);
}

startEngineWatchdog();

async function stopDockerWorkspace(id: string): Promise<boolean> {
    const dockerEntry = dockerWorkspaces.get(id);
    const docker = dockerEntry
        ? createDockerClient(dockerEntry.socketPath)
        : (await resolveDockerClient(ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS))?.docker;

    if (!docker) {
        dockerWorkspaces.delete(id);
        return false;
    }

    const existingContainerInfo = await resolveExistingWorkspaceContainer(docker, id);
    if (!existingContainerInfo) {
        dockerWorkspaces.delete(id);
        return false;
    }

    const container = docker.getContainer(existingContainerInfo.Id);
    try {
        const inspectInfo = await container.inspect();
        if (inspectInfo.State.Running) {
            await container.stop({ t: 10 });
        }
    } catch {
        // Container may already be stopped or missing.
    }

    try {
        await container.remove({ force: true });
    } catch {
        // Container may already be removed.
    }

    dockerWorkspaces.delete(id);
    return true;
}

/**
 * Standardized stop method.
 */
export async function stopWorkspaceContainer(id: string): Promise<{ success: boolean }> {
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
export class DockerManager {
    async getContainerStatus(id: string): Promise<"running" | "stopped" | "not_found"> {
        if (isWorkspaceRunning(id)) return "running";
        return "stopped";
    }

    async stopContainer(id: string): Promise<boolean> {
        return (await stopWorkspaceContainer(id)).success;
    }

    async startWorkspace(config: WorkspaceConfig): Promise<boolean> {
        const result = await startWorkspaceContainer(config);
        return result.success;
    }
}

export const dockerManager = new DockerManager();
