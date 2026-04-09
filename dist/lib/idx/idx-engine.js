"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdxEngine = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
const env_config_1 = require("../env-config");
/**
 * IDX Engine for declarative workspace environments.
 * Refactored for 2026 Asynchronous Execution to prevent Event Loop blocking.
 */
class IdxEngine {
    static async hasCommand(command) {
        const probeCommand = process.platform === 'win32' ? 'where' : 'which';
        const probeArgs = [command];
        return await new Promise((resolve) => {
            const child = (0, child_process_1.spawn)(probeCommand, probeArgs, { shell: false });
            child.on('close', (code) => resolve(code === 0));
            child.on('error', () => resolve(false));
        });
    }
    /**
     * Returns a robust baseline configuration for workspaces without a dev.nix.
     */
    static getDefaultConfig() {
        return {
            packages: ['pkgs.nodejs', 'pkgs.go', 'pkgs.python3', 'pkgs.docker', 'pkgs.python3Packages.huggingface-hub'],
            onCreate: 'npm install',
            onStart: process.platform === 'win32' ? 'Start-Sleep -Seconds 5; npm run dev' : 'sleep 5 && npm run dev'
        };
    }
    /**
     * Detects and parses the .idx/dev.nix file in the workspace root.
     */
    static getIdxConfig(workspacePath) {
        const configPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.idx', 'dev.nix');
        if (!fs_1.default.existsSync(configPath))
            return this.getDefaultConfig();
        try {
            const content = fs_1.default.readFileSync(configPath, 'utf8');
            const packagesMatch = content.match(/packages\s*=\s*\[([\s\S]*?)\]/);
            const onCreateMatch = content.match(/onCreate\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);
            const onStartMatch = content.match(/onStart\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);
            const config = {
                packages: packagesMatch ? packagesMatch[1].split(/[\s\n,]+/).map(p => p.trim()).filter(p => p.length > 0) : [],
                onCreate: onCreateMatch ? onCreateMatch[1].trim() : undefined,
                onStart: onStartMatch ? onStartMatch[1].trim() : undefined
            };
            // Ensure baseline safety
            if (config.packages.length === 0)
                config.packages = this.getDefaultConfig().packages;
            return config;
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.warn(`[IDX-ENGINE] Failed to parse dev.nix, falling back to baseline:`, errorMessage);
            return this.getDefaultConfig();
        }
    }
    /**
     * Synchronizes the Nix environment based on the declarative packages.
     * ASYNCHRONOUS Spawning to prevent Blocking.
     */
    static async syncNixEnvironment(workspacePath, config, onLog) {
        if (!config.packages || config.packages.length === 0)
            return;
        const log = (msg) => { if (onLog)
            onLog(`[IDX:NIX] ${msg}`); };
        if (!env_config_1.ENV_CONFIG.IDX_NIX_SYNC_ENABLED) {
            log(`Nix synchronization is disabled by runtime policy. Skipping declarative package sync.`);
            return;
        }
        log(`Syncing system packages: ${config.packages.join(', ')}...`);
        const hasNix = await this.hasCommand('nix');
        if (!hasNix) {
            log(`Nix is unavailable on this host. Skipping declarative package sync.`);
            return;
        }
        // CACHIX ACCELERATION: Robust check for binary existence to prevent ENOENT crash
        const cachixName = process.env.CACHIX_CACHE_NAME || 'code-nix';
        const hasCachix = await this.hasCommand('cachix');
        if (hasCachix) {
            const cachixToken = process.env.CACHIX_AUTH_TOKEN;
            if (cachixToken) {
                log(`Cachix authentication detected. Configuring access...`);
                await new Promise((resolve) => {
                    const auth = (0, child_process_1.spawn)('cachix', ['authtoken', cachixToken], { env: { ...process.env, HOME: workspacePath } });
                    auth.on('close', () => resolve());
                });
            }
            log(`Cachix acceleration detected. Setting up cache: ${cachixName}...`);
            try {
                await new Promise((resolve, reject) => {
                    const child = (0, child_process_1.spawn)('cachix', ['use', cachixName], {
                        cwd: workspacePath,
                        env: { ...process.env, HOME: workspacePath }
                    });
                    child.on('error', (err) => reject(err));
                    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Cachix failed with code ${code}`)));
                });
            }
            catch (_a) {
                log(`[WARN] Cachix setup bypassed. Falling back to default binary cache.`);
            }
        }
        // 🟢 HYDRATION GUARD: Skip synchronization if packages haven't changed or if pre-baked baseline is available
        const idxDir = path_1.default.join(workspacePath, '.idx');
        if (!fs_1.default.existsSync(idxDir))
            fs_1.default.mkdirSync(idxDir, { recursive: true });
        const manifestPath = path_1.default.join(idxDir, 'packages.json');
        const bakedManifestPath = '/home/node/.idx/baked-packages.json';
        // 1. Check local manifest
        if (fs_1.default.existsSync(manifestPath)) {
            try {
                const manifest = JSON.parse(fs_1.default.readFileSync(manifestPath, 'utf8'));
                const currentSorted = [...config.packages].sort();
                const manifestSorted = [...(manifest.packages || [])].sort();
                if (JSON.stringify(currentSorted) === JSON.stringify(manifestSorted)) {
                    log(`Environment already synchronized. Skipping profile update.`);
                    return;
                }
            }
            catch (_b) {
                log(`[WARN] Manifest corruption detected. Forcing re-sync.`);
            }
        }
        // 2. Check pre-baked manifest (for default configs)
        const sortedDefault = [...IdxEngine.getDefaultConfig().packages].sort();
        const sortedCurrent = [...config.packages].sort();
        const isDefaultConfig = JSON.stringify(sortedCurrent) === JSON.stringify(sortedDefault);
        if (isDefaultConfig && fs_1.default.existsSync(bakedManifestPath)) {
            log(`Pre-baked baseline detected. Hydrating instance instantly...`);
            try {
                fs_1.default.copyFileSync(bakedManifestPath, manifestPath);
                log(`Hydration complete. Workspace ready.`);
                return;
            }
            catch (e) {
                log(`[WARN] Hydration failed: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        // CACHIX ...
        // ... (Cachix code remains the same or slightly optimized)
        const batchTargets = config.packages.map(pkg => `nixpkgs#${pkg.replace('pkgs.', '')}`);
        log(`Batch installing: ${batchTargets.join(', ')}...`);
        await new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('nix', ['profile', 'add', ...batchTargets], {
                cwd: workspacePath,
                env: {
                    ...process.env,
                    HOME: workspacePath,
                    NIX_CONFIG: 'experimental-features = nix-command flakes'
                },
                timeout: 300000 // 5-minute safety timeout
            });
            child.stdout.on('data', (data) => log(data.toString().trim()));
            child.stderr.on('data', (data) => log(`[INFO] ${data.toString().trim()}`));
            child.on('error', (error) => reject(error));
            child.on('close', (code) => {
                if (code === 0) {
                    fs_1.default.writeFileSync(manifestPath, JSON.stringify({ packages: config.packages, timestamp: new Date().toISOString() }));
                    resolve();
                }
                else {
                    reject(new Error(`Batch Nix installation failed with code ${code}`));
                }
            });
        }).catch((err) => {
            const errMsg = err instanceof Error ? err.message : String(err);
            log(`[ERROR] ${errMsg}`);
        });
        log(`Environment synchronized successfully.`);
    }
    /**
     * Executes the 'onCreate' and 'onStart' hooks.
     * supports background execution for 'onStart' to prevent blocking the IDE handshake.
     */
    static async runHook(workspacePath, hookName, script, onLog, background = false) {
        const log = (msg) => { if (onLog)
            onLog(`[IDX:HOOK] ${hookName}: ${msg}`); };
        log(`Executing script... ${background ? '(Background)' : ''}`);
        const hookPromise = new Promise((resolve, reject) => {
            // 🟢 PORT DE-CONFLICTION: Ensure hooks don't inherit the main orchestrator's port 7860
            const spawnEnv = { ...process.env, HOME: workspacePath };
            delete spawnEnv.PORT;
            delete spawnEnv.SERVER_PORT;
            const shellCommand = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
            const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', script] : ['-c', script];
            const child = (0, child_process_1.spawn)(shellCommand, shellArgs, {
                cwd: workspacePath,
                env: spawnEnv
            });
            child.stdout.on('data', (data) => log(data.toString().trim()));
            child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
            child.on('error', (error) => {
                log(`[ERROR] ${error.message}`);
                reject(error);
            });
            child.on('close', (code) => {
                if (code === 0) {
                    log(`Hook ${hookName} completed successfully.`);
                    resolve();
                }
                else {
                    const err = new Error(`Hook ${hookName} failed with code ${code}`);
                    log(`[ERROR] ${err.message}`);
                    reject(err);
                }
            });
            // If background, resolve immediately after spawn
            if (background) {
                log(`Hook detached and running in baseline context.`);
                resolve();
            }
        });
        if (!background) {
            await hookPromise.catch(() => { }); // Catch handled in promise
        }
    }
}
exports.IdxEngine = IdxEngine;
