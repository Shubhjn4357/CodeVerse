"use server";

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";

const execAsync = promisify(exec);

const WORKSPACE_ROOT = process.cwd();

export interface SearchResult {
    file: string;
    line: number;
    col: number;
    text: string;
    preview: string;
}

/**
 * Find ripgrep binary – prioritize local install, fallback to system PATH
 */
async function getRgBin(): Promise<string> {
    const localBins = [
        path.join(WORKSPACE_ROOT, "node_modules", ".bin", "rg.exe"),
        path.join(WORKSPACE_ROOT, "node_modules", ".bin", "rg"),
    ];
    for (const p of localBins) {
        try {
            await fs.access(p);
            return `"${p}"`;
        } catch { }
    }
    return "rg"; // Fall back to system rg
}

/**
 * Full-text ripgrep search inside the workspace
 */
export async function searchCodebase(
    query: string,
    options: {
        caseSensitive?: boolean;
        regex?: boolean;
        fileGlob?: string;
        maxResults?: number;
    } = {}
): Promise<SearchResult[]> {
    if (!query.trim()) return [];

    const { caseSensitive = false, regex = false, fileGlob, maxResults = 100 } = options;

    const rg = await getRgBin();
    const flags = [
        "--json",
        `--max-count=${maxResults}`,
        "--line-number",
        "--column",
        !caseSensitive ? "--ignore-case" : "",
        regex ? "" : "--fixed-strings",
        fileGlob ? `--glob '${fileGlob}'` : "",
        "--glob '!node_modules'",
        "--glob '!.git'",
        "--glob '!.next'",
    ]
        .filter(Boolean)
        .join(" ");

    const cmd = `${rg} ${flags} ${JSON.stringify(query)} ${JSON.stringify(WORKSPACE_ROOT)} 2>&1`;

    try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 10 * 1024 * 1024 });
        const lines = stdout.trim().split("\n").filter(Boolean);

        const results: SearchResult[] = [];

        for (const line of lines) {
            try {
                const parsed = JSON.parse(line);
                if (parsed.type === "match") {
                    const data = parsed.data;
                    const filePath = data.path.text.replace(WORKSPACE_ROOT, "").replace(/\\/g, "/").slice(1);

                    results.push({
                        file: filePath,
                        line: data.line_number,
                        col: data.submatches[0]?.start ?? 0,
                        text: data.lines.text.trimEnd(),
                        preview: data.lines.text.trim().slice(0, 200),
                    });
                }
            } catch { }
        }

        return results;
    } catch (e: unknown) {
        // rg exits with code 1 when no matches found – that's OK
        if ((e as { code?: number }).code === 1) return [];
        throw e;
    }
}

/**
 * Find files by name glob pattern
 */
export async function findFilesByName(pattern: string): Promise<string[]> {
    const rg = await getRgBin();
    const cmd = `${rg} --files ${JSON.stringify(WORKSPACE_ROOT)} --glob '${pattern}' --glob '!node_modules' --glob '!.git' --glob '!.next' 2>&1`;

    try {
        const { stdout } = await execAsync(cmd, { maxBuffer: 5 * 1024 * 1024 });
        return stdout
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(p => p.replace(WORKSPACE_ROOT, "").replace(/\\/g, "/").slice(1));
    } catch {
        return [];
    }
}
