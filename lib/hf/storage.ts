import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Hugging Face Storage Utility for 2026 CodeVerse Persistence.
 */
export class HFStorage {
    private static readonly HF_TOKEN = process.env.HF_TOKEN;
    private static readonly HF_DATASET_ID = process.env.HF_DATASET_ID;
    private static readonly PROFILE_PATH = path.join(process.env.HOME || '/home/node', '.nix-profile');
    private static readonly WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/home/node/w';

    /**
     * Internal helper for asynchronous execution with logging.
     */
    private static async execAsync(command: string, onLog?: (msg: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const spawnEnv = { 
                ...process.env, 
                HF_TOKEN: this.HF_TOKEN,
                HF_HOME: '/tmp/.cache/huggingface',
                TMPDIR: '/tmp',
                PATH: `/home/node/.local/bin:/home/node/.nix-profile/bin:/usr/local/bin:/usr/bin:${process.env.PATH}` 
            };
            const child = spawn('/bin/bash', ['-c', command], {
                env: spawnEnv
            });

            child.stdout.on('data', (data) => onLog?.(data.toString().trim()));
            child.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg.includes('command not found')) {
                    onLog?.(`[CRITICAL] Binary missing: ${msg}. Current PATH: ${spawnEnv.PATH}`);
                }
                onLog?.(`[WARN] ${msg}`);
            });

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Command failed with code ${code}: ${command}`));
            });
        });
    }

    /**
     * Synchronizes the environment FROM the Hugging Face Dataset (Pull).
     */
    static async syncFromDataset(onLog?: (msg: string) => void): Promise<void> {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID) {
            onLog?.(`[HF:STORAGE] Persistence layer inactive. Missing credentials.`);
            return;
        }

        onLog?.(`[HF:STORAGE] Pulling persistent profile from '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // 🟢 DELTA SYNCING: Use 'download' for raw folder syncing instead of tarballs
        // This allows HF CLI to perform block-level diffing internally.
        const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli download ${this.HF_DATASET_ID} --local-dir ${process.env.HOME || '/home/node'} --local-dir-use-symlinks False --token ${this.HF_TOKEN} --include "*" --exclude "node_modules/*" --exclude ".nix/*" --exclude ".direnv/*" --exclude ".cache/*") || (hf download ${this.HF_DATASET_ID} --local-dir ${process.env.HOME || '/home/node'} --token ${this.HF_TOKEN})`;
        
        onLog?.(`[HF:STORAGE] Restoring differential profile from '${this.HF_DATASET_ID}'...`);
        await this.execAsync(cmd, onLog);
        onLog?.(`[HF:STORAGE] Profile restoration complete.`);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            onLog?.(`[ERROR] Profile restoration failed: ${errorMessage}`);
        }
    }

    /**
     * Synchronizes the environment TO the Hugging Face Dataset (Push).
     */
    static async syncToDataset(onLog?: (msg: string) => void): Promise<void> {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID) return;

        onLog?.(`[HF:STORAGE] Saving persistent profile to '${this.HF_DATASET_ID}'...`);
        try {
        // 🟢 DELTA SYNCING: Use 'upload-folder' for granular updates
        // This skips files that haven't changed, making uploads nearly instant for small edits.
        // We MUST exclude .cache/ and other high-volume folders to prevent HF Dataset 'CommitOperation' errors and 'Large Folder' warnings.
        const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli upload ${this.HF_DATASET_ID} ${process.env.HOME || '/home/node'} . --token ${this.HF_TOKEN} --message "CodeVerse Sync: ${new Date().toISOString()}" --exclude "node_modules/*" --exclude ".nix/*" --exclude ".direnv/*" --exclude ".cache/*" --exclude ".npm/*" --exclude ".local/share/code-server/*" --exclude ".vscode-server/extensions/*") || (hf upload ${this.HF_DATASET_ID} ${process.env.HOME || '/home/node'} . --token ${this.HF_TOKEN})`;
        
        onLog?.(`[HF:STORAGE] Performing differential backup to '${this.HF_DATASET_ID}'...`);
        await this.execAsync(cmd, onLog);
        onLog?.(`[HF:STORAGE] Profile backup successful.`);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            onLog?.(`[ERROR] Profile synchronization failed: ${errorMessage}`);
        }
    }

    /**
     * Starts the periodic persistence interval.
     */
    static startAutoSave(intervalMs: number = 300000) { // 5 minutes default
        setInterval(async () => {
            await this.syncToDataset((msg) => console.log(msg));
        }, intervalMs);
    }
}
