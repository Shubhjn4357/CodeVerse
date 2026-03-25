import { zodSchema } from "ai";
import type { ToolSet } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { resolveSafeProjectPath } from "../fs/isolation";

const execAsync = promisify(exec);

/**
 * Factory that creates user-isolated workspace tools for the AI agent.
 * Each tool is sandboxed to workspaces/{userId}/{workspaceName}/
 *
 * Note: Tools are built as plain objects using `zodSchema()` for `inputSchema`
 * instead of the `tool()` helper, because `tool()` in AI SDK v6 has broken
 * TypeScript overloads when `execute` returns union types in strict mode.
 */
export function createTools(userId: string, workspaceName: string): ToolSet {
    return {
        read_file: {
            description: "Read the full content of a file within the workspace",
            inputSchema: zodSchema(z.object({
                filePath: z.string().describe("Relative path from workspace root"),
            })),
            execute: async ({ filePath }: { filePath: string }) => {
                try {
                    const fullPath = await resolveSafeProjectPath(userId, workspaceName, filePath);
                    const content = await fs.readFile(fullPath, "utf-8");
                    return { success: true, content };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            },
        },

        write_file: {
            description: "Write/overwrite a file within the workspace",
            inputSchema: zodSchema(z.object({
                filePath: z.string().describe("Relative path to the file"),
                content: z.string().describe("Full file content to write"),
            })),
            execute: async ({ filePath, content }: { filePath: string; content: string }) => {
                try {
                    const fullPath = await resolveSafeProjectPath(userId, workspaceName, filePath);
                    await fs.mkdir(path.dirname(fullPath), { recursive: true });
                    await fs.writeFile(fullPath, content, "utf-8");
                    return { success: true, path: filePath };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            },
        },

        terminal_command: {
            description: "Run a shell command inside the workspace directory",
            inputSchema: zodSchema(z.object({
                command: z.string().describe("Shell command to execute"),
                background: z.boolean().optional().describe("Run async without capturing output"),
            })),
            execute: async ({ command, background }: { command: string; background?: boolean }) => {
                try {
                    const cwd = await resolveSafeProjectPath(userId, workspaceName);
                    if (background) {
                        exec(command, { cwd });
                        return { success: true, output: "Started in background" };
                    }
                    const { stdout, stderr } = await execAsync(command, { cwd });
                    return { success: true, stdout, stderr };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            },
        },

        search_code: {
            description: "Search for a text pattern across all workspace files",
            inputSchema: zodSchema(z.object({
                pattern: z.string().describe("Literal string or regex pattern"),
            })),
            execute: async ({ pattern }: { pattern: string }) => {
                try {
                    const cwd = await resolveSafeProjectPath(userId, workspaceName);
                    const { stdout } = await execAsync(
                        `git grep -n "${pattern}" 2>/dev/null || grep -rn "${pattern}" . 2>/dev/null || true`,
                        { cwd }
                    );
                    return { success: true, matches: stdout.split("\n").filter(Boolean) };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            },
        },

        list_files: {
            description: "List files in the project to understand its structure",
            inputSchema: zodSchema(z.object({
                recursive: z.boolean().optional().describe("Recursive listing (default: true)"),
            })),
            execute: async ({ recursive }: { recursive?: boolean }) => {
                const isRecursive = recursive !== false;
                try {
                    const cwd = await resolveSafeProjectPath(userId, workspaceName);
                    const cmd = isRecursive
                        ? "find . -maxdepth 4 -not -path '*/\\.*' -not -path '*/node_modules/*' -not -path '*/.next/*'"
                        : "ls -F";
                    const { stdout } = await execAsync(cmd, { cwd });
                    return { success: true, files: stdout.split("\n").filter(Boolean) };
                } catch (e) {
                    return { success: false, error: (e as Error).message };
                }
            },
        },
    } as ToolSet;
}

export type WorkspaceTools = ReturnType<typeof createTools>;
