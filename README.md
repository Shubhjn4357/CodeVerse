
# CodeVerse: Cloud IDE Framework

CodeVerse is a modern, web-based Cloud IDE Orchestrator inspired by Google Project IDX. It leverages Docker to spin up containerized development environments on the fly.

## Key Features

- **Dynamic Workspaces**: Instantly provision `code-server` Docker containers per project.
- **Project IDX Emulators**: Built-in side-by-side split pane emulators.
  - **Android**: KVM-accelerated `docker-android-x86` sidecar containers streaming over noVNC.
  - **iOS**: Web-simulated fallback or true macOS/iOS simulation when integrated with Appetize.io.
- **Workspace Configuration (`codeverse.json`)**:
  - Similar to `.idx/dev.nix`, place a `codeverse.json` in your project root to configure the environment.
  - **`env`**: Inject custom Linux environment variables.
  - **`packages.apt`**: Define Debian packages to be installed globally on container boot.
  - **`packages.npm`**: Define NPM globals to be installed on boot.
  - **Live Rebuild API**: Modify your config and click "Rebuild Environment" in the IDE to immediately destroy and re-provision your workspace container with the new settings.
- **Next.js & Turbopack Frontend**: Fast, responsive dashboard and IDE client interface.
- **Model Context Protocol (MCP)**: Implements specialized AI orchestration connecting deep file system and terminal tools directly to LLMs.

## `codeverse.json` Schema Reference

```json
{
  "env": {
    "PORT": "3000",
    "CUSTOM_VAR": "value"
  },
  "packages": {
    "apt": ["htop", "wget"],
    "npm": ["firebase-tools", "yarn"]
  },
  "ios": {
    "appetizeUrl": "https://appetize.io/embed/your_token?device=iphone15pro"
  }
}
```
