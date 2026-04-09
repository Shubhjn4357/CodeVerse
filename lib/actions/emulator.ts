"use server";

import Docker from 'dockerode';
import { ENV_CONFIG } from '@/lib/env-config';

const docker = new Docker({ 
    socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' 
});

import { isDockerAvailable } from '@/lib/docker/manager';

export async function checkDeviceAvailability(platform: string, workspaceId: string) {
    try {
        const hasDocker = await isDockerAvailable();

        if (platform === "android") {
            if (!hasDocker) {
                return { available: false, reason: "Android virtualization requires Docker which is not available in this cloud environment." };
            }
            const containerName = `codeverse-android-${workspaceId}`;
            const container = docker.getContainer(containerName);
            const info = await container.inspect();
            
            if (info.State.Running) {
                const port = info.NetworkSettings.Ports['6080/tcp']?.[0]?.HostPort;
                return { available: true, port };
            }
            return { available: false, reason: "Android emulator container is not running." };
        }

        if (platform === "web") {
            // Web Preview is always available via the dynamic proxy in both Docker and Native modes
            return { available: true };
        }

        if (platform === "ios") {
            // iOS usually relies on an external Appetize.io URL stored in config
            const { loadWorkspaceConfig } = await import('@/lib/docker/builder');
            const path = await import('path');
            
            const userId = "default-user"; 
            const workspaceRoot = ENV_CONFIG.WORKSPACE_ROOT || path.join(/*turbopackIgnore: true*/ '/home/node/w');
            const dataPath = path.join(/*turbopackIgnore: true*/ workspaceRoot, userId, workspaceId);
            
            try {
                const config = await loadWorkspaceConfig(dataPath);
                if (config.ios?.appetizeUrl) {
                    return { available: true, appetizeUrl: config.ios.appetizeUrl };
                }
            } catch {
                // Config missing or error reading it
            }
            return { available: false, reason: "iOS Appetize URL not configured in dev.nix or codeverse.json." };
        }

        if (platform === "windows") {
            return { available: false, reason: "Windows virtualization is not provisioned for this workspace." };
        }

        return { available: false, reason: "Unknown platform" };
    } catch {
        return { available: false, reason: "Virtualization is not available in current cloud context." };
    }
}

export async function requestEmulatorRestart(platform: string, workspaceId: string) {
    try {
        let containerName = "";
        if (platform === "android") containerName = `codeverse-android-${workspaceId}`;
        else if (platform === "web") containerName = `codeverse-workspace-${workspaceId}`;
        else return { success: false, error: "Platform does not support direct restart via this action." };

        const container = docker.getContainer(containerName);
        await container.restart();
        
        return { success: true, message: `${platform} container restarted successfully.` };
    } catch {
        return { success: false, error: "Restart failed." };
    }
}
