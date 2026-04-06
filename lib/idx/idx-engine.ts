import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

/**
 * Interface representing the .idx/dev.nix configuration.
 */
export interface IdxConfig {
  packages?: string[];
  onCreate?: string;
  onStart?: string;
}

/**
 * IDX Engine for declarative workspace environments.
 * Refactored for 2026 Asynchronous Execution to prevent Event Loop blocking.
 */
export class IdxEngine {
  /**
   * Detects and parses the .idx/dev.nix file in the workspace root.
   */
  static getIdxConfig(workspacePath: string): IdxConfig | null {
    const configPath = path.join(workspacePath, '.idx', 'dev.nix');
    if (!fs.existsSync(configPath)) return null;

    try {
      const content = fs.readFileSync(configPath, 'utf8');
      
      const packagesMatch = content.match(/packages\s*=\s*\[([\s\S]*?)\]/);
      const onCreateMatch = content.match(/onCreate\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);
      const onStartMatch = content.match(/onStart\s*=\s*"{1,3}([\s\S]*?)"{1,3}/);

      return {
        packages: packagesMatch ? packagesMatch[1].split(/[\s\n,]+/).map(p => p.trim()).filter(p => p.length > 0) : [],
        onCreate: onCreateMatch ? onCreateMatch[1].trim() : undefined,
        onStart: onStartMatch ? onStartMatch[1].trim() : undefined
      };
    } catch (e) {
      console.error(`[IDX-ENGINE] Failed to parse dev.nix:`, e);
      return null;
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

    // CACHIX ACCELERATION
    const cachixName = process.env.CACHIX_CACHE_NAME;
    if (cachixName) {
      log(`Cachix acceleration detected for '${cachixName}'. Setting up cache...`);
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn('cachix', ['use', cachixName], {
            cwd: workspacePath,
            env: { ...process.env, HOME: workspacePath }
          });
          child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`Cachix setup failed with code ${code}`)));
        });
      } catch (e) {
        log(`[WARN] Cachix setup failed. Falling back to default binary cache.`);
        console.error(e);
      }
    }

    for (const pkg of config.packages) {
      log(`Installing ${pkg}...`);
      const pkgName = pkg.replace('pkgs.', '');
      
      await new Promise<void>((resolve, reject) => {
        const child = spawn('nix-env', ['-iA', `nixpkgs.${pkgName}`], {
          cwd: workspacePath,
          env: { ...process.env, HOME: workspacePath, NIX_PATH: `nixpkgs=https://github.com/NixOS/nixpkgs/archive/master.tar.gz` }
        });

        child.stdout.on('data', (data) => log(data.toString().trim()));
        child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
        
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Nix installation of ${pkgName} failed with code ${code}`));
        });
      }).catch(err => log(`[ERROR] ${err.message}`));
    }
    log(`Environment synchronized successfully.`);
  }

  /**
   * Executes the 'onCreate' and 'onStart' hooks.
   * ASYNCHRONOUS Spawning to prevent Blocking.
   */
  static async runHook(workspacePath: string, hookName: 'onCreate' | 'onStart', script: string, onLog?: (msg: string) => void): Promise<void> {
    const log = (msg: string) => { if (onLog) onLog(`[IDX:HOOK] ${hookName}: ${msg}`); };
    log(`Executing script...`);

    await new Promise<void>((resolve, reject) => {
      const child = spawn('/bin/bash', ['-c', script], {
        cwd: workspacePath,
        env: { ...process.env, HOME: workspacePath }
      });

      child.stdout.on('data', (data) => log(data.toString().trim()));
      child.stderr.on('data', (data) => log(`[WARN] ${data.toString().trim()}`));
      
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Hook ${hookName} failed with code ${code}`));
      });
    }).catch(err => log(`[ERROR] ${err.message}`));
  }
}
