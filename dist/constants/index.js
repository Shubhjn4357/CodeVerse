"use strict";
/**
 * 🛠️ CodeVerse Global Constants
 * Centralized source of truth for all non-changeable text, configuration, and magic numbers.
 * Adheres to Production-Grade Standards for consistency and maintainability.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ROUTES = exports.UI_STRINGS = exports.INFRA_CONFIG = exports.AUTH_CONFIG = exports.APP_CONFIG = void 0;
exports.APP_CONFIG = {
    NAME: "CodeVerse",
    VERSION: "1.0.0-stable",
    DESCRIPTION: "The fully managed, agentic VS Code environment running securely in the browser.",
    LOGO_SIZE: 40,
    DEFAULT_LANGUAGE: "typescript",
};
exports.AUTH_CONFIG = {
    DEV_USER_ID: "dev-user-id",
    DEV_USER_NAME: "Developer Guest",
    DEV_USER_EMAIL: "dev@codeverse.local",
    DEV_AVATAR: "https://github.com/identicons/dev.png",
    SESSION_STRATEGY: "jwt",
};
exports.INFRA_CONFIG = {
    WORKSPACE_ROOT: process.env.WORKSPACE_ROOT || "/home/node/w",
    TMPDIR: process.env.TMPDIR || "/tmp",
    HF_HOME: process.env.HF_HOME || "/tmp/.cache/huggingface",
    DEFAULT_PORT_START: 3001,
    IDLE_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutes
    PERSISTENCE_INTERVAL_MS: 60 * 1000, // 1 minute
};
exports.UI_STRINGS = {
    MAINTENANCE_TITLE: "Infrastructure Locked",
    MAINTENANCE_MESSAGE: "CodeVerse is currently initializing hardware. Please wait while we secure your environment.",
    LOGIN_TITLE: "CodeVerse Studio",
    LOGIN_SUBTITLE: "The fully managed, agentic VS Code environment running securely in the browser.",
    BYPASS_LABEL: "Bypass Login (Local Dev Only)",
};
exports.ROUTES = {
    HOME: "/",
    LOGIN: "/login",
    API: {
        AUTH: "/api/auth",
        WORKSPACE: "/api/workspace",
    }
};
