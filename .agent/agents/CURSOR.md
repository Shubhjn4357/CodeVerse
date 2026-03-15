---
trigger: always_on
agent: cursor
---

# Cursor AI — Agent Memory Integration

## Add to `.cursorrules`

```markdown
## Agent Memory System (MANDATORY)

At the start of EVERY conversation:
1. Run: python .Agent/scripts/mem.py ctx --agent cursor
2. Inject the <MEMORY_CONTEXT> block into your response header
3. Save checkpoints: python .Agent/scripts/mem.py cp "summary"
4. Log usage: python .Agent/scripts/mem.py log <in> <out> --model gpt-4o

This prevents task context loss across sessions.
Full docs: .Agent/AGENT_MEMORY.md
```

## .cursorrules (full snippet)

```
SYSTEM: You have a persistent memory system at .Agent/memory/.
Before answering ANY request:
  Run: python .Agent/scripts/mem.py ctx --agent cursor
  If it returns an active task, continue that task unless user says otherwise.
  After each major step: python .Agent/scripts/mem.py cp "step done. next: ..."
  When done: python .Agent/scripts/mem.py done "summary"
```
