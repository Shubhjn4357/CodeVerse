"use server";

import fs from "fs/promises";
import path from "path";

// Ensure all paths map securely within current working directory
function sanitizePath(unsafePath: string) {
    const resolved = path.resolve(unsafePath);
    if (!resolved.startsWith(process.cwd())) {
        throw new Error("Security Error: Path traversal detected outside workspace boundaries.");
    }
    return resolved;
}

export async function readDirAction(dirPath: string) {
    try {
        const target = sanitizePath(dirPath);
        const entries = await fs.readdir(target, { withFileTypes: true });

        // Sort directories first, then alphabetically
        const sorted = entries.sort((a, b) => {
            if (a.isDirectory() && !b.isDirectory()) return -1;
            if (!a.isDirectory() && b.isDirectory()) return 1;
            return a.name.localeCompare(b.name);
        });

        return {
            success: true,
            entries: sorted.map(e => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" }))
        };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}

export async function createFileAction(filePath: string, content: string = "") {
    try {
        const target = sanitizePath(filePath);
        await fs.mkdir(path.dirname(target), { recursive: true });

        // Check if it exists. If it does, we probably don't want to blindly overwrite from FileTree context.
        try {
            await fs.access(target);
            // exists, maybe it's just an empty file creation attempt. Let it be or throw depending on usage.
        } catch {
            await fs.writeFile(target, content, "utf-8");
        }
        return { success: true };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}

export async function deleteFileAction(filePath: string) {
    try {
        const target = sanitizePath(filePath);
        const stat = await fs.stat(target);
        if (stat.isDirectory()) {
            await fs.rm(target, { recursive: true, force: true });
        } else {
            await fs.unlink(target);
        }
        return { success: true };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}

export async function renameFileAction(oldPath: string, newPath: string) {
    try {
        const source = sanitizePath(oldPath);
        const target = sanitizePath(newPath);
        await fs.rename(source, target);
        return { success: true };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}

export async function readFileAction(filePath: string) {
    try {
        const target = sanitizePath(filePath);
        const content = await fs.readFile(target, "utf-8");
        return { success: true, content };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}

export async function saveFileAction(filePath: string, content: string) {
    try {
        const target = sanitizePath(filePath);
        await fs.writeFile(target, content, "utf-8");
        return { success: true };
    } catch (error: unknown) {
        if(error instanceof Error){
            return { success: false, error: error.message };
        }
        return { success: false, error: "Unknown error" };
    }
}
