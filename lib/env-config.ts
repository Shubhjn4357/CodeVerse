import path from "path";

function getDefaultWorkspaceRoot(): string {
    return process.platform === "win32"
        ? path.join(process.cwd(), "workspaces")
        : "/home/node/w";
}

/**
 * CodeVerse Environment Configuration & Requirements Manifest.
 * Centralizing all system variables for production-grade reliability.
 */
export const ENV_CONFIG = {
    // 1. Storage & Persistence
    HF_TOKEN: process.env.HF_TOKEN || process.env.hfToken || process.env.HF_SPACE || process.env.HuggingFaceToken,
    HF_DATASET_ID: process.env.HF_DATASET_ID || process.env.hfDataset || process.env.HF_DATASET,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || getDefaultWorkspaceRoot(),

    // 2. Build Acceleration
    CACHIX_CACHE_NAME: process.env.CACHIX_CACHE_NAME || 'code-nix',
    CACHIX_AUTH_TOKEN: process.env.CACHIX_AUTH_TOKEN,
    IDX_NIX_SYNC_ENABLED: process.env.IDX_NIX_SYNC_ENABLED
        ? process.env.IDX_NIX_SYNC_ENABLED === 'true'
        : process.platform !== 'win32',

    // 3. Infrastructure State
    NODE_ENV: process.env.NODE_ENV || 'production',
    SPACE_ID: process.env.SPACE_ID,
    APP_BASE_URL: process.env.NEXTAUTH_URL || 'http://localhost:7860',
    IS_SBC: !!process.env.SPACE_ID,

    // 4. Database & Auth
    AUTH_SECRET: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || process.env.authSecret,
    TURSO_URL: process.env.TURSO_URL || process.env.turso_url || process.env.DATABASE_URL || process.env.database_url || process.env.TURSO_DATABASE_URL || process.env.DB_URL || process.env.turso_database_url,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || process.env.turso_auth_token || process.env.DB_TOKEN,
    CODE_SERVER_NODE_BIN: process.env.CODE_SERVER_NODE_BIN,
    CODE_SERVER_ENTRY: process.env.CODE_SERVER_ENTRY,
    DOCKER_SOCKET_PATH: process.env.DOCKER_SOCKET_PATH,
    DOCKER_PROBE_TIMEOUT_MS: Number.parseInt(process.env.DOCKER_PROBE_TIMEOUT_MS || '4000', 10),
    WORKSPACE_RUNTIME_PREFERENCE: process.env.WORKSPACE_RUNTIME_PREFERENCE || (process.platform === 'win32' ? 'docker' : 'auto'),
    DOCKER_WORKSPACE_BASE_IMAGE: process.env.DOCKER_WORKSPACE_BASE_IMAGE || 'codercom/code-server:latest',
    TMPDIR: '/tmp',
    HF_HOME: '/tmp/.cache/huggingface',
};

/**
 * Validates that all critical infrastructure secrets are available.
 */
export function validateEnvironment() {
    const missing: string[] = [];
    if (!ENV_CONFIG.AUTH_SECRET) missing.push('AUTH_SECRET (Security Risk)');
    if (!ENV_CONFIG.TURSO_URL) missing.push('TURSO_URL (Database Missing)');

    // HF persistence is required in deployed Spaces, not for local production testing.
    if (ENV_CONFIG.SPACE_ID) {
        if (!ENV_CONFIG.HF_TOKEN) missing.push('HF_TOKEN (Missing Persistence Link)');
        if (!ENV_CONFIG.HF_DATASET_ID) missing.push('HF_DATASET_ID (Missing Data Segment)');
    }

    // Strategic Dataset Validation
    if (ENV_CONFIG.HF_DATASET_ID && !ENV_CONFIG.HF_DATASET_ID.includes('/')) {
        return { valid: false, missing: ['HF_DATASET_ID_FORMAT_ERROR: Must be "username/dataset"'] };
    }

    return {
        valid: missing.length === 0,
        missing: missing
    };
}
