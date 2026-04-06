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
    private static readonly WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspaces';

    /**
     * Internal helper for asynchronous execution with logging.
     */
    private static async execAsync(command: string, onLog?: (msg: string) => void): Promise<void> {
        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(' ');
            const child = spawn('/bin/bash', ['-c', command], {
                env: { ...process.env, HF_TOKEN: this.HF_TOKEN }
            });

            child.stdout.on('data', (data) => onLog?.(data.toString().trim()));
            child.stderr.on('data', (data) => onLog?.(`[WARN] ${data.toString().trim()}`));

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

            await this.execAsync(`huggingface-cli download ${this.HF_DATASET_ID} profile.tar.gz --local-dir ${tmpDir} --token ${this.HF_TOKEN}`, onLog);
            
            const tarPath = path.join(tmpDir, 'profile.tar.gz');
            if (fs.existsSync(tarPath)) {
                onLog?.(`[HF:STORAGE] Restoring Nix profile...`);
                await this.execAsync(`tar -xzf ${tarPath} -C ${process.env.HOME || '/home/node'}`, onLog);
                onLog?.(`[HF:STORAGE] Profile restored successfully.`);
            }
        } catch (e: any) {
            onLog?.(`[ERROR] Profile restoration failed: ${e.message}`);
        }
    }

    /**
     * Synchronizes the environment TO the Hugging Face Dataset (Push).
     */
    static async syncToDataset(onLog?: (msg: string) => void): Promise<void> {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID) return;

        onLog?.(`[HF:STORAGE] Saving persistent profile to '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            const tarPath = path.join(tmpDir, 'profile.tar.gz');
            await this.execAsync(`tar -czf ${tarPath} -C ${process.env.HOME || '/home/node'} .nix-profile`, onLog);
            await this.execAsync(`huggingface-cli upload ${this.HF_DATASET_ID} ${tarPath} profile.tar.gz --token ${this.HF_TOKEN}`, onLog);
            
            onLog?.(`[HF:STORAGE] Profile synchronized successfully.`);
        } catch (e: any) {
            onLog?.(`[ERROR] Profile synchronization failed: ${e.message}`);
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
