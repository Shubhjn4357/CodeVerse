"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IdxEngine = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const child_process_1 = require("child_process");
/**
 * IDX Engine for declarative workspace environments.
 * Refactored for 2026 Asynchronous Execution to prevent Event Loop blocking.
 */
class IdxEngine {
    /**
     * Returns a robust baseline configuration for workspaces without a dev.nix.
     */
    static getDefaultConfig() {
        return {
            packages: ['pkgs.nodejs', 'pkgs.go', 'pkgs.python3', 'pkgs.docker'],
            onCreate: 'npm install',
            onStart: 'npm run dev'
        };
    }
    /**
     * Detects and parses the .idx/dev.nix file in the workspace root.
     */
    static getIdxConfig(workspacePath) {
        const configPath = path_1.default.join(workspacePath, '.idx', 'dev.nix');
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
            console.warn(`[IDX-ENGINE] Failed to parse dev.nix, falling back to baseline:`, e);
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
        log(`Syncing system packages: ${config.packages.join(', ')}...`);
        // CACHIX ACCELERATION
        const cachixName = process.env.CACHIX_CACHE_NAME;
        if (cachixName) {
            log(`Cachix acceleration detected for '${cachixName}'. Setting up cache...`);
            try {
                await new Promise((resolve, reject) => {
                    const child = (0, child_process_1.spawn)('cachix', ['use', cachixName], {
                        cwd: workspacePath,
                        env: { ...process.env, HOME: workspacePath }
                    });
                    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Cachix setup failed with code ${code}`)));
                });
            }
            catch (e) {
                log(`[WARN] Cachix setup failed. Falling back to default binary cache.`);
                console.error(e);
            }
        }
        for (const pkg of config.packages) {
            log(`Installing ${pkg}...`);
            const pkgName = pkg.replace('pkgs.', '');
            await new Promise((resolve, reject) => {
                const child = (0, child_process_1.spawn)('nix-env', ['-iA', `nixpkgs.${pkgName}`], {
                    cwd: workspacePath,
                    env: { ...process.env, HOME: workspacePath, NIX_PATH: `nixpkgs=https://github.com/NixOS/nixpkgs/archive/master.tar.gz` }
                });
                child.stdout.on('data', (data) => log(data.toString().trim()));
                child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
                child.on('close', (code) => {
                    if (code === 0)
                        resolve();
                    else
                        reject(new Error(`Nix installation of ${pkgName} failed with code ${code}`));
                });
            }).catch(err => log(`[ERROR] ${err.message}`));
        }
        log(`Environment synchronized successfully.`);
    }
    /**
     * Executes the 'onCreate' and 'onStart' hooks.
     * ASYNCHRONOUS Spawning to prevent Blocking.
     */
    static async runHook(workspacePath, hookName, script, onLog) {
        const log = (msg) => { if (onLog)
            onLog(`[IDX:HOOK] ${hookName}: ${msg}`); };
        log(`Executing script...`);
        await new Promise((resolve, reject) => {
            const child = (0, child_process_1.spawn)('/bin/bash', ['-c', script], {
                cwd: workspacePath,
                env: { ...process.env, HOME: workspacePath }
            });
            child.stdout.on('data', (data) => log(data.toString().trim()));
            child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
            child.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Hook ${hookName} failed with code ${code}`));
            });
        }).catch(err => log(`[ERROR] ${err.message}`));
    }
}
exports.IdxEngine = IdxEngine;
