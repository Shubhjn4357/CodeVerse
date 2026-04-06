/**
 * CodeVerse Environment Configuration & Requirements Manifest.
 * Centralizing all system variables for production-grade reliability.
 */
export const ENV_CONFIG = {
    // 1. Storage & Persistence
    HF_TOKEN: process.env.HF_TOKEN,
    HF_DATASET_ID: process.env.HF_DATASET_ID,
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || '/app/workspaces',

    // 2. Build Acceleration
    CACHIX_CACHE_NAME: process.env.CACHIX_CACHE_NAME,
    CACHIX_AUTH_TOKEN: process.env.CACHIX_AUTH_TOKEN,

    // 3. Infrastructure State
    NODE_ENV: process.env.NODE_ENV || 'production',
    SPACE_ID: process.env.SPACE_ID, // Hugging Face Space Identity
    APP_BASE_URL: process.env.NEXTAUTH_URL || 'http://localhost:7860',

    // 4. Database & Auth
    AUTH_SECRET: process.env.AUTH_SECRET,
    DATABASE_URL: process.env.TURSO_URL,
    DATABASE_AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
};

/**
 * Validates that all critical infrastructure secrets are available.
 */
export function validateEnvironment() {
    const missing: string[] = [];
    if (!ENV_CONFIG.HF_TOKEN) missing.push('HF_TOKEN');
    if (!ENV_CONFIG.HF_DATASET_ID) missing.push('HF_DATASET_ID');
    if (!ENV_CONFIG.AUTH_SECRET) missing.push('AUTH_SECRET');
    if (!ENV_CONFIG.DATABASE_URL) missing.push('TURSO_URL');

    // Strategic Dataset Validation
    if (ENV_CONFIG.HF_DATASET_ID && !ENV_CONFIG.HF_DATASET_ID.includes('/')) {
        console.error("[CRITICAL] HF_DATASET_ID must be in 'username/dataset' format.");
        return { valid: false, missing: ['HF_DATASET_ID_FORMAT_ERROR'] };
    }

    return {
        valid: missing.length === 0,
        missing: missing
    };
}
