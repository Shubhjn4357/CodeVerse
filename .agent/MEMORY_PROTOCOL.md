# MEMORY_PROTOCOL.md — Cross-Agent Memory Protocol Specification

This document defines the technical spec for how any agent reads, writes, and shares memory
via the Unified Agent Memory System.

---

## 1. JSON Schema Reference

### `memory/memory-store.json`

```json
{
  "version": "1.0.0",
  "tasks": [
    {
      "id": "string (8-char UUID fragment)",
      "title": "string",
      "agent": "string (any identifier: 'antigravity', 'gemini', 'terminal', etc.)",
      "description": "string",
      "status": "in_progress | completed | blocked | cancelled",
      "tags": ["string"],
      "created_at": "ISO 8601 datetime",
      "updated_at": "ISO 8601 datetime",
      "completion_summary": "string (optional)",
      "checkpoints": ["checkpoint_id_1", "checkpoint_id_2"]
    }
  ],
  "checkpoints": [
    {
      "id": "string",
      "task_id": "string",
      "agent": "string",
      "summary": "string",
      "compressed_context": "string (extractive compression of context)",
      "token_estimate": "number",
      "created_at": "ISO 8601 datetime"
    }
  ],
  "knowledge": [
    {
      "id": "string",
      "title": "string",
      "content": "string",
      "tags": ["string"],
      "created_at": "ISO 8601 datetime"
    }
  ]
}
```

---

### `memory/session.json`

```json
{
  "version": "1.0.0",
  "session_id": "string | null",
  "started_at": "ISO 8601 datetime | null",
  "workspace": "string (absolute path) | null",
  "active_task_id": "string | null",
  "active_agent": "string | null",
  "status": "idle | in_progress | blocked | paused",
  "last_checkpoint_at": "ISO 8601 datetime | null",
  "context_tokens_used": "number",
  "context_budget": "number (default: 100000)",
  "notes": ["string"]
}
```

---

### `memory/usage-tracker.json`

```json
{
  "version": "1.0.0",
  "sessions": [
    {
      "id": "string",
      "agent": "string (dynamic — any identifier)",
      "model": "string (e.g. 'gemini-2.5-pro')",
      "input_tokens": "number",
      "output_tokens": "number",
      "total_tokens": "number",
      "cost_usd": "number",
      "task_id": "string | null",
      "note": "string",
      "logged_at": "ISO 8601 datetime"
    }
  ],
  "totals": {
    "<agent_name>": {
      "input_tokens": "number",
      "output_tokens": "number",
      "total_tokens": "number",
      "cost_usd": "number",
      "session_count": "number"
    }
  }
}
```

> **Note:** `totals` keys are created dynamically. Any agent name is valid.
> There is no hardcoded list — terminal scripts, custom tools, and any new
> agent type are automatically tracked.

---

## 2. Context Injection Format

When an agent loads its context at session start, it receives a block like this:

```
<MEMORY_CONTEXT>
# Agent Memory System — Context for: antigravity
# Loaded: 2026-03-02T14:13:49+05:30

## Active Task
- **ID**: a1b2c3d4
- **Title**: Build JWT Auth Module
- **Agent**: antigravity
- **Status**: in_progress
- **Description**: Implementing JWT + refresh token flow for the Vahi API
- **Updated**: 2026-03-02T14:00:00+05:30

## Recent Checkpoints
- [2026-03-02T13:45:00+05:30] Completed DB schema. Next: implement /login route.
  Context: Schema: users(id,email,hash), tokens(id,user_id,expires_at,revoked)...

## Knowledge Base
- **Dynamic agents**: Any agent name is valid — no hardcoded list

## Recent Tasks
- [completed] Design database schema (by claude, 2026-03-01)
- [completed] Setup project structure (by gemini, 2026-03-01)

</MEMORY_CONTEXT>
```

---

## 3. CLI Command Reference

### memory_engine.py

| Command | Purpose |
|---------|---------|
| `--read [--scope all\|tasks\|checkpoints\|knowledge\|session]` | Read memory store |
| `--write --task "title" --agent "name" --status "in_progress"` | Create/update task |
| `--write --task-id <id> ...` | Update existing task by ID |
| `--checkpoint --task-id <id> --agent "name" --summary "..." --content "..."` | Save checkpoint |
| `--search "query"` | Fuzzy search across all memory |
| `--context --agent "name" --max-tokens 4000` | Get context blob |
| `--complete --task-id <id> --summary "..."` | Mark task complete |
| `--know --title "..." --content "..." --tags "a,b"` | Save knowledge entry |
| `--test` | Run self-tests |

### usage_tracker.py

| Command | Purpose |
|---------|---------|
| `--log --agent "name" --model "model" --input 1200 --output 800 --task-id <id>` | Log usage |
| `--report [--agent "name"]` | Print usage report (optional filter) |
| `--tips` | Print optimization recommendations |
| `--dashboard-data` | JSON output for dashboard |
| `--test` | Run self-tests |

### context_optimizer.py

| Command | Purpose |
|---------|---------|
| `--analyze --input file.txt [--model "name"]` | Analyze token count + redundancy |
| `--compress --input file.txt --budget 4000 [--output out.txt]` | Compress to budget |
| `--suggest --input file.txt --budget 4000` | Get pruning suggestions |
| `--auto-checkpoint --task-id <id> --agent "name" --input file.txt --threshold 80000` | Auto-checkpoint if over threshold |
| `--test` | Run self-tests |

### workspace_watcher.py

| Command | Purpose |
|---------|---------|
| `--status` | One-shot status print |
| `--watch [--interval 3]` | Live watch (polling, no deps) |

### activate.py

| Command | Purpose |
|---------|---------|
| _(no args)_ | Initialize new session + show status |
| `--status` | Show current session (no init) |
| `--workspace <path>` | Override workspace path |

---

## 4. Cross-Agent Integration

### Antigravity (this agent)
Add to `.gemini/GEMINI.md` under `always_on`:
```markdown
## Agent Memory (MANDATORY)
Read `.Agent/AGENT_MEMORY.md` at session start.
Run: `python .Agent/scripts/memory_engine.py --context --agent antigravity`
```

### Gemini CLI
Add to your prompt template:
```
@.Agent/AGENT_MEMORY.md

Before answering, run:
python .Agent/scripts/memory_engine.py --context --agent gemini
```

### Claude / Claude Code
Add to `CLAUDE.md`:
```markdown
## Required Setup
1. Read `.Agent/AGENT_MEMORY.md`
2. Run `python .Agent/scripts/memory_engine.py --context --agent claude`
3. Inject the <MEMORY_CONTEXT> block before proceeding.
```

### Codex / GPT Agents
Add to `system_prompt.txt`:
```
MANDATORY INIT: Run `python .Agent/scripts/memory_engine.py --context --agent codex --max-tokens 2000`
and inject the result at the start of this session.
```

### Terminal / Shell Scripts
```bash
# Add to ~/.bashrc or PowerShell profile:
python .Agent/scripts/activate.py
# Or use the hook installer:
powershell -File .Agent/setup_memory_hook.ps1
```

---

## 5. Token Optimization Strategies

| Strategy | How | Savings |
|----------|-----|---------|
| **Targeted context** | `--max-tokens 2000` for simple tasks | 50–80% |
| **Regular checkpoints** | Every 30K tokens | Prevents context wipe |
| **Extractive compression** | `context_optimizer.py --compress` | 40–70% |
| **Task scoping** | One task per session | Eliminates irrelevant context |
| **Auto-checkpoint** | `--auto-checkpoint --threshold 60000` | Automatic |
| **Smaller models** | Use gemini-2.0-flash for analysis tasks | 90% cost reduction |

---

## 6. File Locking & Concurrency

The JSON store uses **last-write-wins** semantics (sufficient for single-user use).
For concurrent multi-agent writes, each script reads → modifies → writes atomically.
No file locking is required for typical usage patterns.

If two agents write simultaneously (rare at this scale), the later write wins.
Checkpoints are append-only so data loss is minimal.
