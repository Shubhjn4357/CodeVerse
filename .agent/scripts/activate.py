"""
activate.py — Unified Agent Memory Session Activator
=====================================================
Detects the .Agent folder in the workspace (CWD or parent tree),
initialises a new memory session, and prints a boot banner.

Run automatically from PowerShell hook or manually:
  python .Agent/scripts/activate.py
  python .Agent/scripts/activate.py --status     # just show current session
  python .Agent/scripts/activate.py --workspace d:\\Code
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Locate .Agent folder
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).parent
AGENT_DIR = _THIS_DIR.parent


def find_agent_dir(start: Path | None = None) -> Path | None:
    """Walk up from `start` (default: CWD) looking for a .Agent folder."""
    search = start or Path.cwd()
    for directory in [search, *search.parents]:
        candidate = directory / ".Agent"
        if candidate.is_dir():
            return candidate
    return None


# ---------------------------------------------------------------------------
# Lazy imports after path validation
# ---------------------------------------------------------------------------

def _import_engine():
    sys.path.insert(0, str(AGENT_DIR / "scripts"))
    from memory_engine import _load_json, _save_json, SESSION_PATH, STORE_PATH
    from usage_tracker import get_report, get_optimization_tips
    return _load_json, _save_json, SESSION_PATH, STORE_PATH, get_report, get_optimization_tips


# ---------------------------------------------------------------------------
# Session management
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def init_session(workspace: Path) -> dict:
    _load_json, _save_json, SESSION_PATH, STORE_PATH, _, _ = _import_engine()

    session_id = str(uuid.uuid4())[:8]
    session = {
        "version": "1.0.0",
        "session_id": session_id,
        "started_at": _now_iso(),
        "workspace": str(workspace),
        "active_task_id": None,
        "active_agent": None,
        "status": "idle",
        "last_checkpoint_at": None,
        "context_tokens_used": 0,
        "context_budget": 100_000,
        "notes": [],
    }
    _save_json(SESSION_PATH, session)
    return session


def read_session() -> dict:
    _load_json, _, SESSION_PATH, STORE_PATH, _, _ = _import_engine()
    return _load_json(SESSION_PATH)


def read_store() -> dict:
    _load_json, _, SESSION_PATH, STORE_PATH, _, _ = _import_engine()
    return _load_json(STORE_PATH)


# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------

BANNER = """
╔══════════════════════════════════════════════════════════╗
║       🧠  Agent Memory System  —  Session Active         ║
╚══════════════════════════════════════════════════════════╝
"""


def print_status(session: dict, store: dict) -> None:
    print(BANNER)
    print(f"  Session ID  : {session.get('session_id', 'N/A')}")
    print(f"  Workspace   : {session.get('workspace', 'N/A')}")
    print(f"  Started     : {session.get('started_at', 'N/A')}")
    print(f"  Status      : {session.get('status', 'idle')}")

    active_id = session.get("active_task_id")
    if active_id:
        task = next((t for t in store.get("tasks", []) if t["id"] == active_id), None)
        if task:
            print(f"\n  📌 Active Task  : [{task['status']}] {task['title']}")
            print(f"     Agent       : {task['agent']}")
            print(f"     Updated     : {task['updated_at']}")
    else:
        tasks = store.get("tasks", [])
        in_progress = [t for t in tasks if t.get("status") == "in_progress"]
        if in_progress:
            t = in_progress[0]
            print(f"\n  📌 Last In-Progress Task : [{t['id']}] {t['title']}")
        elif tasks:
            t = tasks[0]
            print(f"\n  📋 Last Task : [{t['status']}] {t['title']}")

    print()
    total_tasks = len(store.get("tasks", []))
    total_checkpoints = len(store.get("checkpoints", []))
    total_knowledge = len(store.get("knowledge", []))
    print(f"  Memory: {total_tasks} task(s) | {total_checkpoints} checkpoint(s) | {total_knowledge} knowledge item(s)")
    print()
    print("  Quick Commands:")
    print("    python .Agent/scripts/memory_engine.py --read")
    print("    python .Agent/scripts/memory_engine.py --context --agent <name>")
    print("    python .Agent/scripts/usage_tracker.py --report")
    print("    python .Agent/scripts/usage_tracker.py --tips")
    print()


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Memory Session Activator")
    parser.add_argument("--status", action="store_true", help="Show current session status only")
    parser.add_argument("--workspace", default=None, help="Workspace path (default: auto-detect)")
    args = parser.parse_args()

    # Resolve workspace
    if args.workspace:
        workspace = Path(args.workspace)
    else:
        agent_dir = find_agent_dir()
        workspace = agent_dir.parent if agent_dir else Path.cwd()

    if args.status:
        session = read_session()
        store = read_store()
        print_status(session, store)
        return

    # Initialize new session
    session = init_session(workspace)
    store = read_store()
    print_status(session, store)
    print(f"  ✅ New session started: {session['session_id']}")
    print()


if __name__ == "__main__":
    main()
