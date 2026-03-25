# AGENT_MEMORY.md — Unified Agent Memory System
<!-- trigger: always_on -->
<!-- priority: P0 — Read this BEFORE any other file -->

> **MANDATORY:** Every AI agent (Antigravity, Gemini, Claude, Codex, any terminal script)
> **MUST** read this file at the **start of every conversation or session** when the `.Agent`
> folder is present in the workspace. This is the highest-priority initialization step.

---

## 🧠 What is the Agent Memory System?

A locally-running, filesystem-based shared memory layer for all AI agents. It persists:
- **Tasks** — current work, status, description, and which agent owns it
- **Checkpoints** — compressed mid-task snapshots so you can resume without context loss
- **Knowledge** — reusable facts and architecture decisions
- **Usage** — per-agent token consumption for optimization

All data lives in `.Agent/memory/` as plain JSON. No server. No cloud. No dependencies.

---

## 📋 Step 1: Load Current Context (MANDATORY at session start)

Run this at the beginning of **every** conversation to get your current task context:

```bash
python .Agent/scripts/memory_engine.py --context --agent <YOUR_AGENT_NAME> --max-tokens 4000
```

This returns a `<MEMORY_CONTEXT>` block. **Inject it into your first response** so you
know what task is in progress without the user having to repeat themselves.

**Agent name examples** (use any string — fully dynamic):
- `antigravity`, `gemini`, `claude`, `codex`, `terminal`, `my_script`, `claude-code`
- Tiny family aliases are also supported: `claw`, `tiny-claw`, `pico-claw`, `micro-claw`, `nano-claw`, `rtiny-claw`

---

## 📝 Step 2: Register Your Task (when starting or resuming work)

```bash
# New task
python .Agent/scripts/memory_engine.py --write \
  --task "Build auth module" \
  --agent "antigravity" \
  --status "in_progress" \
  --description "Implementing JWT + refresh token flow for the API"

# Resume existing task
python .Agent/scripts/memory_engine.py --write \
  --task-id <ID_FROM_CONTEXT> \
  --task "Build auth module" \
  --agent "antigravity" \
  --status "in_progress"
```

---

## 💾 Step 3: Save Checkpoints (CRITICAL — before context grows large)

Save a checkpoint **proactively** every ~30,000 tokens or at the end of a major step:

```bash
python .Agent/scripts/memory_engine.py --checkpoint \
  --task-id <TASK_ID> \
  --agent "antigravity" \
  --summary "Completed DB schema design. Next: implement routes." \
  --content "Schema: users(id, email, hash), tokens(id, user_id, expires_at)..."
```

The context will be auto-compressed before saving, so it stays small.

---

## ⚡ Step 4: Check & Optimize Token Usage

```bash
# Check your token usage
python .Agent/scripts/usage_tracker.py --report

# Get optimization tips
python .Agent/scripts/usage_tracker.py --tips

# Log what you just used (call this after a long session)
python .Agent/scripts/usage_tracker.py --log \
  --agent "antigravity" \
  --model "gemini-2.5-pro" \
  --input 15000 \
  --output 8000 \
  --task-id <TASK_ID>
```

---

## 🔍 Step 5: Search Past Memory (when unsure what was done)

```bash
python .Agent/scripts/memory_engine.py --search "auth module"
python .Agent/scripts/memory_engine.py --search "database schema"
```

---

## ✅ Step 6: Complete a Task

```bash
python .Agent/scripts/memory_engine.py --complete \
  --task-id <TASK_ID> \
  --summary "Auth module complete. JWT + refresh + middleware all working."
```

---

## 🚨 Context Window Emergency Protocol

If you are **near your context limit**, do this immediately:

```bash
# 1. Auto-compress and checkpoint everything
python .Agent/scripts/context_optimizer.py --auto-checkpoint \
  --task-id <TASK_ID> --agent <NAME> --input context_dump.txt --threshold 60000

# 2. Start a fresh conversation
# 3. At the start of the new conversation, run Step 1 above to reload context
```

---

## 📊 Live Dashboard

Open the local dashboard in any browser (no server needed):
```
d:\Code\.Agent\dashboard\index.html
```

Or via PowerShell aliases (after running `setup_memory_hook.ps1`):
```powershell
agent-status    # Current session + task
agent-report    # Token usage per agent
agent-tips      # Optimization recommendations
agent-watch     # Live watch for changes
```

---

## 🔌 Cross-Agent Compatibility

| Agent           | How to inject AGENT_MEMORY.md |
|-----------------|-------------------------------|
| **Antigravity** | Add to `.gemini/GEMINI.md`: `always_on` trigger |
| **Gemini CLI**  | Add `@.Agent/AGENT_MEMORY.md` to your prompt |
| **Claude**      | Add to `CLAUDE.md` or system prompt |
| **Codex / GPT** | Include in `system_prompt.txt` |
| **Terminal**    | `python .Agent/scripts/activate.py` on shell start |
| **Custom**      | `python .Agent/scripts/memory_engine.py --context --agent <name>` |

See **MEMORY_PROTOCOL.md** for the full JSON schema and integration spec.

---

## 📁 File Reference

| File | Purpose |
|------|---------|
| `memory/memory-store.json` | Tasks, checkpoints, knowledge (persistent) |
| `memory/usage-tracker.json` | Per-agent token usage log |
| `memory/session.json` | Hot session state (fast read) |
| `scripts/memory_engine.py` | Core read/write/compress/search |
| `scripts/usage_tracker.py` | Token usage logging and reports |
| `scripts/context_optimizer.py` | Token budget + auto-compress |
| `scripts/activate.py` | Session initializer |
| `scripts/workspace_watcher.py` | Live status watcher |
| `dashboard/index.html` | Local web dashboard |
| `setup_memory_hook.ps1` | PowerShell auto-activation installer |
