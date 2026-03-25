---
title: CodeVerse
emoji: 🚀
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
---

## 🚀 CodeVerse: Premium Cloud IDE Orchestrator

CodeVerse is a high-performance, web-based Cloud IDE Orchestrator inspired by Google Project IDX. It allows developers to instantly provision containerized development environments with integrated multi-platform emulators and a private, local AI coding agent.

---

### ✨ Key Features

- **Dynamic Workspace Provisioning**: One-click creation of `code-server` environments via Docker.
- **Multi-Platform Emulators**:
  - **Android**: KVM-accelerated sidecar containers with noVNC streaming.
  - **iOS**: Premium web-simulated frames for mobile-first development.
  - **Web**: Integrated browser preview with navigation controls.
  - **Windows**: Placeholder for WSL-based application containers.
- **Private AI Agent (Free)**: Built-in support for **Qwen 2.5 Coder 1.5B** running locally via Ollama.
- **MCP Integration**: AI-driven file system and terminal automation.
- **Hugging Face Ready**: Instant CI/CD deployment to HF Spaces.

---

### 🛠️ Environment Setup

#### 1. Prerequisites

- **Docker & Docker Compose**: Required for workspace provisioning and emulators.
- **Ollama**: Required for the local AI agent ([ollama.com](https://ollama.com)).
- **Node.js 20+**: Required for local development.

#### 2. Configuration (`.env`)

Create a `.env` file in the root directory. Use `.env.example` as a template.

```bash
# Core Configuration
NEXT_PUBLIC_APP_URL=http://localhost:7860
DATABASE_URL=file:codeverse.db

# AI Provider Keys (Optional)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=...

# Ollama (Local AI)
OLLAMA_BASE_URL=http://localhost:11434/v1
```

---

### 🚀 Running the App

#### Option A: Docker Compose (Recommended)

This is the only way to use the full Orchestrator features (Workspaces + Emulators).

```bash
docker-compose up --build
```

Ensure Docker Desktop is running. The app will mount `/var/run/docker.sock` to manage containers.

#### Option B: Local Node.js (Frontend Review)

Best for UI/UX development.

```bash
npm install
npm run dev
```

#### Option C: Local LLM Setup

To enable the free private agent:

1. Start Ollama on your machine.
2. Run the provided setup script:

```powershell
.\scripts\setup-local-llm.ps1
```

---

### 📱 Usage Guide

1. **Dashboard**: Manage your workspaces. Click "New Workspace" to provision a new container.
2. **IDE Interface**: Full VS Code-like experience in the browser.
3. **Emulator Panel**: Use the toggle in the right-hand panel to open Android/iOS/Web emulators.
4. **AI Chat**: Select "Qwen 2.5 Coder (Local)" for free, private coding assistance.
5. **Plan Mode**: Use the "Plan" tab in AI Chat for complex, multi-step feature implementation.

---

### 🚢 CI/CD Deployment (Hugging Face)

CodeVerse is configured for automatic deployment to Hugging Face Spaces.

1. **Git Secret**: Add `HF_TOKEN` to your GitHub Repository Secrets.
2. **Push Logic**: Every push to the `main` branch triggers the [Sync to HF](.github/workflows/deploy.yml) workflow.
3. **Internal Port**: The `Dockerfile` is optimized to listen on port `7860` for HF compatibility.

---

### 📜 Workspace Config (`codeverse.json`)

Customize your spawned containers by placing a `codeverse.json` in your project root:

```json
{
  "env": { "PORT_OVERRIDE": "8080" },
  "packages": {
    "apt": ["htop", "curl"],
    "npm": ["typescript", "tsx"]
  }
}
```

---

Developed with ❤️ for the CodeVerse community By ShubhJain.
