"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HFStorage = void 0;
const child_process_1 = require("child_process");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const env_config_1 = require("../env-config");
/**
 * Hugging Face Storage Utility for 2026 CodeVerse Persistence.
 */
class HFStorage {
    static get isPersistenceRuntimeEnabled() {
        return Boolean(env_config_1.ENV_CONFIG.SPACE_ID && this.HF_TOKEN && this.HF_DATASET_ID && process.platform !== 'win32');
    }
    static getPersistenceEntries() {
        const home = process.env.HOME || '/home/node';
        const relativeWorkspaceRoot = path_1.default.relative(home, this.WORKSPACE_ROOT).replace(/\\/g, '/');
        const workspaceDatasetPath = relativeWorkspaceRoot.startsWith('..')
            ? path_1.default.basename(this.WORKSPACE_ROOT)
            : relativeWorkspaceRoot;
        return [
            { datasetPath: workspaceDatasetPath, localPath: this.WORKSPACE_ROOT },
            { datasetPath: '.vscode-server', localPath: path_1.default.join(home, '.vscode-server') },
            { datasetPath: '.config/code-server', localPath: path_1.default.join(home, '.config', 'code-server') },
        ];
    }
    /**
     * Internal helper for asynchronous execution with logging.
     */
    static async execAsync(command, onLog) {
        return new Promise((resolve, reject) => {
            const spawnEnv = {
                ...process.env,
                HF_TOKEN: this.HF_TOKEN,
                HF_HOME: '/tmp/.cache/huggingface',
                TMPDIR: '/tmp',
                PATH: `/home/node/.local/bin:/home/node/.nix-profile/bin:/usr/local/bin:/usr/bin:${process.env.PATH}`,
            };
            const child = (0, child_process_1.spawn)('/bin/bash', ['-c', command], {
                env: spawnEnv
            });
            child.stdout.on('data', (data) => onLog === null || onLog === void 0 ? void 0 : onLog(data.toString().trim()));
            child.stderr.on('data', (data) => {
                const msg = data.toString().trim();
                if (msg.includes('command not found')) {
                    onLog === null || onLog === void 0 ? void 0 : onLog(`[CRITICAL] Binary missing: ${msg}. Current PATH: ${spawnEnv.PATH}`);
                }
                onLog === null || onLog === void 0 ? void 0 : onLog(`[WARN] ${msg}`);
            });
            child.on('close', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`Command failed with code ${code}: ${command}`));
            });
            child.on('error', (error) => reject(error));
        });
    }
    /**
     * Synchronizes the environment FROM the Hugging Face Dataset (Pull).
     */
    static async syncFromDataset(onLog) {
        if (!this.isPersistenceRuntimeEnabled) {
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Persistence layer inactive. Missing credentials.`);
            return;
        }
        onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Pulling persistent profile from '${this.HF_DATASET_ID}'...`);
        try {
            const tmpDir = '/tmp/hf-sync';
            if (!fs_1.default.existsSync(tmpDir))
                fs_1.default.mkdirSync(tmpDir, { recursive: true });
            const home = process.env.HOME || '/home/node';
            const persistenceEntries = this.getPersistenceEntries();
            for (const entry of persistenceEntries) {
                if (!fs_1.default.existsSync(entry.localPath)) {
                    fs_1.default.mkdirSync(entry.localPath, { recursive: true });
                }
                const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli download ${this.HF_DATASET_ID} --local-dir ${home} --include "${entry.datasetPath}/*" --token ${this.HF_TOKEN}) || (hf download ${this.HF_DATASET_ID} --local-dir ${home} --include "${entry.datasetPath}/*" --token ${this.HF_TOKEN})`;
                onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Restoring ${entry.datasetPath} from differential profile...`);
                await this.execAsync(cmd, onLog).catch(() => { });
            }
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Profile restoration complete.`);
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            onLog === null || onLog === void 0 ? void 0 : onLog(`[ERROR] Profile restoration failed: ${errorMessage}`);
        }
    }
    /**
     * Synchronizes the environment TO the Hugging Face Dataset (Push).
     */
    static async syncToDataset(onLog) {
        if (!this.isPersistenceRuntimeEnabled)
            return;
        try {
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Saving persistent profile to '${this.HF_DATASET_ID}'...`);
            const persistenceEntries = this.getPersistenceEntries();
            for (const entry of persistenceEntries) {
                if (!fs_1.default.existsSync(entry.localPath))
                    continue;
                const cmd = `(command -v huggingface-cli >/dev/null && huggingface-cli upload ${this.HF_DATASET_ID} ${entry.localPath} ${entry.datasetPath} --token ${this.HF_TOKEN} --message "CodeVerse Sync [${entry.datasetPath}]: ${new Date().toISOString()}" --exclude "node_modules/*" --exclude ".nix/*" --exclude ".direnv/*" --exclude ".cache/*") || (hf upload ${this.HF_DATASET_ID} ${entry.localPath} ${entry.datasetPath} --token ${this.HF_TOKEN})`;
                onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Performing differential backup of ${entry.datasetPath}...`);
                await this.execAsync(cmd, onLog).catch((err) => onLog === null || onLog === void 0 ? void 0 : onLog(`[WARN] Sync failed for ${entry.datasetPath}: ${err.message}`));
            }
            onLog === null || onLog === void 0 ? void 0 : onLog(`[HF:STORAGE] Profile backup successful.`);
        }
        catch (e) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            onLog === null || onLog === void 0 ? void 0 : onLog(`[ERROR] Profile synchronization failed: ${errorMessage}`);
        }
    }
    static startAutoSave(intervalMs = 300000) {
        if (this.autoSaveStarted || !this.isPersistenceRuntimeEnabled)
            return;
        this.autoSaveStarted = true;
        console.log(`[HF:STORAGE] Persistence heartbeat initialized (Interval: ${intervalMs}ms)`);
        setInterval(async () => {
            await this.syncToDataset((msg) => console.log(msg)).catch(() => { });
        }, intervalMs);
    }
}
exports.HFStorage = HFStorage;
HFStorage.HF_TOKEN = process.env.HF_TOKEN;
HFStorage.HF_DATASET_ID = process.env.HF_DATASET_ID;
HFStorage.PROFILE_PATH = path_1.default.join(process.env.HOME || '/home/node', '.nix-profile');
HFStorage.WORKSPACE_ROOT = env_config_1.ENV_CONFIG.WORKSPACE_ROOT;
/**
 * Starts the periodic persistence interval (Singleton Heartbeat).
 */
HFStorage.autoSaveStarted = false;
