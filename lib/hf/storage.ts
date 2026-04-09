import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { ENV_CONFIG } from '../env-config';

/**
 * Hugging Face Storage Utility for 2026 CodeVerse Persistence.
 */
export class HFStorage {
    private static readonly HF_TOKEN = process.env.HF_TOKEN;
    private static readonly HF_DATASET_ID = process.env.HF_DATASET_ID;
    private static readonly PROFILE_PATH = path.join(process.env.HOME || '/home/node', '.nix-profile');
    private static readonly WORKSPACE_ROOT = ENV_CONFIG.WORKSPACE_ROOT;

    private static get isPersistenceRuntimeEnabled(): boolean {
        return Boolean(ENV_CONFIG.SPACE_ID && this.HF_TOKEN && this.HF_DATASET_ID && process.platform !== 'win32');
    }

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
            child.on('error', (error) => reject(error));
        });
    }

    /**
     * Synchronizes the environment FROM the Hugging Face Dataset (Pull).
     */
    static async syncFromDataset(onLog?: (msg: string) => void): Promise<void> {
        if (!this.isPersistenceRuntimeEnabled) {
            onLog?.(`[HF:STORAGE] Persistence layer inactive. Missing credentials.`);
            return;
        }

        onLog?.(`[HF:STORAGE] Pulling persistent profile from '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

        // 🟢 DELTA SYNCING: Only sync the specific workspace and IDE state directories
        const home = process.env.HOME || '/home/node';
        const persistDirs = ['w', '.vscode-server', '.config/code-server'];
        
        for (const dir of persistDirs) {
            const localPath = path.join(home, dir);
            if (!fs.existsSync(localPath)) fs.mkdirSync(localPath, { recursive: true });
            
            const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli download ${this.HF_DATASET_ID} --local-dir ${localPath} --include "${dir}/*" --token ${this.HF_TOKEN}) || (hf download ${this.HF_DATASET_ID} --local-dir ${localPath} --include "${dir}/*" --token ${this.HF_TOKEN})`;
            onLog?.(`[HF:STORAGE] Restoring ${dir} from differential profile...`);
            await this.execAsync(cmd, onLog).catch(() => {}); // Continue if one dir fails
        }
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
        if (!this.isPersistenceRuntimeEnabled) return;

        try {
            onLog?.(`[HF:STORAGE] Saving persistent profile to '${this.HF_DATASET_ID}'...`);
            const home = process.env.HOME || '/home/node';
            const persistDirs = ['w', '.vscode-server', '.config/code-server'];

            for (const dir of persistDirs) {
                const localPath = path.join(home, dir);
                if (!fs.existsSync(localPath)) continue;

                const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli upload ${this.HF_DATASET_ID} ${localPath} ${dir} --token ${this.HF_TOKEN} --message "CodeVerse Sync [${dir}]: ${new Date().toISOString()}" --exclude "node_modules/*" --exclude ".nix/*" --exclude ".direnv/*" --exclude ".cache/*") || (hf upload ${this.HF_DATASET_ID} ${localPath} ${dir} --token ${this.HF_TOKEN})`;
                onLog?.(`[HF:STORAGE] Performing differential backup of ${dir}...`);
                await this.execAsync(cmd, onLog).catch(err => onLog?.(`[WARN] Sync failed for ${dir}: ${err.message}`));
            }
            onLog?.(`[HF:STORAGE] Profile backup successful.`);
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            onLog?.(`[ERROR] Profile synchronization failed: ${errorMessage}`);
        }
    }

    /**
     * Starts the periodic persistence interval (Singleton Heartbeat).
     */
    private static autoSaveStarted = false;
    static startAutoSave(intervalMs: number = 300000) {
        if (this.autoSaveStarted || !this.isPersistenceRuntimeEnabled) return;
        this.autoSaveStarted = true;
        
        console.log(`[HF:STORAGE] Persistence heartbeat initialized (Interval: ${intervalMs}ms)`);
        setInterval(async () => {
            await this.syncToDataset((msg) => console.log(msg)).catch(() => {});
        }, intervalMs);
    }
}
