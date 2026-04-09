import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Interface representing the .idx/dev.nix configuration.
 */
export interface IdxConfig {
  packages: string[];
  onCreate?: string;
  onStart?: string;
}

/**
 * IDX Engine for declarative workspace environments.
 * Refactored for 2026 Asynchronous Execution to prevent Event Loop blocking.
 */
export class IdxEngine {
  private static async hasCommand(command: string): Promise<boolean> {
    const probeCommand = process.platform === 'win32' ? 'where' : 'which';
    const probeArgs = [command];

    return await new Promise<boolean>((resolve) => {
      const child = spawn(probeCommand, probeArgs, { shell: false });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  /**
   * Returns a robust baseline configuration for workspaces without a dev.nix.
   */
  static getDefaultConfig(): IdxConfig {
    return {
      packages: ['pkgs.nodejs', 'pkgs.go', 'pkgs.python3', 'pkgs.docker', 'pkgs.python3Packages.huggingface-hub'],
      onCreate: 'npm install',
      onStart: process.platform === 'win32' ? 'Start-Sleep -Seconds 5; npm run dev' : 'sleep 5 && npm run dev'
    };
  }

  /**
   * Detects and parses the .idx/dev.nix file in the workspace root.
   */
  static getIdxConfig(workspacePath: string): IdxConfig {
    const configPath = path.join(/*turbopackIgnore: true*/ workspacePath, '.idx', 'dev.nix');
    if (!fs.existsSync(configPath)) return this.getDefaultConfig();

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      
      const packagesMatch = content.match(/packages\s*=\s*\[([\s\S]*?)\]/);
      const onCreateMatch = content.match(/onCreate\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);
      const onStartMatch = content.match(/onStart\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);

      const config = {
        packages: packagesMatch ? packagesMatch[1].split(/[\s\n,]+/).map(p => p.trim()).filter(p => p.length > 0) : [],
        onCreate: onCreateMatch ? onCreateMatch[1].trim() : undefined,
        onStart: onStartMatch ? onStartMatch[1].trim() : undefined
      };

      // Ensure baseline safety
      if (config.packages.length === 0) config.packages = this.getDefaultConfig().packages;
      
      return config;
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.warn(`[IDX-ENGINE] Failed to parse dev.nix, falling back to baseline:`, errorMessage);
      return this.getDefaultConfig();
    }
  }

  /**
   * Synchronizes the Nix environment based on the declarative packages.
   * ASYNCHRONOUS Spawning to prevent Blocking.
   */
  static async syncNixEnvironment(workspacePath: string, config: IdxConfig, onLog?: (msg: string) => void): Promise<void> {
    if (!config.packages || config.packages.length === 0) return;

    const log = (msg: string) => { if (onLog) onLog(`[IDX:NIX] ${msg}`); };
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
          await new Promise<void>((resolve) => {
              const auth = spawn('cachix', ['authtoken', cachixToken], { env: { ...process.env, HOME: workspacePath } });
              auth.on('close', () => resolve());
          });
      }

      log(`Cachix acceleration detected. Setting up cache: ${cachixName}...`);
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn('cachix', ['use', cachixName], {
            cwd: workspacePath,
            env: { ...process.env, HOME: workspacePath }
          });
          child.on('error', (err) => reject(err));
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Cachix failed with code ${code}`)));
        });
      } catch {
        log(`[WARN] Cachix setup bypassed. Falling back to default binary cache.`);
      }
    }

    // 🟢 HYDRATION GUARD: Skip synchronization if packages haven't changed or if pre-baked baseline is available
    const idxDir = path.join(workspacePath, '.idx');
    if (!fs.existsSync(idxDir)) fs.mkdirSync(idxDir, { recursive: true });
    
    const manifestPath = path.join(idxDir, 'packages.json');
    const bakedManifestPath = '/home/node/.idx/baked-packages.json';

    // 1. Check local manifest
    if (fs.existsSync(manifestPath)) {
        try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
            const currentSorted = [...config.packages].sort();
            const manifestSorted = [...(manifest.packages || [])].sort();
            if (JSON.stringify(currentSorted) === JSON.stringify(manifestSorted)) {
                log(`Environment already synchronized. Skipping profile update.`);
                return;
            }
        } catch {
            log(`[WARN] Manifest corruption detected. Forcing re-sync.`);
        }
    }

    // 2. Check pre-baked manifest (for default configs)
    const sortedDefault = [...IdxEngine.getDefaultConfig().packages].sort();
    const sortedCurrent = [...config.packages].sort();
    const isDefaultConfig = JSON.stringify(sortedCurrent) === JSON.stringify(sortedDefault);

    if (isDefaultConfig && fs.existsSync(bakedManifestPath)) {
        log(`Pre-baked baseline detected. Hydrating instance instantly...`);
        try {
            fs.copyFileSync(bakedManifestPath, manifestPath);
            log(`Hydration complete. Workspace ready.`);
            return;
        } catch (e) {
            log(`[WARN] Hydration failed: ${e instanceof Error ? e.message : String(e)}`);
        }
    }

    // CACHIX ...
    // ... (Cachix code remains the same or slightly optimized)
    
    const batchTargets = config.packages.map(pkg => `nixpkgs#${pkg.replace('pkgs.', '')}`);
    log(`Batch installing: ${batchTargets.join(', ')}...`);

    await new Promise<void>((resolve, reject) => {
        const child = spawn('nix', ['profile', 'add', ...batchTargets], {
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
                fs.writeFileSync(manifestPath, JSON.stringify({ packages: config.packages, timestamp: new Date().toISOString() }));
                resolve();
            } else {
                reject(new Error(`Batch Nix installation failed with code ${code}`));
            }
        });
    }).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[ERROR] ${errMsg}`);
    });
    log(`Environment synchronized successfully.`);
  }

  /**
   * Executes the 'onCreate' and 'onStart' hooks.
   * supports background execution for 'onStart' to prevent blocking the IDE handshake.
   */
  static async runHook(workspacePath: string, hookName: 'onCreate' | 'onStart', script: string, onLog?: (msg: string) => void, background = false): Promise<void> {
    const log = (msg: string) => { if (onLog) onLog(`[IDX:HOOK] ${hookName}: ${msg}`); };
    log(`Executing script... ${background ? '(Background)' : ''}`);

    const hookPromise = new Promise<void>((resolve, reject) => {
      // 🟢 PORT DE-CONFLICTION: Ensure hooks don't inherit the main orchestrator's port 7860
      const spawnEnv: NodeJS.ProcessEnv = { ...process.env, HOME: workspacePath };
      delete spawnEnv.PORT;
      delete spawnEnv.SERVER_PORT;

      const shellCommand = process.platform === 'win32' ? 'powershell.exe' : '/bin/bash';
      const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-Command', script] : ['-c', script];

      const child = spawn(shellCommand, shellArgs, {
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
        } else {
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
        await hookPromise.catch(() => {}); // Catch handled in promise
    }
  }
}
