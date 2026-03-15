import fs from 'fs/promises';
import path from 'path';
import Docker from 'dockerode';
import tar from 'tar-fs';

const docker = new Docker();

export interface CodeverseConfig {
    env?: Record<string, string>;
    packages?: {
        apt?: string[];
        npm?: string[];
    };
    ios?: {
        appetizeUrl?: string;
    };
}

/**
 * Parses a simple subset of Nix language from .idx/dev.nix
 * Extracts pkgs.* into apt packages and env.* into env vars.
 */
function parseBasicNix(nixContent: string): CodeverseConfig {
    const config: CodeverseConfig = { packages: { apt: [], npm: [] }, env: {} };

    // Extract packages: pkgs.nodejs_20, pkgs.python3, etc.
    const pkgMatches = nixContent.matchAll(/pkgs\.([a-zA-Z0-9_\-]+)/g);
    for (const match of pkgMatches) {
        let pkgName = match[1];
        // Soft map nix packages to common ubuntu apt packages
        if (pkgName.startsWith('nodejs')) pkgName = 'nodejs npm';
        else if (pkgName.startsWith('python')) pkgName = 'python3 python3-pip';
        else if (pkgName === 'go') pkgName = 'golang';
        else if (pkgName === 'rust') pkgName = 'rustc cargo';
        // Add unique
        const split = pkgName.split(' ');
        for (const p of split) {
            if (!config.packages!.apt!.includes(p)) config.packages!.apt!.push(p);
        }
    }

    // Extract basic env: PORT = 3000;
    const envBlockMatch = nixContent.match(/env\s*=\s*{([^}]+)}/);
    if (envBlockMatch) {
        const envLines = envBlockMatch[1].split('\n');
        for (const line of envLines) {
            const kvMatch = line.trim().match(/([a-zA-Z0-9_]+)\s*=\s*['"]?([^'";]+)['"]?\s*;/);
            if (kvMatch) {
                config.env![kvMatch[1]] = kvMatch[2];
            }
        }
    }

    return config;
}

export async function loadWorkspaceConfig(workspacePath: string): Promise<CodeverseConfig> {
    const codeverseJsonPath = path.join(workspacePath, 'codeverse.json');
    const idxNixPath = path.join(workspacePath, '.idx', 'dev.nix');

    // 1. Check for Project IDX dev.nix
    try {
        const nixContent = await fs.readFile(idxNixPath, 'utf-8');
        return parseBasicNix(nixContent);
    } catch {
        // Fallthrough if no dev.nix
    }

    // 2. Check for codeverse.json
    try {
        const jsonContent = await fs.readFile(codeverseJsonPath, 'utf-8');
        return JSON.parse(jsonContent);
    } catch (err: unknown) {
        const fsErr = err as Error & { code?: string };
        if (fsErr.code === 'ENOENT') {
            // 3. Create default if none exists
            const defaultConfig: CodeverseConfig = {
                "env": { "PORT": "3000" },
                "packages": { "apt": [], "npm": [] }
            };
            await fs.writeFile(codeverseJsonPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
        throw err;
    }
}

/**
 * Dynamically writes a Dockerfile and uses Docker's native layer caching 
 * to speed up future startups with the same packages.
 */
export async function buildWorkspaceImage(
    workspaceId: string,
    workspacePath: string,
    onLog: (msg: string) => void
): Promise<{ imageName: string, config: CodeverseConfig }> {

    onLog("Loading workspace configuration (codeverse.json or dev.nix)...");
    const config = await loadWorkspaceConfig(workspacePath);

    // Generate Dockerfile content
    let dockerfile = `FROM codercom/code-server:latest\n`;
    dockerfile += `USER root\n`;

    // APT Packages
    if (config.packages?.apt && config.packages.apt.length > 0) {
        const aptList = config.packages.apt.join(' ');
        dockerfile += `RUN apt-get update && apt-get install -y ${aptList} && rm -rf /var/lib/apt/lists/*\n`;
    }

    // NPM Packages
    if (config.packages?.npm && config.packages.npm.length > 0) {
        // Ensure nodejs and npm are present if not already installed
        if (!config.packages.apt?.some(p => p.includes('npm'))) {
            dockerfile += `RUN apt-get update && apt-get install -y nodejs npm && rm -rf /var/lib/apt/lists/*\n`;
        }
        const npmList = config.packages.npm.join(' ');
        dockerfile += `RUN npm install -g ${npmList}\n`;
    }

    // Environment map (so they exist in all shells)
    // We add them to /etc/environment and .bashrc to be safe
    if (config.env) {
        for (const [k, v] of Object.entries(config.env)) {
            dockerfile += `ENV ${k}="${v}"\n`;
            dockerfile += `RUN echo 'export ${k}="${v}"' >> /home/coder/.bashrc\n`;
        }
    }

    dockerfile += `USER coder\n`;
    // Set WORKDIR
    dockerfile += `WORKDIR /home/coder/project\n`;

    // Write to a temporary hidden dir in the workspace
    const buildDir = path.join(workspacePath, '.codeverse');
    await fs.mkdir(buildDir, { recursive: true });

    const dockerfilePath = path.join(buildDir, 'Dockerfile');
    await fs.writeFile(dockerfilePath, dockerfile);

    const imageName = `codeverse-workspace-${workspaceId}`;
    onLog(`Building image ${imageName}...`);

    return new Promise((resolve, reject) => {
        // Native Docker build engine with tar-fs
        const pack = tar.pack(buildDir);
        docker.buildImage(pack, { t: imageName }, (err: Error | null, stream?: NodeJS.ReadableStream) => {
            if (err) return reject(err);
            if (!stream) return reject(new Error("No stream returned from Docker build"));

            docker.modem.followProgress(stream,
                (err: Error | null, res: unknown[]) => {
                    if (err) return reject(err);
                    onLog(`Image ${imageName} built successfully.`);
                    resolve({ imageName, config });
                },
                (event: { stream?: string, error?: string, status?: string }) => {
                    if (event.stream) onLog(event.stream.trim());
                    else if (event.status) onLog(event.status.trim());
                    else if (event.error) onLog(`Build Error: ${event.error}`);
                }
            );
        });
    });
}
