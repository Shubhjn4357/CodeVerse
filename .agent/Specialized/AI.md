# AI Integration & Prompt Engineering

> 🧠 **MANDATORY INIT**: Read `.Agent/AGENT_MEMORY.md` at the start of every session.
> Run `python .Agent/scripts/memory_engine.py --context --agent <your-name>` to load current task context.
> This applies to ANY agent — Antigravity, Gemini, Claude, Codex, terminal scripts, or custom tools.

## Interaction Rules

1. **Context-Aware**: Agents must read the `Gemini.md` and `.Agent/README.md` before any task.
2. **Deterministic Outputs**: Use structured JSON or Markdown responses. Avoid ambiguity.
3. **Chain of Thought**: Explicitly plan the logic before execution using `thought` or `implementation_plan`.

## Prompt Engineering Standards

- **System Instructions**: Clearly define the _Persona_, _Goal_, and _Constraint_.
- **Few-Shot Prompting**: Provide clear examples for complex transformations or logic.
- **Verification**: Include a "Final Review" step in the prompt to ensure criteria are met.
