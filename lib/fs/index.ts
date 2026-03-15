import fs from "fs/promises";
import path from "path";
import { DirectoryNode } from "../../types";

const WORKSPACE_ROOT = process.cwd();

export async function readDir(dirPath: string = ""): Promise<DirectoryNode[]> {
    const target = path.join(WORKSPACE_ROOT, dirPath);

    if (!target.startsWith(WORKSPACE_ROOT)) {
        throw new Error("Access denied: path outside workspace");
    }

    try {
        const entries = await fs.readdir(target, { withFileTypes: true });

        return entries
            .filter(e => !e.name.startsWith(".git") && e.name !== "node_modules")
            .map(
                (entry): DirectoryNode => ({
                    name: entry.name,
                    path: path.join(dirPath, entry.name).replace(/\\/g, "/"),
                    type: entry.isDirectory() ? "directory" : "file",
                })
            )
            .sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === "directory" ? -1 : 1;
            });
    } catch (err: unknown) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === "ENOENT") return [];
        throw err;
    }
}

export async function readFile(filePath: string): Promise<string> {
    const target = path.join(WORKSPACE_ROOT, filePath);
    if (!target.startsWith(WORKSPACE_ROOT)) throw new Error("Access denied");
    return fs.readFile(target, "utf-8");
}

export async function writeFile(filePath: string, content: string): Promise<void> {
    const target = path.join(WORKSPACE_ROOT, filePath);
    if (!target.startsWith(WORKSPACE_ROOT)) throw new Error("Access denied");

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, content, "utf-8");
}

export async function deletePath(targetPath: string): Promise<void> {
    const target = path.join(WORKSPACE_ROOT, targetPath);
    if (!target.startsWith(WORKSPACE_ROOT)) throw new Error("Access denied");

    const stat = await fs.stat(target);
    if (stat.isDirectory()) {
        await fs.rm(target, { recursive: true, force: true });
    } else {
        await fs.unlink(target);
    }
}
