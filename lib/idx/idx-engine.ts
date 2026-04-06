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
  /**
   * Returns a robust baseline configuration for workspaces without a dev.nix.
   */
  static getDefaultConfig(): IdxConfig {
    return {
      packages: ['pkgs.nodejs', 'pkgs.go', 'pkgs.python3', 'pkgs.docker', 'pkgs.huggingface-hub'],
      onCreate: 'npm install',
      onStart: 'sleep 5 && npm run dev'
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

    // CACHIX ACCELERATION: Robust check for binary existence to prevent ENOENT crash
    const cachixName = process.env.CACHIX_CACHE_NAME || 'code-nix';
    let hasCachix = false;
    
    try {
        await new Promise<void>((resolve) => {
            const check = spawn('command', ['-v', 'cachix'], { shell: true });
            check.on('close', (code) => {
                hasCachix = (code === 0);
                resolve();
            });
            check.on('error', () => {
                hasCachix = false;
                resolve();
            });
        });
    } catch {
        hasCachix = false;
    }

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

    for (const pkg of config.packages) {
      log(`Installing ${pkg}...`);
      const pkgName = pkg.replace('pkgs.', '');
      
      await new Promise<void>((resolve, reject) => {
        // Modern 2026 Nix: Use 'nix profile add' instead of deprecated 'nix-env'
        const child = spawn('nix', ['profile', 'add', `nixpkgs#${pkgName}`], {
          cwd: workspacePath,
          env: { 
            ...process.env, 
            HOME: workspacePath,
            NIX_CONFIG: 'experimental-features = nix-command flakes'
          }
        });

        child.stdout.on('data', (data) => log(data.toString().trim()));
        child.stderr.on('data', (data) => log(`[INFO] ${data.toString().trim()}`));
        
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Nix installation of ${pkgName} failed with code ${code}`));
        });
      }).catch((err: unknown) => {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`[ERROR] ${errMsg}`);
      });
    }
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

      const child = spawn('/bin/bash', ['-c', script], {
        cwd: workspacePath,
        env: spawnEnv
      });

      child.stdout.on('data', (data) => log(data.toString().trim()));
      child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
      
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
