"""
shell_completions.py — Generate Shell Completions for `mem` command
====================================================================
Completions are FULLY DYNAMIC — models and agents are read from
the actual usage-tracker.json so completions reflect only what is
in use in this workspace. Falls back to an empty list for agents
and models until usage data exists.

Usage:
  python .Agent/scripts/shell_completions.py powershell >> $PROFILE
  python .Agent/scripts/shell_completions.py bash       >> ~/.bashrc
  python .Agent/scripts/shell_completions.py zsh        >> ~/.zshrc
  python .Agent/scripts/shell_completions.py --list     # print current live data
"""

from __future__ import annotations
import json
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Dynamic data — reads from actual workspace usage files
# ---------------------------------------------------------------------------

def _find_agent_dir() -> Path:
    """Find .Agent directory from script location or CWD walk."""
    script_based = Path(__file__).resolve().parent.parent
    if (script_based / "memory").is_dir():
        return script_based
    for d in [Path.cwd(), *Path.cwd().parents]:
        c = d / ".Agent"
        if c.is_dir() and (c / "memory").is_dir():
            return c
    return script_based


def get_live_agents() -> list[str]:
    """Return agent names actually used in this workspace."""
    agent_dir = _find_agent_dir()
    path = agent_dir / "memory" / "usage-tracker.json"
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        agents = sorted({s.get("agent", "") for s in data.get("sessions", [])} |
                        set(data.get("totals", {}).keys()))
        return [a for a in agents if a]
    except Exception:
        return []


def get_live_models() -> list[str]:
    """Return model names actually logged in this workspace's usage-tracker."""
    agent_dir = _find_agent_dir()
    path = agent_dir / "memory" / "usage-tracker.json"
    if not path.exists():
        return []
    try:
        data   = json.loads(path.read_text(encoding="utf-8"))
        models = sorted({s.get("model", "") for s in data.get("sessions", [])})
        return [m for m in models if m]
    except Exception:
        return []


def get_known_models() -> list[str]:
    """Return all models in model_costs.json (broader than just used ones)."""
    agent_dir  = _find_agent_dir()
    costs_path = agent_dir / "memory" / "model_costs.json"
    if not costs_path.exists():
        return get_live_models()
    try:
        data = json.loads(costs_path.read_text(encoding="utf-8"))
        return sorted(k for k in data.keys() if not k.startswith("_"))
    except Exception:
        return get_live_models()


# Static commands — these don't change
MEM_COMMANDS = [
    "status", "init", "ctx", "write", "cp", "log",
    "search", "done", "report", "tips", "watch", "know",
    "open", "analyze", "compress", "agent", "read", "help",
]

MEM_FLAGS_BY_CMD: dict[str, list[str]] = {
    "ctx":      ["--agent", "--max-tokens"],
    "write":    ["--agent", "--desc", "--status", "--tags", "--id"],
    "cp":       ["--agent", "--context"],
    "log":      ["--agent", "--model", "--task-id", "--note"],
    "report":   ["--agent"],
    "analyze":  ["--model"],
    "compress": ["--output"],
    "watch":    ["--interval"],
}

# ---------------------------------------------------------------------------
# PowerShell
# ---------------------------------------------------------------------------

def powershell_completion() -> str:
    agents = get_live_agents()
    models = get_known_models()    # broader: known pricing config
    cmds   = " ".join(f'"{c}"' for c in MEM_COMMANDS)
    ag_str = " ".join(f'"{a}"' for a in agents)
    mo_str = " ".join(f'"{m}"' for m in models)

    # Build switch arms for per-subcommand flag completion
    switch_arms = "\n".join(
        f"            '{cmd}' {{ {', '.join(repr(f) for f in flags)} }}"
        for cmd, flags in MEM_FLAGS_BY_CMD.items()
    )

    return f"""
## BEGIN: MemCompletion ##################################################
# Tab completion for `mem` — agents and models from workspace usage data

$global:_mem_cmds   = @({cmds})
$global:_mem_agents = @({ag_str or '"(no agents yet — use: mem log ... --agent <name>)"'})
$global:_mem_models = @({mo_str or '"(no models yet — use: mem log ... --model <name>)"'})

Register-ArgumentCompleter -Native -CommandName @('mem','mem-ctx','mem-write','mem-cp','mem-log','mem-search','mem-done','mem-report') -ScriptBlock {{
    param($word, $cmd, $cursor)
    $tokens = $cmd.CommandElements
    $prev   = if ($tokens.Count -gt 1) {{ $tokens[-1].Value }} else {{ '' }}

    if ($tokens.Count -le 2 -and $cmd.CommandElements[0].Value -eq 'mem') {{
        return $global:_mem_cmds | Where-Object {{ $_ -like "$word*" }} |
            ForEach-Object {{ [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }}
    }}
    if ($prev -eq '--agent') {{
        return $global:_mem_agents | Where-Object {{ $_ -like "$word*" }} |
            ForEach-Object {{ [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }}
    }}
    if ($prev -eq '--model') {{
        return $global:_mem_models | Where-Object {{ $_ -like "$word*" }} |
            ForEach-Object {{ [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }}
    }}
    if ($word -like '--*') {{
        $sub = if ($tokens.Count -gt 1) {{ $tokens[1].Value }} else {{ '' }}
        $flags = switch ($sub) {{
{switch_arms}
            default {{ @() }}
        }}
        return $flags | Where-Object {{ $_ -like "$word*" }} |
            ForEach-Object {{ [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', $_) }}
    }}
}}
## END: MemCompletion ###################################################
"""


# ---------------------------------------------------------------------------
# Bash
# ---------------------------------------------------------------------------

def bash_completion() -> str:
    agents = " ".join(get_live_agents())
    models = " ".join(get_known_models())
    cmds   = " ".join(MEM_COMMANDS)

    flag_cases = "\n".join(
        f"            {cmd}) flags=\"{' '.join(flags)}\" ;;"
        for cmd, flags in MEM_FLAGS_BY_CMD.items()
    )

    return f"""
## BEGIN: MemCompletion ##################################################
_mem_completions() {{
    local cur prev words
    cur="${{COMP_WORDS[COMP_CWORD]}}"
    prev="${{COMP_WORDS[COMP_CWORD-1]}}"
    words=(${{COMP_WORDS[@]}})

    if [[ ${{#words[@]}} -le 2 ]]; then
        COMPREPLY=($(compgen -W "{cmds}" -- "$cur"))
    elif [[ "$prev" == "--agent" ]]; then
        COMPREPLY=($(compgen -W "{agents}" -- "$cur"))
    elif [[ "$prev" == "--model" ]]; then
        COMPREPLY=($(compgen -W "{models}" -- "$cur"))
    elif [[ "$cur" == --* ]]; then
        local sub="${{words[1]}}" flags=""
        case "$sub" in
{flag_cases}
        esac
        COMPREPLY=($(compgen -W "$flags" -- "$cur"))
    fi
}}
complete -F _mem_completions mem
## END: MemCompletion ###################################################
"""


# ---------------------------------------------------------------------------
# Zsh
# ---------------------------------------------------------------------------

def zsh_completion() -> str:
    agents = " ".join(get_live_agents())
    models = " ".join(get_known_models())
    cmds   = " ".join(MEM_COMMANDS)

    flag_cases = "\n".join(
        f"            {cmd}) flags=({' '.join(flags)}) ;;"
        for cmd, flags in MEM_FLAGS_BY_CMD.items()
    )

    return f"""
## BEGIN: MemCompletion ##################################################
_mem_complete() {{
    local -a cmds agents models flags
    cmds=({cmds})
    agents=({agents})
    models=({models})

    if (( CURRENT == 2 )); then
        _describe 'command' cmds
    elif [[ ${{words[${{CURRENT-1}}]}} == '--agent' ]]; then
        _describe 'agent' agents
    elif [[ ${{words[${{CURRENT-1}}]}} == '--model' ]]; then
        _describe 'model' models
    else
        case ${{words[2]}} in
{flag_cases}
        esac
        _describe 'option' flags
    fi
}}
compdef _mem_complete mem
## END: MemCompletion ###################################################
"""


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    if "--list" in sys.argv:
        agents = get_live_agents()
        models = get_known_models()
        print(f"  Workspace agents ({len(agents)}): {', '.join(agents) or 'none yet'}")
        print(f"  Known models    ({len(models)}): {', '.join(models) or 'none yet'}")
        print(f"  Active models   : {', '.join(get_live_models()) or 'none yet'}")
        return

    shell = sys.argv[1].lower() if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "powershell"
    if shell == "powershell":
        print(powershell_completion())
    elif shell == "bash":
        print(bash_completion())
    elif shell == "zsh":
        print(zsh_completion())
    else:
        print(f"Unknown shell: {shell}. Options: powershell, bash, zsh", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
