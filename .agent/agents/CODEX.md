---
trigger: always_on
agent: codex
---

# AGENTS.md - Codex Memory Integration

Add this block to the workspace `AGENTS.md` so Codex loads shared memory before
working in the repo.

```markdown
## Shared Agent Memory

Before answering any request in this workspace:

1. Run `python .Agent/scripts/mem.py ctx --agent codex --max-tokens 4000`
2. Load the returned `<MEMORY_CONTEXT>` into working context before proceeding
3. Continue any active in-progress task unless the user redirects
4. Save checkpoints with `python .Agent/scripts/mem.py cp "what was done. next step" --agent codex`
5. Finish with `python .Agent/scripts/mem.py done "summary"` and log usage when available

Reference: `.Agent/AGENT_MEMORY.md`
```
