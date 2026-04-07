import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync } from "fs";

import { ENV_CONFIG } from "@/lib/env-config";

function resolveWorkspaceBase(): string {
    // Standardize for production-grade isolation
    const workspaceRoot = ENV_CONFIG.WORKSPACE_ROOT;
    
    try {
        if (!existsSync(workspaceRoot)) {
            mkdirSync(workspaceRoot, { recursive: true });
        }
        return workspaceRoot;
    } catch (e) {
        console.error(`[SYSTEM] Critical Storage Error for ${workspaceRoot}:`, e);
        return workspaceRoot; 
    }
}

const WORKSPACE_BASE = resolveWorkspaceBase();

/**
 * Returns the root directory for a specific user's workspaces.
 * e.g., /path/to/codeverse/workspaces/{userId}
 */
export async function getUserWorkspaceRoot(userId: string): Promise<string> {
    const userRoot = path.join(/*turbopackIgnore: true*/ WORKSPACE_BASE, userId);
    try {
        await fs.mkdir(userRoot, { recursive: true });
    } catch (e: unknown) {
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
export async function resolveSafeProjectPath(userId: string, projectName: string, subPath: string = ""): Promise<string> {
    const userRoot = await getUserWorkspaceRoot(userId);
    const projectRoot = path.resolve(/*turbopackIgnore: true*/ userRoot, projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60));
    
    // Normalize and resolve the absolute path
    const targetPath = path.resolve(/*turbopackIgnore: true*/ projectRoot, subPath);

    // Security Check: Ensure the resolved path is still within the project root
    if (!targetPath.startsWith(projectRoot)) {
        throw new Error("Security Violation: Path traversal detected.");
    }

    return targetPath;
}

/**
 * Resolves a safe, isolated path directly within a user's root workspace (e.g. for listing project names).
 */
export async function resolveSafePath(userId: string, subPath: string): Promise<string> {
    const userRoot = await getUserWorkspaceRoot(userId);
    
    // Normalize and resolve the absolute path
    const targetPath = path.resolve(/*turbopackIgnore: true*/ userRoot, subPath);

    // Security Check: Ensure the resolved path is still within the user's root
    if (!targetPath.startsWith(userRoot)) {
        throw new Error("Security Violation: Path traversal detected.");
    }

    return targetPath;
}
