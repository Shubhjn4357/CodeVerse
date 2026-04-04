import path from "path";
import fs from "fs/promises";
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from "fs";

function resolveWorkspaceBase(): string {
    const cwd = process.cwd();
    // Optimized sequence: Env Var -> Subfolder -> Mount Root -> Local App Data -> Local Home
    const candidates = [
        process.env.WORKSPACE_DIR,
        "/data/workspaces",
        "/data",
        path.join(cwd, "workspaces"),
        path.join(cwd, "data", "workspace") // User-requested fallback path
    ];

    for (const cand of candidates) {
        if (!cand) continue;
        try {
            const absolutePath = path.resolve(cand);
            // Ensure path exists
            if (!existsSync(absolutePath)) {
                mkdirSync(absolutePath, { recursive: true });
            }
            
            // Critical Test: Check if we can actually write to this path
            const testFile = path.join(absolutePath, `.write_test_${Math.random().toString(36).substring(7)}`);
            writeFileSync(testFile, "test");
            unlinkSync(testFile);
            
            console.log(`[SYSTEM] Found writable workspace root: ${absolutePath}`);
            return absolutePath;
        } catch {
            // Silently try next candidate if this one is read-only or unreachable
        }
    }

    const ultimateFallback = path.join(cwd, "workspaces");
    console.warn(`[SYSTEM] Persistence unavailable. Using local fallback: ${ultimateFallback}`);
    return ultimateFallback;
}

const WORKSPACE_BASE = resolveWorkspaceBase();

/**
 * Returns the root directory for a specific user's workspaces.
 * e.g., /path/to/codeverse/workspaces/{userId}
 */
export async function getUserWorkspaceRoot(userId: string): Promise<string> {
    const userRoot = path.join(WORKSPACE_BASE, userId);
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
    const projectRoot = path.resolve(userRoot, projectName.replace(/[^a-zA-Z0-9-_]/g, "-").slice(0, 60));
    
    // Normalize and resolve the absolute path
    const targetPath = path.resolve(projectRoot, subPath);

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
    const targetPath = path.resolve(userRoot, subPath);

    // Security Check: Ensure the resolved path is still within the user's root
    if (!targetPath.startsWith(userRoot)) {
        throw new Error("Security Violation: Path traversal detected.");
    }

    return targetPath;
}
