#!/usr/bin/env python3
"""
post-commit — Git Hook: Auto-checkpoint after each commit
=========================================================
Saves a memory checkpoint with the commit message as the summary.
Place this file in .git/hooks/post-commit and make executable.

On Windows, this is called by the Git hook wrapper post-commit.ps1.
"""
from __future__ import annotations
import subprocess
import sys
import os
from pathlib import Path

def main() -> None:
    # Find workspace root
    workspace = Path.cwd()
    agent_dir = None
    for d in [workspace, *workspace.parents]:
        if (d / ".Agent").is_dir():
            agent_dir = d / ".Agent"
            break

    if not agent_dir:
        return  # Not in an Agent workspace — skip

    # Get last commit message
    try:
        msg = subprocess.check_output(
            ["git", "log", "-1", "--pretty=%B"],
            text=True, stderr=subprocess.DEVNULL
        ).strip()[:120]
    except Exception:
        msg = "Git commit"

    # Get active task from session
    sys.path.insert(0, str(agent_dir / "scripts"))
    try:
        from memory_engine import _load_json, SESSION_PATH, save_checkpoint
        session  = _load_json(SESSION_PATH)
        task_id  = session.get("active_task_id")
        agent    = session.get("active_agent") or os.environ.get("MEM_AGENT", "git-hook")

        if task_id:
            cid = save_checkpoint(
                task_id=task_id,
                agent=agent,
                summary=f"[git-commit] {msg}",
                context_snapshot=f"Commit: {msg}",
            )
            print(f"🧠 Memory checkpoint saved: {cid} — {msg[:60]}")
        else:
            # Still save as a knowledge entry
            from memory_engine import save_knowledge
            save_knowledge(
                title=f"Commit: {msg[:50]}",
                content=f"Git commit at {subprocess.check_output(['git','log','-1','--pretty=%H'], text=True).strip()[:8]}: {msg}",
                tags=["git", "commit"],
            )
    except Exception as e:
        print(f"🧠 Memory hook warning: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
