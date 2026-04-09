"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkIdleContainers = checkIdleContainers;
exports.startAutoSleepCron = startAutoSleepCron;
const manager_1 = require("../docker/manager");
const db_1 = require("../db");
const client_1 = require("../docker/client");
const env_config_1 = require("../env-config");
// Store previous network RX bytes to calculate delta
const networkThresholds = new Map();
async function checkIdleContainers() {
    const status = await (0, manager_1.isDockerAvailable)();
    if (!status.available) {
        return;
    }
    const dockerResolution = await (0, client_1.resolveDockerClient)(env_config_1.ENV_CONFIG.DOCKER_PROBE_TIMEOUT_MS);
    if (!dockerResolution) {
        return;
    }
    const docker = dockerResolution.docker;
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
