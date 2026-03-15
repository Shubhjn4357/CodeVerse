---
trigger: always_on
agent: antigravity
---

# Antigravity — Agent Memory Integration

## Add to `.gemini/GEMINI.md` under `## TIER 0: UNIVERSAL RULES`

```markdown
### 🧠 Agent Memory (MANDATORY — P0)

At the START of every conversation when `.Agent` folder is present:

1. Run: `python .Agent/scripts/mem.py ctx --agent antigravity`
2. Inject the full `<MEMORY_CONTEXT>` block before proceeding
3. If there is an active in-progress task, continue it unless user redirects
4. Save checkpoints every ~30K tokens:
   `python .Agent/scripts/mem.py cp "what was done. next step"`
5. Log usage at end of session:
   `python .Agent/scripts/mem.py log <input> <output> --model gemini-2.5-pro`
6. Complete tasks when done:
   `python .Agent/scripts/mem.py done "completion summary"`
```

## Short Version for GEMINI.md frontmatter

```markdown
---
trigger: always_on
memory: .Agent/AGENT_MEMORY.md
memory_init: python .Agent/scripts/mem.py ctx --agent antigravity
---
```
