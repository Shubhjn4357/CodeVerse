import { execSync, spawn } from "child_process";
import path from "path";
import fs from "fs";

export type PackageManager = "npm" | "pnpm" | "bun" | "yarn";

function isAvailable(bin: string): boolean {
    try {
        execSync(`${bin} --version`, { stdio: "ignore" });
        return true;
    } catch {
        return false;
    }
}

export function detectPackageManagers(): PackageManager[] {
    const available: PackageManager[] = [];
    if (isAvailable("npm")) available.push("npm");
    if (isAvailable("pnpm")) available.push("pnpm");
    if (isAvailable("bun")) available.push("bun");
    if (isAvailable("yarn")) available.push("yarn");
    return available;
}

export function preferredPmFromLockfile(cwd: string): PackageManager {
    if (fs.existsSync(path.join(cwd, "bun.lockb"))) return "bun";
    if (fs.existsSync(path.join(cwd, "pnpm-lock.yaml"))) return "pnpm";
    if (fs.existsSync(path.join(cwd, "yarn.lock"))) return "yarn";
    return "npm";
}

const PM_COMMANDS: Record<PackageManager, { install: string[]; add: string[]; run: string[] }> = {
    npm: { install: ["npm", "install"], add: ["npm", "install"], run: ["npm", "run"] },
    pnpm: { install: ["pnpm", "install"], add: ["pnpm", "add"], run: ["pnpm", "run"] },
    bun: { install: ["bun", "install"], add: ["bun", "add"], run: ["bun", "run"] },
    yarn: { install: ["yarn", "install"], add: ["yarn", "add"], run: ["yarn", "run"] },
};

export function spawnInstall(pm: PackageManager, cwd: string) {
    const [cmd, ...args] = PM_COMMANDS[pm].install;
    return spawn(cmd, args, { cwd, shell: true, env: process.env });
}

export function spawnAdd(pm: PackageManager, pkg: string, cwd: string) {
    const [cmd, ...args] = PM_COMMANDS[pm].add;
    return spawn(cmd, [...args, pkg], { cwd, shell: true, env: process.env });
}

export function spawnRunScript(pm: PackageManager, script: string, cwd: string) {
    const [cmd, ...args] = PM_COMMANDS[pm].run;
    return spawn(cmd, [...args, script], { cwd, shell: true, env: process.env });
}

export function getInstallCommand(pm: PackageManager): string {
    return PM_COMMANDS[pm].install.join(" ");
}
