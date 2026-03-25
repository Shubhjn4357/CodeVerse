import path from "path";
import fs from "fs/promises";

const WORKSPACE_BASE = path.join(process.cwd(), "workspaces");

/**
 * Returns the root directory for a specific user's workspaces.
 * e.g., /path/to/codeverse/workspaces/{userId}
 */
export async function getUserWorkspaceRoot(userId: string): Promise<string> {
    const userRoot = path.join(WORKSPACE_BASE, userId);
    await fs.mkdir(userRoot, { recursive: true });
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
