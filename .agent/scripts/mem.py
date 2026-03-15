"""
mem.py — Unified Short CLI Dispatcher for the Agent Memory System
=================================================================
Single-entry dispatcher. All long commands become short subcommands.
Detects current agent/IDE automatically.

Aliases installed by setup_memory_hook.ps1 / .bashrc:
  mem          → python .Agent/scripts/mem.py
  mem ctx      → get context for auto-detected agent
  mem status   → session status
  mem write    → start/update a task
  mem cp       → save checkpoint
  mem log      → log token usage
  mem search   → search memory
  mem done     → complete task
  mem report   → usage report
  mem tips     → optimization tips
  mem watch    → live watcher
  mem know     → save knowledge
  mem open     → open dashboard in browser
  mem analyze  → analyze context file for token cost
  mem compress → compress context file to budget
  mem init     → init new session

Usage examples:
  mem status
  mem ctx                          # auto-detects agent from env/IDE
  mem ctx --agent claude           # explicit agent
  mem write "Build auth module"
  mem cp abc123 "Step 1 done. Next: routes."
  mem log 1200 800                 # input output tokens (auto-detects agent/model)
  mem log 1200 800 --agent zed --model gpt-4o
  mem search "auth module"
  mem done abc123 "Feature complete"
  mem report
  mem tips
  mem watch
  mem open
  mem know "Key decision" "Use JWT not sessions"
  mem analyze context.txt
  mem compress context.txt 4000
  mem init
"""

from __future__ import annotations

import json
import os
import platform
import re
import subprocess
import sys
import webbrowser
from pathlib import Path

# ---------------------------------------------------------------------------
# Path bootstrap — works from ANY directory
# ---------------------------------------------------------------------------
_SCRIPTS = Path(__file__).resolve().parent
_AGENT   = _SCRIPTS.parent
sys.path.insert(0, str(_SCRIPTS))

import memory_engine as _me
import usage_tracker as _ut
import context_optimizer as _co
from activate import print_status, init_session, read_session, read_store


def _find_agent_dir() -> Path:
    """Find the .Agent dir: script-relative first, then walk up from CWD."""
    if (_AGENT / "memory").is_dir():
        return _AGENT
    for d in [Path.cwd(), *Path.cwd().parents]:
        c = d / ".Agent"
        if c.is_dir() and (c / "memory").is_dir():
            return c
    return _AGENT   # last resort

# ---------------------------------------------------------------------------
# Auto-detect current agent & model
# ---------------------------------------------------------------------------

_IDE_MAP: dict[str, str] = {
    # Environment variable → agent name
    "CURSOR_SESSIONID":         "cursor",
    "VSCODE_PID":               "vscode-copilot",
    "VSCODE_INJECTION_VERSION": "vscode-copilot",
    "JB_IDE":                   "jetbrains-ai",
    "IDEA_INITIAL_DIRECTORY":   "jetbrains-ai",
    "ZED_PID":                  "zed-ai",
    "SUBLIME_SESSION":          "sublime",
    "TERM_PROGRAM":             None,       # handled below
    "GEMINI_API_KEY":           "gemini",
    "ANTHROPIC_API_KEY":        "claude",
    "OPENAI_API_KEY":           "openai",
}

_TERMINAL_PROGRAM_MAP: dict[str, str] = {
    "hyper":       "terminal",
    "warp":        "warp",
    "alacritty":   "terminal",
    "iTerm.app":   "terminal",
    "WindowsTerminal": "terminal",
}

def detect_agent() -> str:
    """Auto-detect which AI agent / IDE is running this command."""
    env = os.environ

    # 1. Explicit override wins
    if "MEM_AGENT" in env:
        return env["MEM_AGENT"]

    # 2. Check known IDE env vars
    for var, name in _IDE_MAP.items():
        if var in env:
            if name:
                return name
            if var == "TERM_PROGRAM":
                tp = env.get("TERM_PROGRAM", "").lower()
                return _TERMINAL_PROGRAM_MAP.get(tp, "terminal")

    # 3. Check parent process name on Windows
    if platform.system() == "Windows":
        try:
            ppid = os.getppid()
            out = subprocess.check_output(
                ["wmic", "process", "where", f"processid={ppid}", "get", "Name"],
                text=True, stderr=subprocess.DEVNULL
            ).strip().split("\n")
            name = out[-1].strip().lower()
            if "code"    in name: return "vscode-copilot"
            if "idea"    in name: return "jetbrains-ai"
            if "pycharm" in name: return "jetbrains-ai"
            if "zed"     in name: return "zed-ai"
            if "sublime" in name: return "sublime"
            if "cursor"  in name: return "cursor"
            if "warp"    in name: return "warp"
        except Exception:
            pass

    # 4. Fallback: active session agent
    session = _me._load_json(_me.SESSION_PATH)
    if session.get("active_agent"):
        return session["active_agent"]

    return "terminal"


def detect_model(agent: str) -> str:
    """
    Return the last model used by this agent in this workspace.
    Reads from usage-tracker.json — fully dynamic, no hardcoded map.
    Falls back to 'default' if no history exists.
    """
    try:
        usage_path = _find_agent_dir() / "memory" / "usage-tracker.json"
        if not usage_path.exists():
            return "default"
        data = json.loads(usage_path.read_text(encoding="utf-8"))
        # Walk sessions newest-first, find the last model this agent used
        for session in data.get("sessions", []):
            if session.get("agent", "").lower() == agent.lower():
                return session["model"]
        # Fallback: check totals.models_used
        totals = data.get("totals", {})
        for key, val in totals.items():
            if key.lower() == agent.lower():
                used = val.get("models_used", [])
                if used:
                    return used[-1]
    except Exception:
        pass
    return "default"


# ---------------------------------------------------------------------------
# Subcommand handlers
# ---------------------------------------------------------------------------

def cmd_status(_args: list[str]) -> None:
    session = read_session()
    store   = read_store()
    print_status(session, store)


def cmd_init(_args: list[str]) -> None:
    """Initialize a new session."""
    agent_dir = _AGENT
    workspace = agent_dir.parent
    session = init_session(workspace)
    store   = read_store()
    print_status(session, store)
    print(f"  ✅ Session started: {session['session_id']}")


def cmd_ctx(args: list[str]) -> None:
    """Get context blob for agent (auto-detect or --agent <name>)."""
    agent = _parse_flag(args, "--agent") or detect_agent()
    try:
        max_tokens = int(_parse_flag(args, "--max-tokens") or "4000")
    except ValueError:
        max_tokens = 4000
    print(_me.get_context_for_agent(agent, max_tokens=max_tokens))


def cmd_write(args: list[str]) -> None:
    """
    mem write "Task title" [--desc "..."] [--status in_progress] [--tags a,b] [--id existing_id]
    """
    title      = _positional(args, 0, "Untitled Task")
    agent      = _parse_flag(args, "--agent") or detect_agent()
    description = _parse_flag(args, "--desc") or _parse_flag(args, "--description") or ""
    status     = _parse_flag(args, "--status") or "in_progress"
    task_id    = _parse_flag(args, "--id") or _parse_flag(args, "--task-id")
    tags_raw   = _parse_flag(args, "--tags") or ""
    tags       = [t.strip() for t in tags_raw.split(",") if t.strip()]

    tid = _me.write_memory(
        title=title, agent=agent, description=description,
        status=status, tags=tags, task_id=task_id,
    )
    print(f"✅ Task saved  id={tid}  agent={agent}  status={status}")
    print(f"   Title: {title}")


def cmd_cp(args: list[str]) -> None:
    """
    mem cp <task-id> "Summary of what was done"
    """
    task_id = _positional(args, 0)
    summary = _positional(args, 1, "Checkpoint")
    agent   = _parse_flag(args, "--agent") or detect_agent()
    context = _parse_flag(args, "--context") or ""

    if not task_id:
        # Try active task from session
        session = _me._load_json(_me.SESSION_PATH)
        task_id = session.get("active_task_id")
        if not task_id:
            print("ERROR: no active task. Provide task-id: mem cp <id> 'summary'", file=sys.stderr)
            sys.exit(1)

    cid = _me.save_checkpoint(task_id=task_id, agent=agent, summary=summary, context_snapshot=context)
    print(f"✅ Checkpoint  id={cid}  task={task_id}  agent={agent}")
    print(f"   Summary: {summary}")


def cmd_log(args: list[str]) -> None:
    """
    mem log <input_tokens> <output_tokens> [--agent name] [--model name] [--task-id id]
    """
    try:
        inp = int(_positional(args, 0, "0"))
        out = int(_positional(args, 1, "0"))
    except ValueError:
        print("ERROR: mem log <input_tokens> <output_tokens>", file=sys.stderr); sys.exit(1)

    agent   = _parse_flag(args, "--agent") or detect_agent()
    model   = _parse_flag(args, "--model") or detect_model(agent)
    task_id = _parse_flag(args, "--task-id") or _active_task_id()
    note    = _parse_flag(args, "--note") or ""

    eid = _ut.log_usage(agent=agent, model=model, input_tokens=inp, output_tokens=out,
                        task_id=task_id, note=note)
    cost = _ut._cost_usd(model, inp, out)
    print(f"✅ Usage logged  id={eid}  agent={agent}  model={model}")
    print(f"   Tokens: {inp+out:,} (in={inp:,} out={out:,})  Cost: ${cost:.4f}")


def cmd_search(args: list[str]) -> None:
    query = " ".join(a for a in args if not a.startswith("--")) or ""
    if not query:
        print("ERROR: mem search <query>", file=sys.stderr); sys.exit(1)
    results = _me.search_memory(query)
    if not results:
        print("No results found.")
        return
    for r in results:
        label = r.get("title") or r.get("summary") or "—"
        print(f"  [{r['type']:10}] {r.get('agent','?'):15} {label[:60]}")


def cmd_done(args: list[str]) -> None:
    """
    mem done [task-id] ["Summary of completion"]
    """
    task_id = _positional(args, 0) or _active_task_id()
    summary = _positional(args, 1, "")
    if not task_id:
        print("ERROR: no active task. Provide: mem done <id>", file=sys.stderr); sys.exit(1)
    _me.complete_task(task_id, summary=summary)
    print(f"✅ Task {task_id} marked as completed.")
    if summary:
        print(f"   Summary: {summary}")


def cmd_report(args: list[str]) -> None:
    agent_filter = _parse_flag(args, "--agent") or _positional(args, 0)
    print(_ut.get_report(agent_filter=agent_filter or None))


def cmd_tips(_args: list[str]) -> None:
    print(_ut.get_optimization_tips())


def cmd_watch(args: list[str]) -> None:
    try:
        interval = int(_parse_flag(args, "--interval") or "3")
    except ValueError:
        interval = 3
    sys.path.insert(0, str(_SCRIPTS))
    from workspace_watcher import watch
    watch(interval=interval)


def cmd_know(args: list[str]) -> None:
    """
    mem know "Title" "Content" [--tags a,b]
    """
    title   = _positional(args, 0, "Knowledge")
    content = _positional(args, 1, "")
    tags_raw = _parse_flag(args, "--tags") or ""
    tags     = [t.strip() for t in tags_raw.split(",") if t.strip()]
    kid = _me.save_knowledge(title=title, content=content, tags=tags)
    print(f"✅ Knowledge saved  id={kid}")
    print(f"   {title}: {content[:60]}")


def cmd_open(_args: list[str]) -> None:
    dashboard = _AGENT / "dashboard" / "index.html"
    if not dashboard.exists():
        print(f"Dashboard not found: {dashboard}", file=sys.stderr); sys.exit(1)
    url = dashboard.as_uri()
    print(f"Opening dashboard: {url}")
    webbrowser.open(url)


def cmd_analyze(args: list[str]) -> None:
    """mem analyze <file> [--model name]"""
    path_arg = _positional(args, 0)
    model    = _parse_flag(args, "--model") or "default"
    text = _read_file_or_stdin(path_arg)
    report = _co.analyze_context(text, model=model)
    _print_table(report)


def cmd_compress(args: list[str]) -> None:
    """mem compress <file> <budget_tokens> [--output file]"""
    path_arg = _positional(args, 0)
    try:
        budget = int(_positional(args, 1, "4000"))
    except ValueError:
        budget = 4000
    out_path = _parse_flag(args, "--output")
    text = _read_file_or_stdin(path_arg)
    compressed = _co.compress_to_budget(text, budget=budget)
    original   = _me._estimate_tokens(text)
    final      = _me._estimate_tokens(compressed)
    print(f"✅ Compressed: {original:,} → {final:,} tokens ({100*(1-final/original):.0f}% reduction)")
    if out_path:
        Path(out_path).write_text(compressed, encoding="utf-8")
        print(f"   Written to: {out_path}")
    else:
        print("\n" + compressed)


def cmd_agent(args: list[str]) -> None:
    """mem agent — show detected agent and its last-used model from workspace history."""
    a      = detect_agent()
    m      = detect_model(a)
    active = _ut.get_active_models()
    print(f"  Detected agent     : {a}")
    print(f"  Last model used    : {m}")
    print(f"  Active models (ws) : {', '.join(active) if active else 'none yet'}")
    print(f"  Override agent via : MEM_AGENT=<name> mem ctx")


def cmd_read(args: list[str]) -> None:
    scope = _positional(args, 0) or "all"
    print(json.dumps(_me.read_memory(scope), indent=2))


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _positional(args: list[str], idx: int, default: str = "") -> str:
    positional = [a for a in args if not a.startswith("--")]
    return positional[idx] if idx < len(positional) else default


def _parse_flag(args: list[str], flag: str) -> str | None:
    for i, a in enumerate(args):
        if a == flag and i + 1 < len(args):
            return args[i + 1]
        if a.startswith(flag + "="):
            return a.split("=", 1)[1]
    return None


def _active_task_id() -> str | None:
    session = _me._load_json(_me.SESSION_PATH)
    return session.get("active_task_id")


def _read_file_or_stdin(path_arg: str | None) -> str:
    if path_arg:
        p = Path(path_arg)
        if not p.exists():
            print(f"ERROR: File not found: {path_arg}", file=sys.stderr); sys.exit(1)
        return p.read_text(encoding="utf-8")
    if not sys.stdin.isatty():
        return sys.stdin.read()
    print("ERROR: Provide a file path or pipe text via stdin", file=sys.stderr); sys.exit(1)


def _print_table(data: dict) -> None:
    for k, v in data.items():
        print(f"  {k:<30} {v}")


# ---------------------------------------------------------------------------
# Command registry
# ---------------------------------------------------------------------------

COMMANDS: dict[str, tuple] = {
    "status":   (cmd_status,   "Show current session status"),
    "init":     (cmd_init,     "Initialize a new session"),
    "ctx":      (cmd_ctx,      "Get context blob for agent (auto-detected)"),
    "context":  (cmd_ctx,      "Alias for ctx"),
    "write":    (cmd_write,    'Write/update task: mem write "Title"'),
    "cp":       (cmd_cp,       "Save checkpoint: mem cp [task-id] 'Summary'"),
    "checkpoint":(cmd_cp,      "Alias for cp"),
    "log":      (cmd_log,      "Log token usage: mem log <input> <output>"),
    "search":   (cmd_search,   "Search memory: mem search 'query'"),
    "done":     (cmd_done,     "Complete task: mem done [task-id] 'Summary'"),
    "complete": (cmd_done,     "Alias for done"),
    "report":   (cmd_report,   "Print usage report"),
    "tips":     (cmd_tips,     "Print optimization tips"),
    "watch":    (cmd_watch,    "Live memory watcher"),
    "know":     (cmd_know,     "Save knowledge: mem know 'Title' 'Content'"),
    "open":     (cmd_open,     "Open dashboard in browser"),
    "analyze":  (cmd_analyze,  "Analyze context file: mem analyze file.txt"),
    "compress": (cmd_compress, "Compress context: mem compress file.txt 4000"),
    "agent":    (cmd_agent,    "Show auto-detected agent/model"),
    "read":     (cmd_read,     "Read raw JSON store: mem read [all|tasks|checkpoints|knowledge|session]"),
}


def print_help() -> None:
    print("\n🧠 mem — Unified Agent Memory CLI\n")
    print("  Usage: mem <command> [args]\n")
    print("  Commands:")
    for name, (_, desc) in COMMANDS.items():
        if name not in ("context", "checkpoint", "complete"):  # skip aliases
            print(f"    {name:<12}  {desc}")
    print()
    print("  Auto-detects agent from IDE/env. Override: MEM_AGENT=claude mem ctx")
    print("  All data stored locally in .Agent/memory/ — no server required.\n")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help", "help"):
        print_help()
        return

    sub = args[0].lower()
    rest = args[1:]

    if sub in COMMANDS:
        COMMANDS[sub][0](rest)
    else:
        print(f"Unknown command: {sub}\n", file=sys.stderr)
        print_help()
        sys.exit(1)


if __name__ == "__main__":
    main()
