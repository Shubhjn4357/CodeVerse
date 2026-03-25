"use server";

import Docker from 'dockerode';

const docker = new Docker({ 
    socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' 
});

export async function checkDeviceAvailability(platform: string, workspaceId: string) {
    try {
        if (platform === "android") {
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
            const containerName = `codeverse-workspace-${workspaceId}`;
            const container = docker.getContainer(containerName);
            const info = await container.inspect();
            
            if (info.State.Running) {
                const port = info.NetworkSettings.Ports['8080/tcp']?.[0]?.HostPort;
                return { available: true, port };
            }
            return { available: false, reason: "Workspace container is not running." };
        }

        if (platform === "ios") {
            // iOS usually relies on an external Appetize.io URL stored in config
            // We'll check if the workspace has it configured
            const { loadWorkspaceConfig } = await import('@/lib/docker/builder');
            const path = await import('path');
            const dataPath = process.env.DATA_PATH || path.resolve(process.cwd(), 'data/projects', workspaceId);
            const config = await loadWorkspaceConfig(dataPath);
            
            if (config.ios?.appetizeUrl) {
                return { available: true, appetizeUrl: config.ios.appetizeUrl };
            }
            return { available: false, reason: "iOS Appetize URL not configured in dev.nix or codeverse.json." };
        }

        if (platform === "windows") {
            return { available: false, reason: "Windows virtualization is not provisioned for this workspace." };
        }

        return { available: false, reason: "Unknown platform" };
    } catch (e: unknown) {
        return { available: false, reason: `System check failed: ${(e as Error).message}` };
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
    } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
    }
}
