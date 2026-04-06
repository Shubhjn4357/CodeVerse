import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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
      
      // Simple regex-based parser for .idx/dev.nix (HCI: Nix syntax is complex, but we target common patterns)
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
   */
  static syncNixEnvironment(workspacePath: string, config: IdxConfig, onLog?: (msg: string) => void) {
    if (!config.packages || config.packages.length === 0) return;

    const log = (msg: string) => { if (onLog) onLog(`[IDX:NIX] ${msg}`); };
    log(`Syncing system packages: ${config.packages.join(', ')}...`);

    try {
      // Use nix-env to install the declared packages into the home profile
      // In a real Google Cloud Workstation, this would be a nix-shell or flake sync
      for (const pkg of config.packages) {
        log(`Installing ${pkg}...`);
        // Note: pkg is usually 'pkgs.nodejs', we strip the prefix if needed
        const pkgName = pkg.replace('pkgs.', '');
        execSync(`nix-env -iA nixpkgs.${pkgName}`, { 
          cwd: workspacePath, 
          env: { ...process.env, HOME: workspacePath } 
        });
      }
      log(`Environment synchronized successfully.`);
    } catch (e) {
      log(`[ERROR] Nix sync failed. Reverting to base image SDKs.`);
      console.error(e);
    }
  }

  /**
   * Executes the 'onCreate' and 'onStart' hooks.
   */
  static runHook(workspacePath: string, hookName: 'onCreate' | 'onStart', script: string, onLog?: (msg: string) => void) {
    const log = (msg: string) => { if (onLog) onLog(`[IDX:HOOK] ${hookName}: ${msg}`); };
    log(`Executing script...`);

    try {
      // Run the hook script in the workspace context
      execSync(script, {
        cwd: workspacePath,
        shell: '/bin/bash',
        env: { ...process.env, HOME: workspacePath }
      });
      log(`Success.`);
    } catch (e) {
      log(`[ERROR] Hook failed with exit code 1.`);
      console.error(e);
    }
  }
}
