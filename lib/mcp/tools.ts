/* eslint-disable @typescript-eslint/ban-ts-comment */
import { tool } from "ai";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const cwd = process.cwd();

export const coreTools = {
    read_file: tool({
        description: "Read the full content of a file",
        parameters: z.object({ filePath: z.string().describe("Absolute or relative path to the file") }),
        // @ts-expect-error - AI SDK generic limitation
        execute: async (args: { filePath: string }): Promise<Record<string, unknown>> => {
            const { filePath } = args;
            try {
                const fullPath = path.resolve(cwd, filePath);
                const content = await fs.readFile(fullPath, "utf-8");
                return { success: true, content };
            } catch (e: unknown) {
                return { success: false, error: (e as Error).message };
            }
        },
    }),

    write_file: tool({
        description: "Write content to a file (overwrites existing)",
        parameters: z.object({
            filePath: z.string(),
            content: z.string().describe("The full replacement content"),
        }),
        // @ts-expect-error - AI SDK generic limitation
        execute: async (args: { filePath: string, content: string }): Promise<Record<string, unknown>> => {
            const { filePath, content } = args;
            try {
                const fullPath = path.resolve(cwd, filePath);
                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, content, "utf-8");
                return { success: true, path: fullPath };
            } catch (e: unknown) {
                return { success: false, error: (e as Error).message };
            }
        },
    }),

    terminal_command: tool({
        description: "Execute a bash/shell command strictly in the workspace",
        parameters: z.object({
            command: z.string().describe("The command to run e.g. 'npm run build' or 'tsc --noEmit'"),
            background: z.boolean().optional().describe("Run in background without waiting for finish"),
        }),
        // @ts-expect-error - AI SDK generic limitation
        execute: async (args: { command: string, background?: boolean }): Promise<Record<string, unknown>> => {
            const { command, background } = args;
            try {
                if (background) {
                    exec(command, { cwd });
                    return { success: true, output: "Command started in background" };
                }
                const { stdout, stderr } = await execAsync(command, { cwd });
                return { success: true, stdout, stderr };
            } catch (e: unknown) {
                return { success: false, error: (e as Error).message, stderr: (e as { stderr?: string }).stderr };
            }
        },
    }),

    search_code: tool({
        description: "Search for a regex pattern across all workspace files",
        parameters: z.object({
            pattern: z.string().describe("Regex or strict string to search"),
            glob: z.string().optional().describe("File restriction e.g. '*.ts'"),
        }),
        // @ts-expect-error - AI SDK generic limitation
        execute: async (args: { pattern: string }): Promise<Record<string, unknown>> => {
            const { pattern } = args;
            try {
                // Simple grep fallback 
                const { stdout } = await execAsync(`git grep -n "${pattern}" || grep -rn "${pattern}" .`, { cwd });
                return { success: true, matches: stdout.split("\n").filter(Boolean) };
            } catch (e: unknown) {
                return { success: false, error: (e as Error).message };
            }
        },
    }),
};
