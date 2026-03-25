# Master Guidance Index (100+ Files)

Welcome to the Comprehensive Agent Guidance System. Below is the organized map of 111 specialized markdown files, providing a complete framework for development, design, security, and management.

---

## 🧠 Agent Memory System _(Start Here)_

> **MANDATORY for all agents** — Read before any other file in this directory.

| File | Purpose |

|------|---------|
| [AGENT_MEMORY.md](AGENT_MEMORY.md) | **Primary init doc** — context, checkpoints, usage |
| [MEMORY_PROTOCOL.md](MEMORY_PROTOCOL.md) | Full tech spec, JSON schemas, CLI reference |
| [dashboard/index.html](dashboard/index.html) | Local web dashboard (no server needed) |
| [setup_memory_hook.ps1](setup_memory_hook.ps1) | One-time installer for `mem` command |

---

### Step 0 — Install (once per machine)

```powershell
powershell -ExecutionPolicy Bypass -File .Agent\setup_memory_hook.ps1
```

Opens a **new terminal** and `mem` is live with tab-completion.

---

### Option A — HTML Dashboard (recommended)

```powershell
mem open
```

Or open **`.Agent\dashboard\index.html`** directly in any browser.

Dashboard shows live:

- Active task + checkpoint timeline
- Per-agent token usage bars (only agents used in this workspace)
- Active models (only models logged in this workspace)
- Knowledge base + full-text search
- Optimization tips
- Auto-refreshes every 5 seconds

---

### Option B — Terminal Commands

```powershell
mem                              # session status
mem ctx                          # load context (auto-detects IDE/agent)
mem ctx --agent antigravity      # explicit agent

mem write "Task title"           # start a task
mem cp "Step done. Next: ..."    # checkpoint active task
mem done "Summary"               # complete task

mem log 5000 2000                # log tokens (agent + model auto-detected from history)
mem log 5000 2000 --agent claude --model claude-3-7-sonnet
mem report                       # full usage report (workspace models only)
mem tips                         # token optimization advice

mem search "auth module"         # search memory
mem know "Title" "Decision"      # save knowledge entry
mem watch                        # live polling watcher (3s updates)
mem agent                        # show auto-detected agent + last model used
```

Tiny agent variants are now recognized as first-class ids too:
`claw`, `tiny-claw`, `pico-claw`, `micro-claw`, `nano-claw`, `rtiny-claw`.

---

### Model Management (fully dynamic)

Models are tracked **only when used** in this workspace. Pricing lives in `.Agent/memory/model_costs.json` — editable by hand or via:

```powershell
# List all known models and which are active in this workspace
python .Agent/scripts/usage_tracker.py --models

# Register a custom model
python .Agent/scripts/usage_tracker.py --add-model "my-llm" --cost-input 1.5 --cost-output 6.0

# Check which agents/models tab-complete for YOUR workspace
python .Agent/scripts/shell_completions.py --list
```

---

### Agent Integration Matrix

| IDE / Agent | How to activate | Snippet file |
|-------------|-----------------|--------------|

| Codex / OpenAI agents | `AGENTS.md` | [CODEX.md](agents/CODEX.md) |
| Antigravity | Paste into `.gemini/GEMINI.md` | [ANTIGRAVITY.md](agents/ANTIGRAVITY.md) |
| Claude | Drop as `CLAUDE.md` | [CLAUDE.md](agents/CLAUDE.md) |
| GitHub Copilot | `.github/copilot-instructions.md` | [COPILOT.md](agents/COPILOT.md) |
| Cursor | `.cursorrules` | [CURSOR.md](agents/CURSOR.md) |
| VS Code | `Ctrl+Shift+P → Run Task → Mem:` | `.vscode/tasks.json` |
| JetBrains AI | Import run config | [jetbrains-run-config.xml](agents/jetbrains-run-config.xml) |
| Zed | Task panel | `.zed/settings.json` |
| Sublime | Command palette | [sublime-commands.json](agents/sublime-commands.json) |
| Terminal / any | `MEM_AGENT=mybot mem ctx` | Works everywhere |

Every agent initializes with one command:

```bash
python .Agent/scripts/mem.py ctx --agent <your-agent-name>
```

---

## 📁 [Engineering](Engineering/) (23 Files)

- [SOLID Principles](Engineering/SOLID_Principles.md)
- [DRY, KISS, YAGNI](Engineering/DRY_KISS_YAGNI.md)
- [Clean Code Practices](Engineering/CleanCode.md)
- [Code Comments & Documentation](Engineering/Documentation.md)
- [Naming Conventions](Engineering/NamingConventions.md)
- [Refactoring Techniques](Engineering/Refactoring.md)
- [Unit Testing](Engineering/UnitTesting.md)
- [Integration Testing](Engineering/IntegrationTesting.md)
- [E2E Testing](Engineering/E2ETesting.md)
- [CI/CD Philosophy](Engineering/CI_CD_Philosophy.md)
- [Debugging Techniques](Engineering/Debugging.md)
- [Error Handling](Engineering/ErrorHandling.md)
- [Logging Best Practices](Engineering/LoggingBestPractices.md)
- [Code Review Guidelines](Engineering/CodeReviewGuidelines.md)
- [Big O Notation](Engineering/BigO_Notation.md)
- [Data Structures](Engineering/DataStructures.md)
- [API First Development](Engineering/API_First_Development.md)

## 📁 [Frontend](Frontend/) (19 Files)

- [React Best Practices](Frontend/React_BestPractices.md)
- [State Management: Zustand](Frontend/StateManagement_Zustand.md)
- [State Management: Redux Toolkit](Frontend/StateManagement_Redux.md)
- [Form Management with React Hook Form](Frontend/ReactHookForm.md)
- [Component-Driven Development](Frontend/ComponentDrivenDevelopment.md)
- [Styling: CSS Modules vs Tailwind](Frontend/Styling_Guidelines.md)
- [Performance Optimization](Frontend/Performance_Optimization.md)
- [Responsive Design](Frontend/ResponsiveDesign.md)
- [Accessibility (a11y)](Frontend/Accessibility.md)
- [Progressive Web Apps (PWAs)](Frontend/ProgressiveWebApps.md)

## 📁 [Backend](Backend/) (15 Files)

- [Node.js Architecture](Backend/NodeJS_Architecture.md)
- [API Design: REST vs GraphQL](Backend/API_Design_REST_vs_GraphQL.md)
- [Database Modeling](Backend/Database_Modeling.md)
- [Auth & Authorization (JWT/OAuth)](Backend/Authentication_Strategies.md)
- [Microservices Communication](Backend/Microservices_Communication.md)
- [Caching Strategies](Backend/CachingStrategies.md)
- [Database Normalization](Backend/DatabaseNormalization.md)
- [API Versioning](Backend/API_Versioning.md)

## 📁 [Security](Security/) (14 Files)

- [JWT Security Best Practices](Security/JWT_Security.md)
- [OAuth2 & OIDC Flows](Security/OAuth2_Flows.md)
- [Role-Based Access Control (RBAC)](Security/RoleBasedAccessControl.md)
- [Encryption Standards](Security/Encryption.md)
- [Content Security Policy (CSP)](Security/CSP_Policy.md)
- [SQL Injection Prevention](Security/SqlInjection.md)
- [XSS Mitigation](Security/XssMitigation.md)
- [CSRF Protection](Security/CSRF_Protection_DeepDive.md)
- [Input Validation (Zod)](Security/InputValidation.md)
- [Secrets Management](Security/SecretsManagement.md)
- [Network Security](Security/NetworkSecurity.md)
- [Dependency Scanning](Security/DependencyScanning.md)
- [OWASP Top 10](Security/OWASP_Top_10_Overview.md)

## 📁 [DevOps](DevOps/) (12 Files)

- [Logging & Monitoring](DevOps/Logging_Monitoring.md)
- [Kubernetes Orchestration](DevOps/Kubernetes.md)
- [Docker Best Practices](DevOps/DockerBestPractices.md)
- [Infrastructure as Code (IaC)](DevOps/InfrastructureAsCode.md)
- [Continuous Deployment (CD)](DevOps/ContinuousDeployment.md)
- [Monitoring Performance](DevOps/MonitoringPerformance.md)

## 📁 [Design](Design/) (12 Files)

- [Visual Design Systems](Design/DesignSystems.md)
- [UI Components Library](Design/ComponentLibrary.md)
- [Mobile UX Patterns](Design/MobileUX.md)
- [Micro-Animations](Design/MicroAnimations.md)
- [Color Palettes](Design/ColorPalettes.md)
- [Layout Grids](Design/Layout_Grid.md)
- [Typography Scales](Design/Typography_Scales.md)

## 📁 [Management](Management/) (8 Files)

- [Agile & Scrum](Management/AgileScrum.md)
- [Kanban Flow](Management/Kanban.md)
- [Stakeholder Communication](Management/Stakeholder_Communication.md)
- [Stakeholder Engagement](Management/StakeholderEngagement.md)
- [Risk Management](Management/Risk_Management.md)
- [Project Risk Assessment](Management/ProjectRiskAssessment.md)
- [Resource Allocation](Management/ResourceAllocation.md)

## 📁 [Industry](Industry/) (8 Files)

- [Domain-Driven Design (DDD)](Industry/DDD_Basics.md)
- [Microservices Architecture](Industry/Microservices_Architecture.md)
- [Clean Architecture](Industry/CleanArchitecture.md)
- [CQRS Patterns](Industry/CQRS_Patterns.md)
- [Event Sourcing](Industry/EventSourcing.md)
- [Hexagonal Architecture](Industry/HexagonalArchitecture.md)
- [Cloud-Native Principles](Industry/CloudNativePrinciples.md)
- [Serverless Patterns](Industry/ServerlessPatterns.md)
- [Event-Driven Architecture](Industry/EventDrivenArchitecture.md)
- [Micro-Frontends Patterns](Industry/MicroFrontends_Patterns.md)

## 📁 [Specialized](Specialized/) (4 Files)

- [AI Prompt Engineering](Specialized/AI_PromptEngineering.md)
- [Stripe & Payments](Specialized/Stripe_Payments.md)
- [Cloudflare Workers](Specialized/Cloudflare_Workers.md)
- [Micro-Frontends](Specialized/MicroFrontends.md)

---
