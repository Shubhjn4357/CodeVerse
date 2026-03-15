---
trigger: always_on
agent: copilot
---

# GitHub Copilot — Agent Memory Integration

## Add to `.github/copilot-instructions.md`

```markdown
## MANDATORY: Agent Memory System

At the start of every chat session, run:
python .Agent/scripts/mem.py ctx --agent copilot

Inject the <MEMORY_CONTEXT> block before answering.

For checkpoints:
python .Agent/scripts/mem.py cp "Summary"

For token logging:
python .Agent/scripts/mem.py log <input> <output> --model gpt-4o
```

## VS Code Copilot System Prompt (copilot-instructions.md)

Add this to `.github/copilot-instructions.md`:

```
MANDATORY INIT: At the start of every Copilot Chat session in this workspace,
run `python .Agent/scripts/mem.py ctx --agent copilot` and inject the result.
This prevents context loss across sessions. See .Agent/AGENT_MEMORY.md.
```
