"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadWorkspaceConfig = loadWorkspaceConfig;
exports.buildWorkspaceImage = buildWorkspaceImage;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const tar = __importStar(require("tar-fs"));
/**
 * Parses a simple subset of Nix language from .idx/dev.nix
 * Extracts pkgs.* into apt packages and env.* into env vars.
 */
function parseBasicNix(nixContent) {
    var _a, _b, _c, _d;
    const config = { packages: { apt: [], npm: [] }, env: {} };
    // Extract packages: pkgs.nodejs_20, pkgs.python3, etc.
    const pkgMatches = nixContent.matchAll(/pkgs\.([a-zA-Z0-9_\-]+)/g);
    for (const match of pkgMatches) {
        let pkgName = match[1];
        // Soft map nix packages to common ubuntu apt packages
        if (pkgName.startsWith('nodejs'))
            pkgName = 'nodejs npm';
        else if (pkgName.startsWith('python'))
            pkgName = 'python3 python3-pip';
        else if (pkgName === 'go')
            pkgName = 'golang';
        else if (pkgName === 'rust')
            pkgName = 'rustc cargo';
        // Add unique
        const split = pkgName.split(' ');
        for (const p of split) {
            if (!((_b = (_a = config.packages) === null || _a === void 0 ? void 0 : _a.apt) === null || _b === void 0 ? void 0 : _b.includes(p))) {
                (_d = (_c = config.packages) === null || _c === void 0 ? void 0 : _c.apt) === null || _d === void 0 ? void 0 : _d.push(p);
            }
        }
    }
    // Extract basic env: PORT = 3000;
    const envBlockMatch = nixContent.match(/env\s*=\s*{([^}]+)}/);
    if (envBlockMatch) {
        const envLines = envBlockMatch[1].split('\n');
        for (const line of envLines) {
            const kvMatch = line.trim().match(/([a-zA-Z0-9_]+)\s*=\s*['"]?([^'";]+)['"]?\s*;/);
            if (kvMatch) {
                if (config.env)
                    config.env[kvMatch[1]] = kvMatch[2];
            }
        }
    }
    return config;
}
async function loadWorkspaceConfig(workspacePath) {
    const codeverseJsonPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, 'codeverse.json');
    const idxNixPath = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.idx', 'dev.nix');
    // 1. Check for Project IDX dev.nix
    try {
        const nixContent = await promises_1.default.readFile(idxNixPath, 'utf-8');
        return parseBasicNix(nixContent);
    }
    catch (_a) {
        // Fallthrough if no dev.nix
    }
    // 2. Check for codeverse.json
    try {
        const jsonContent = await promises_1.default.readFile(codeverseJsonPath, 'utf-8');
        return JSON.parse(jsonContent);
    }
    catch (err) {
        const fsErr = err;
        if (fsErr.code === 'ENOENT') {
            // 3. Create default if none exists
            const defaultConfig = {
                "env": { "PORT": "3000" },
                "packages": { "apt": [], "npm": [] }
            };
            await promises_1.default.writeFile(codeverseJsonPath, JSON.stringify(defaultConfig, null, 2));
            return defaultConfig;
        }
        throw err;
    }
}
/**
 * Dynamically writes a Dockerfile and uses Docker's native layer caching
 * to speed up future startups with the same packages.
 */
async function buildWorkspaceImage(workspaceId, workspacePath, onLog, docker) {
    var _a, _b, _c;
    onLog("Loading workspace configuration (codeverse.json or dev.nix)...");
    const config = await loadWorkspaceConfig(workspacePath);
    // Generate Dockerfile content
    let dockerfile = `FROM codercom/code-server:latest\n`;
    dockerfile += `USER root\n`;
    // APT Packages
    if (((_a = config.packages) === null || _a === void 0 ? void 0 : _a.apt) && config.packages.apt.length > 0) {
        const aptList = config.packages.apt.join(' ');
        dockerfile += `RUN apt-get update && apt-get install -y ${aptList} && rm -rf /var/lib/apt/lists/*\n`;
    }
    // NPM Packages
    if (((_b = config.packages) === null || _b === void 0 ? void 0 : _b.npm) && config.packages.npm.length > 0) {
        // Ensure nodejs and npm are present if not already installed
        if (!((_c = config.packages.apt) === null || _c === void 0 ? void 0 : _c.some(p => p.includes('npm')))) {
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
    const buildDir = path_1.default.join(/*turbopackIgnore: true*/ workspacePath, '.codeverse');
    await promises_1.default.mkdir(buildDir, { recursive: true });
    const dockerfilePath = path_1.default.join(/*turbopackIgnore: true*/ buildDir, 'Dockerfile');
    await promises_1.default.writeFile(dockerfilePath, dockerfile);
    const imageName = `codeverse-workspace-${workspaceId}`;
    onLog(`Building image ${imageName}...`);
    return new Promise((resolve, reject) => {
        // Native Docker build engine with tar-fs
        const pack = tar.pack(buildDir);
        docker.buildImage(pack, { t: imageName }, (err, stream) => {
            if (err)
                return reject(err);
            if (!stream)
                return reject(new Error("No stream returned from Docker build"));
            docker.modem.followProgress(stream, (err2) => {
                if (err2)
                    return reject(err2);
                onLog(`Image ${imageName} built successfully.`);
                resolve({ imageName, config });
            }, (event) => {
                if (event.stream)
                    onLog(event.stream.trim());
                else if (event.status)
                    onLog(event.status.trim());
                else if (event.error)
                    onLog(`Build Error: ${event.error}`);
            });
        });
    });
}
