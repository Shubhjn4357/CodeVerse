import { execSync } from 'child_process';
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
     * Synchronizes the environment FROM the Hugging Face Dataset (Pull).
     */
    static async syncFromDataset(onLog?: (msg: string) => void): Promise<void> {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID) {
            onLog?.(`[HF:STORAGE] Persistence layer inactive. HF_TOKEN or HF_DATASET_ID missing.`);
            return;
        }

        onLog?.(`[HF:STORAGE] Pulling persistent profile from '${this.HF_DATASET_ID}'...`);
        try {
            // Using huggingface-cli to download the profile tarball
            const tmpDir = '/tmp/hf-sync';
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

            execSync(`huggingface-cli download ${this.HF_DATASET_ID} profile.tar.gz --local-dir ${tmpDir} --token ${this.HF_TOKEN}`);
            
            if (fs.existsSync(path.join(tmpDir, 'profile.tar.gz'))) {
                onLog?.(`[HF:STORAGE] Restoring Nix profile...`);
                execSync(`tar -xzf ${path.join(tmpDir, 'profile.tar.gz')} -C ${process.env.HOME || '/home/node'}`);
                onLog?.(`[HF:STORAGE] Profile restored successfully.`);
            }
        } catch (e) {
            onLog?.(`[ERROR] Profile restoration failed. Starting with fresh environment.`);
            console.error(e);
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

            // Create a tarball of the .nix-profile
            execSync(`tar -czf ${path.join(tmpDir, 'profile.tar.gz')} -C ${process.env.HOME || '/home/node'} .nix-profile`);

            // Use huggingface-cli to upload
            execSync(`huggingface-cli upload ${this.HF_DATASET_ID} ${tmpDir}/profile.tar.gz profile.tar.gz --token ${this.HF_TOKEN}`);
            onLog?.(`[HF:STORAGE] Profile synchronized successfully.`);
        } catch (e) {
            onLog?.(`[ERROR] Profile synchronization failed.`);
            console.error(e);
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
