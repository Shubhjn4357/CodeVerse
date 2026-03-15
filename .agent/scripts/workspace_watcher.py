"""
workspace_watcher.py — File-system Watcher for Agent Memory
============================================================
Watches the .Agent/memory/ directory for changes and:
  - Re-prints status when session.json or memory-store.json changes
  - Provides --status flag for a one-shot status print
  - Provides --watch for continuous monitoring (uses polling; no deps)

Usage:
  python workspace_watcher.py --status
  python workspace_watcher.py --watch
  python workspace_watcher.py --watch --interval 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
_THIS_DIR = Path(__file__).parent
AGENT_DIR = _THIS_DIR.parent
MEMORY_DIR = AGENT_DIR / "memory"
SESSION_PATH = MEMORY_DIR / "session.json"
STORE_PATH = MEMORY_DIR / "memory-store.json"
USAGE_PATH = MEMORY_DIR / "usage-tracker.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _load(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return {}


def _now() -> str:
    return datetime.now(timezone.utc).astimezone().strftime("%H:%M:%S")


def _mtime(path: Path) -> float:
    return path.stat().st_mtime if path.exists() else 0.0


def _token_bar(total: int, max_tokens: int = 100_000) -> str:
    pct = min(1.0, total / max_tokens)
    filled = int(pct * 30)
    color = "🟢" if pct < 0.5 else ("🟡" if pct < 0.8 else "🔴")
    return f"{color} [{'█' * filled}{'░' * (30 - filled)}] {pct*100:.0f}%"


# ---------------------------------------------------------------------------
# Status printer
# ---------------------------------------------------------------------------

def print_status() -> None:
    session = _load(SESSION_PATH)
    store = _load(STORE_PATH)
    usage = _load(USAGE_PATH)

    print(f"\n╔══ 🧠 Agent Memory Status ─── {_now()} ══╗")
    print(f"  Session : {session.get('session_id', 'none')}  |  Status: {session.get('status', 'idle')}")
    print(f"  Workspace: {session.get('workspace', 'N/A')}")

    # Active task
    active_id = session.get("active_task_id")
    if active_id:
        task = next((t for t in store.get("tasks", []) if t["id"] == active_id), None)
        if task:
            print(f"\n  📌 Active Task: [{task['status'].upper()}] {task['title']}")
            print(f"     Agent: {task['agent']}  |  Updated: {task['updated_at'][:19]}")
    else:
        recent = store.get("tasks", [])[:1]
        if recent:
            t = recent[0]
            print(f"\n  📋 Last Task: [{t['status']}] {t['title']}")

    # Checkpoints
    cps = store.get("checkpoints", [])
    if cps:
        cp = cps[0]
        print(f"  💾 Last Checkpoint: {cp.get('summary','')[:60]} ({cp['created_at'][:10]})")

    # Context usage
    ctx_tokens = session.get("context_tokens_used", 0)
    ctx_budget = session.get("context_budget", 100_000)
    if ctx_tokens > 0:
        print(f"\n  🔢 Context Usage: {_token_bar(ctx_tokens, ctx_budget)}  {ctx_tokens:,}/{ctx_budget:,} tokens")

    # Usage totals (dynamic agents)
    totals = usage.get("totals", {})
    if totals:
        print(f"\n  📊 Token Usage (all agents):")
        for agent_name, stats in sorted(totals.items()):
            tot = stats.get("total_tokens", 0)
            cost = stats.get("cost_usd", 0.0)
            print(f"     {agent_name:<20} {tot:>10,} tokens  ${cost:.4f}")

    print(f"\n  Tasks: {len(store.get('tasks', []))}  |  Checkpoints: {len(store.get('checkpoints', []))}  |  Knowledge: {len(store.get('knowledge', []))}")
    print("╚══════════════════════════════════════════════════════╝\n")


# ---------------------------------------------------------------------------
# Watcher (polling — no external dependencies)
# ---------------------------------------------------------------------------

def watch(interval: int = 3) -> None:
    print(f"👁️  Watching .Agent/memory/ for changes (interval={interval}s) — Ctrl+C to stop\n")
    mtimes = {
        SESSION_PATH: _mtime(SESSION_PATH),
        STORE_PATH: _mtime(STORE_PATH),
        USAGE_PATH: _mtime(USAGE_PATH),
    }
    print_status()

    try:
        while True:
            time.sleep(interval)
            changed = False
            for path in list(mtimes.keys()):
                new_mt = _mtime(path)
                if new_mt != mtimes[path]:
                    mtimes[path] = new_mt
                    changed = True
            if changed:
                print_status()
    except KeyboardInterrupt:
        print("\n  Watcher stopped.")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Memory Workspace Watcher")
    parser.add_argument("--status", action="store_true", help="Print current status and exit")
    parser.add_argument("--watch", action="store_true", help="Watch memory folder for changes")
    parser.add_argument("--interval", type=int, default=3, help="Polling interval in seconds (default: 3)")
    args = parser.parse_args()

    if args.status:
        print_status()
    elif args.watch:
        watch(interval=args.interval)
    else:
        print_status()  # default: show status once


if __name__ == "__main__":
    main()
