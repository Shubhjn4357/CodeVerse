"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENV_CONFIG = void 0;
exports.validateEnvironment = validateEnvironment;
/**
 * CodeVerse Environment Configuration & Requirements Manifest.
 * Centralizing all system variables for production-grade reliability.
 */
exports.ENV_CONFIG = {
    // 1. Storage & Persistence
    HF_TOKEN: process.env.HF_TOKEN || process.env.hfToken || process.env.HF_SPACE || process.env.HuggingFaceToken,
    HF_DATASET_ID: process.env.HF_DATASET_ID || process.env.hfDataset || process.env.HF_DATASET,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || '/home/nodejs/app/workspaces',
    // 2. Build Acceleration
    CACHIX_CACHE_NAME: process.env.CACHIX_CACHE_NAME || 'code-nix',
    CACHIX_AUTH_TOKEN: process.env.CACHIX_AUTH_TOKEN,
    // 3. Infrastructure State
    NODE_ENV: process.env.NODE_ENV || 'production',
    SPACE_ID: process.env.SPACE_ID,
    APP_BASE_URL: process.env.NEXTAUTH_URL || 'http://localhost:7860',
    IS_SBC: !!process.env.SPACE_ID,
    // 4. Database & Auth
    AUTH_SECRET: process.env.AUTH_SECRET || process.env.authSecret,
    TURSO_URL: process.env.TURSO_URL || process.env.turso_url || process.env.database_url || process.env.TURSO_DATABASE_URL || process.env.DB_URL,
    TURSO_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN || process.env.turso_auth_token || process.env.DB_TOKEN,
};
/**
 * Validates that all critical infrastructure secrets are available.
 */
function validateEnvironment() {
    const missing = [];
    if (!exports.ENV_CONFIG.HF_TOKEN)
        missing.push('HF_TOKEN (Missing Persistence Link)');
    if (!exports.ENV_CONFIG.HF_DATASET_ID)
        missing.push('HF_DATASET_ID (Missing Data Segment)');
    if (!exports.ENV_CONFIG.AUTH_SECRET)
        missing.push('AUTH_SECRET (Security Risk)');
    if (!exports.ENV_CONFIG.TURSO_URL)
        missing.push('TURSO_URL (Database Missing)');
    // Strategic Dataset Validation
    if (exports.ENV_CONFIG.HF_DATASET_ID && !exports.ENV_CONFIG.HF_DATASET_ID.includes('/')) {
        return { valid: false, missing: ['HF_DATASET_ID_FORMAT_ERROR: Must be "username/dataset"'] };
    }
    return {
        valid: missing.length === 0,
        missing: missing
    };
}
