import { NextRequest, NextResponse } from 'next/server';
import Docker from 'dockerode';

const docker = new Docker({ socketPath: process.platform === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock' });

export async function PATCH(req: NextRequest) {
    try {
        const body = await req.json();
        const { id, env } = body;

        if (!id || typeof env !== 'object') {
            return NextResponse.json({ success: false, error: "Missing workspace id or env object" }, { status: 400 });
        }

        const containerName = `codeverse-workspace-${id}`;
        const container = docker.getContainer(containerName);

        const info = await container.inspect();
        if (!info.State.Running) {
            return NextResponse.json({ success: false, error: "Workspace is not running" }, { status: 400 });
        }

        // Dynamically inject all keys
        for (const [key, value] of Object.entries(env)) {
            const safeKey = String(key).replace(/[^a-zA-Z0-9_]/g, '');
            // We escape the value for bash
            const safeVal = String(value).replace(/'/g, "'\\''");

            const exec = await container.exec({
                Cmd: ['bash', '-c', `echo "export ${safeKey}='${safeVal}'" >> /home/coder/.bashrc && echo "export ${safeKey}='${safeVal}'" >> /home/coder/.profile`],
                User: 'coder',
                AttachStdout: true,
                AttachStderr: true,
            });
            await exec.start({ Detach: false });
        }

        return NextResponse.json({ success: true, message: "Environment variables injected successfully. Please restart your IDE terminal." });
    } catch (e: unknown) {
        return NextResponse.json({ success: false, error: (e as Error).message }, { status: 500 });
    }
}
