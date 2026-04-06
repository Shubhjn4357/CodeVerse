"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HFStorage = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * Hugging Face Storage Utility for 2026 CodeVerse Persistence.
 */
class HFStorage {
    /**
     * Internal helper for asynchronous execution with logging.
     */
    static async execAsync(command, onLog) {
        return new Promise((resolve, reject) => {
            const [cmd, ...args] = command.split(' ');
            const child = (0, child_process_1.spawn)('/bin/bash', ['-c', command], {
                env: { ...process.env, HF_TOKEN: this.HF_TOKEN }
            });
            child.stdout.on('data', (data) => onLog === null || onLog === void 0 ? void 0 : onLog(data.toString().trim()));
            child.stderr.on('data', (data) => onLog === null || onLog === void 0 ? void 0 : onLog(`[WARN] ${data.toString().trim()}`));
            child.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Command failed with code ${code}: ${command}`));
            });
        });
    }
    /**
     * Synchronizes the environment FROM the Hugging Face Dataset (Pull).
     */
    static async syncFromDataset(onLog) {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID) {
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Persistence layer inactive. Missing credentials.`);
            return;
        }
        onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Pulling persistent profile from '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs_1.default.existsSync(tmpDir))
                fs_1.default.mkdirSync(tmpDir, { recursive: true });
            await this.execAsync(`huggingface-cli download ${this.HF_DATASET_ID} profile.tar.gz --local-dir ${tmpDir} --token ${this.HF_TOKEN}`, onLog);
            const tarPath = path_1.default.join(tmpDir, 'profile.tar.gz');
            if (fs_1.default.existsSync(tarPath)) {
                onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Restoring Nix profile...`);
                await this.execAsync(`tar -xzf ${tarPath} -C ${process.env.HOME || '/home/node'}`, onLog);
                onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Profile restored successfully.`);
            }
        }
        catch (e) {
            onLog === null || onLog === void 0 ? void 0 : onLog(`[ERROR] Profile restoration failed: ${e.message}`);
        }
    }
    /**
     * Synchronizes the environment TO the Hugging Face Dataset (Push).
     */
    static async syncToDataset(onLog) {
        if (!this.HF_TOKEN || !this.HF_DATASET_ID)
            return;
        onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Saving persistent profile to '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs_1.default.existsSync(tmpDir))
                fs_1.default.mkdirSync(tmpDir, { recursive: true });
            const tarPath = path_1.default.join(tmpDir, 'profile.tar.gz');
            await this.execAsync(`tar -czf ${tarPath} -C ${process.env.HOME || '/home/node'} .nix-profile`, onLog);
            await this.execAsync(`huggingface-cli upload ${this.HF_DATASET_ID} ${tarPath} profile.tar.gz --token ${this.HF_TOKEN}`, onLog);
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Profile synchronized successfully.`);
        }
        catch (e) {
            onLog === null || onLog === void 0 ? void 0 : onLog(`[ERROR] Profile synchronization failed: ${e.message}`);
        }
    }
    /**
     * Starts the periodic persistence interval.
     */
    static startAutoSave(intervalMs = 300000) {
        setInterval(async () => {
            await this.syncToDataset((msg) => console.log(msg));
        }, intervalMs);
    }
}
exports.HFStorage = HFStorage;
HFStorage.HF_TOKEN = process.env.HF_TOKEN;
HFStorage.HF_DATASET_ID = process.env.HF_DATASET_ID;
HFStorage.PROFILE_PATH = path_1.default.join(process.env.HOME || '/home/node', '.nix-profile');
HFStorage.WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || '/app/workspaces';
