"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIdleContainers = checkIdleContainers;
exports.startAutoSleepCron = startAutoSleepCron;
const dockerode_1 = __importDefault(require("dockerode"));
const manager_1 = require("../docker/manager");
const db_1 = require("../db");
const docker = new dockerode_1.default({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });
// Store previous network RX bytes to calculate delta
const networkThresholds = new Map();
async function checkIdleContainers() {
    if (!(await (0, manager_1.isDockerAvailable)())) {
        return;
    }
    console.log("[Auto-Sleep] Running idle container check...");
    try {
        const containers = await docker.listContainers({
            filters: { name: ["codeverse-workspace-"] }
        });
        for (const c of containers) {
            const containerName = c.Names[0].replace("/", "");
            const workspaceId = containerName.replace("codeverse-workspace-", "");
            const container = docker.getContainer(c.Id);
            const stats = await container.stats({ stream: false });
            // Extract network Rx (received) bytes
            let currentRx = 0;
            if (stats.networks && stats.networks.eth0) {
                currentRx = stats.networks.eth0.rx_bytes;
            }
            const previousRx = networkThresholds.get(workspaceId);
            if (previousRx !== undefined) {
                const delta = currentRx - previousRx;
                // If delta is less than 5KB over the interval, it's considered idle
                if (delta < 5000) {
                    console.log(`[Auto-Sleep] Workspace ${workspaceId} is idle. Shutting down.`);
                    await (0, manager_1.stopWorkspaceContainer)(workspaceId);
                    // Update DB
                    await db_1.db.execute({
                        sql: "UPDATE workspaces SET status = 'sleeping' WHERE id = ?",
                        args: [workspaceId]
                    });
                    networkThresholds.delete(workspaceId);
                    continue; // Skip setting new threshold
                }
            }
            // Set threshold for next check
            networkThresholds.set(workspaceId, currentRx);
        }
    }
    catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        console.error("[Auto-Sleep] Error running cron:", errorMessage);
    }
}
function startAutoSleepCron() {
    // Run every 30 minutes (1800000 ms)
    // For testing/dev we run it every 5 minutes (300000 ms)
    const interval = process.env.NODE_ENV === "production" ? 1800000 : 300000;
    setInterval(checkIdleContainers, interval);
    console.log(`[Auto-Sleep] Cron initialized. Running every ${interval / 60000} minutes.`);
}
