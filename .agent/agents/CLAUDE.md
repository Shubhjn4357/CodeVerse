---
trigger: always_on
agent: claude
---

# CLAUDE.md — Agent Memory Integration (Mandatory)

> **Read `.Agent/AGENT_MEMORY.md` first.** Then run the command below.

## MANDATORY INIT (run at every conversation start)

```bash
python .Agent/scripts/mem.py ctx --agent claude
```

This returns a `<MEMORY_CONTEXT>` block. **Paste it at the top of your first response.**

## Save a Checkpoint (before you hit context limit)

```bash
python .Agent/scripts/mem.py cp "Summary of what was done. Next: ..."
```

## Complete a Task

```bash
python .Agent/scripts/mem.py done "Feature complete — all tests passing"
```

## Log Your Token Usage

```bash
python .Agent/scripts/mem.py log 5000 2500 --model claude-3-7-sonnet
```

## Full Reference

See `.Agent/MEMORY_PROTOCOL.md` for complete JSON schemas and CLI docs.
