"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserWorkspaceRoot = getUserWorkspaceRoot;
exports.resolveSafeProjectPath = resolveSafeProjectPath;
exports.resolveSafePath = resolveSafePath;
const path_1 = __importDefault(require("path"));
const promises_1 = __importDefault(require("fs/promises"));
const fs_1 = require("fs");
const env_config_1 = require("../env-config");
function resolveWorkspaceBase() {
    // Standardize for production-grade isolation
    const workspaceRoot = env_config_1.ENV_CONFIG.WORKSPACE_ROOT;
    try {
        if (!(0, fs_1.existsSync)(workspaceRoot)) {
            (0, fs_1.mkdirSync)(workspaceRoot, { recursive: true });
        }
        return workspaceRoot;
    }
    catch (e) {
        console.error(`[SYSTEM] Critical Storage Error for ${workspaceRoot}:`, e);
        return workspaceRoot;
    }
}
const WORKSPACE_BASE = resolveWorkspaceBase();
/**
 * Returns the root directory for a specific user's workspaces.
 * e.g., /path/to/codeverse/workspaces/{userId}
 */
async function getUserWorkspaceRoot(userId) {
    const userRoot = path_1.default.join(/*turbopackIgnore: true*/ WORKSPACE_BASE, userId);
    try {
        await promises_1.default.mkdir(userRoot, { recursive: true });
    }
    catch (e) {
        if (e && typeof e === 'object' && 'code' in e && e.code === "EACCES") {
            throw new Error(`Permission Denied: Cannot create ${userRoot}. Ensure your persistent storage is mounted with write access for UID 1000.`);
        }
        throw e;
    }
    return userRoot;
}
/**
 * Resolves a safe, isolated path within a specific project in a user's workspace.
 * Prevents project-level directory traversal.
 */
async function resolveSafeProjectPath(userId, projectName, subPath = "") {
    const userRoot = await getUserWorkspaceRoot(userId);
    const projectRoot = path_1.default.resolve(/*turbopackIgnore: true*/ userRoot, projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60));
    // Normalize and resolve the absolute path
    const targetPath = path_1.default.resolve(/*turbopackIgnore: true*/ projectRoot, subPath);
    // Security Check: Ensure the resolved path is still within the project root
    if (!targetPath.startsWith(projectRoot)) {
        throw new Error("Security Violation: Path traversal detected.");
    }
    return targetPath;
}
/**
 * Resolves a safe, isolated path directly within a user's root workspace (e.g. for listing project names).
 */
async function resolveSafePath(userId, subPath) {
    const userRoot = await getUserWorkspaceRoot(userId);
    // Normalize and resolve the absolute path
    const targetPath = path_1.default.resolve(/*turbopackIgnore: true*/ userRoot, subPath);
    // Security Check: Ensure the resolved path is still within the user's root
    if (!targetPath.startsWith(userRoot)) {
        throw new Error("Security Violation: Path traversal detected.");
    }
    return targetPath;
}
