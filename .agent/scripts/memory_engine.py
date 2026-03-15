"""
memory_engine.py — Unified Agent Memory Engine
================================================
Core library for reading, writing, compressing, and searching the shared
agent memory store. Used by all agents: Antigravity, Gemini, Claude,
Codex, terminal scripts, or any custom agent.

Usage:
  python memory_engine.py --read
  python memory_engine.py --write --task "Build auth module" --agent "antigravity" --status "in_progress"
  python memory_engine.py --checkpoint --task-id <id> --summary "Completed DB schema"
  python memory_engine.py --search "auth module"
  python memory_engine.py --context --agent "gemini" --max-tokens 4000
  python memory_engine.py --test
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
AGENT_DIR = Path(__file__).parent.parent
MEMORY_DIR = AGENT_DIR / "memory"
STORE_PATH = MEMORY_DIR / "memory-store.json"
SESSION_PATH = MEMORY_DIR / "session.json"
USAGE_PATH = MEMORY_DIR / "usage-tracker.json"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def _load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _save_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _estimate_tokens(text: str) -> int:
    """Rough estimate: ~4 chars per token (GPT-style tokenisation)."""
    return max(1, len(text) // 4)


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def read_memory(scope: str = "all") -> dict[str, Any]:
    """
    Load the current memory store.
    scope: "all" | "tasks" | "checkpoints" | "knowledge" | "session"
    """
    if scope == "session":
        return _load_json(SESSION_PATH)

    store = _load_json(STORE_PATH)
    if scope == "all":
        return store
    return {scope: store.get(scope, [])}


def write_memory(
    title: str,
    agent: str,
    description: str = "",
    status: str = "in_progress",
    tags: list[str] | None = None,
    task_id: str | None = None,
) -> str:
    """
    Create or update a task entry. Returns the task_id.
    `agent` can be any string: "antigravity", "gemini", "claude", "terminal", etc.
    """
    store = _load_json(STORE_PATH)
    store.setdefault("tasks", [])
    store.setdefault("checkpoints", [])
    store.setdefault("knowledge", [])

    now = _now_iso()

    # Check if updating an existing task
    existing = next((t for t in store["tasks"] if t.get("id") == task_id), None)

    if existing and task_id:
        existing.update(
            {
                "title": title,
                "agent": agent,
                "description": description,
                "status": status,
                "tags": tags or existing.get("tags", []),
                "updated_at": now,
            }
        )
        _save_json(STORE_PATH, store)
        _update_session(task_id=task_id, agent=agent, status=status)
        return task_id

    # New task
    tid = task_id or str(uuid.uuid4())[:8]
    task: dict[str, Any] = {
        "id": tid,
        "title": title,
        "agent": agent,
        "description": description,
        "status": status,
        "tags": tags or [],
        "created_at": now,
        "updated_at": now,
        "checkpoints": [],
    }
    store["tasks"].insert(0, task)
    _save_json(STORE_PATH, store)
    _update_session(task_id=tid, agent=agent, status=status)
    return tid


def save_checkpoint(
    task_id: str,
    summary: str,
    agent: str,
    context_snapshot: str = "",
) -> str:
    """
    Save a compressed mid-task snapshot so agents can resume after context reset.
    Returns checkpoint_id.
    """
    store = _load_json(STORE_PATH)
    store.setdefault("checkpoints", [])
    store.setdefault("tasks", [])

    now = _now_iso()
    cid = str(uuid.uuid4())[:8]

    # Compress the context snapshot
    compressed = compress_context(context_snapshot) if context_snapshot else ""

    checkpoint: dict[str, Any] = {
        "id": cid,
        "task_id": task_id,
        "agent": agent,
        "summary": summary,
        "compressed_context": compressed,
        "token_estimate": _estimate_tokens(compressed),
        "created_at": now,
    }
    store["checkpoints"].insert(0, checkpoint)

    # Link to task
    task = next((t for t in store["tasks"] if t.get("id") == task_id), None)
    if task:
        task.setdefault("checkpoints", []).append(cid)
        task["updated_at"] = now

    _save_json(STORE_PATH, store)

    # Update session last_checkpoint
    session = _load_json(SESSION_PATH)
    session["last_checkpoint_at"] = now
    _save_json(SESSION_PATH, session)

    return cid


def search_memory(query: str, limit: int = 10) -> list[dict[str, Any]]:
    """
    Fuzzy keyword search across tasks, checkpoints, and knowledge entries.
    Returns ranked list of matches.
    """
    store = _load_json(STORE_PATH)
    results: list[dict[str, Any]] = []
    terms = [t.lower() for t in query.split()]

    def _score(text: str) -> int:
        text_lower = text.lower()
        return sum(1 for term in terms if term in text_lower)

    for task in store.get("tasks", []):
        combined = f"{task.get('title','')} {task.get('description','')} {' '.join(task.get('tags', []))}"
        score = _score(combined)
        if score > 0:
            results.append({"type": "task", "score": score, **task})

    for cp in store.get("checkpoints", []):
        combined = f"{cp.get('summary','')} {cp.get('compressed_context','')}"
        score = _score(combined)
        if score > 0:
            results.append({"type": "checkpoint", "score": score, **cp})

    for kn in store.get("knowledge", []):
        combined = f"{kn.get('title','')} {kn.get('content','')}"
        score = _score(combined)
        if score > 0:
            results.append({"type": "knowledge", "score": score, **kn})

    results.sort(key=lambda x: x["score"], reverse=True)
    return results[:limit]


def get_context_for_agent(agent_name: str, max_tokens: int = 4000) -> str:
    """
    Build a budget-aware context blob for an agent to inject at conversation start.
    Prioritises: active task → recent checkpoints → relevant knowledge.
    """
    session = _load_json(SESSION_PATH)
    store = _load_json(STORE_PATH)

    lines: list[str] = [
        "<MEMORY_CONTEXT>",
        f"# Agent Memory System — Context for: {agent_name}",
        f"# Loaded: {_now_iso()}",
        "",
    ]
    tokens_used = 0
    budget = max_tokens

    # Active task
    active_id = session.get("active_task_id")
    if active_id:
        task = next((t for t in store.get("tasks", []) if t["id"] == active_id), None)
        if task:
            block = (
                f"## Active Task\n"
                f"- **ID**: {task['id']}\n"
                f"- **Title**: {task['title']}\n"
                f"- **Agent**: {task['agent']}\n"
                f"- **Status**: {task['status']}\n"
                f"- **Description**: {task.get('description', 'N/A')}\n"
                f"- **Updated**: {task['updated_at']}\n"
            )
            tokens_used += _estimate_tokens(block)
            lines.append(block)
            budget -= tokens_used

    # Recent checkpoints for the active task
    if active_id and budget > 200:
        relevant_cps = [
            cp for cp in store.get("checkpoints", []) if cp.get("task_id") == active_id
        ][:3]
        if relevant_cps:
            lines.append("## Recent Checkpoints")
            for cp in relevant_cps:
                entry = f"- [{cp['created_at']}] {cp['summary']}"
                if cp.get("compressed_context"):
                    entry += f"\n  Context: {cp['compressed_context'][:200]}..."
                t = _estimate_tokens(entry)
                if budget - t <= 0:
                    break
                lines.append(entry)
                budget -= t

    # Knowledge snippets (all, trimmed to budget)
    if budget > 100:
        knowledge = store.get("knowledge", [])[:5]
        if knowledge:
            lines.append("\n## Knowledge Base")
            for kn in knowledge:
                entry = f"- **{kn.get('title','')}**: {kn.get('content','')[:150]}"
                t = _estimate_tokens(entry)
                if budget - t <= 0:
                    break
                lines.append(entry)
                budget -= t

    # Recent tasks (excluding active)
    recent_tasks = [
        t for t in store.get("tasks", []) if t.get("id") != active_id
    ][:5]
    if recent_tasks and budget > 100:
        lines.append("\n## Recent Tasks")
        for t in recent_tasks:
            entry = f"- [{t['status']}] {t['title']} (by {t['agent']}, {t['updated_at'][:10]})"
            lines.append(entry)

    lines.append("\n</MEMORY_CONTEXT>")
    return "\n".join(lines)


def compress_context(text: str, max_sentences: int = 10) -> str:
    """
    Extractive compression: scores sentences by keyword frequency and keeps top N.
    No external AI required — pure Python.
    """
    if not text.strip():
        return ""

    # Sentence tokenization (simple split on . ! ?)
    sentences = re.split(r"(?<=[.!?])\s+", text.strip())
    if len(sentences) <= max_sentences:
        return text

    # Score by word frequency (TF-style)
    words = re.findall(r"\w+", text.lower())
    freq: dict[str, int] = {}
    for word in words:
        if len(word) > 3:  # ignore short stop words
            freq[word] = freq.get(word, 0) + 1

    def _score_sentence(sentence: str) -> float:
        s_words = re.findall(r"\w+", sentence.lower())
        if not s_words:
            return 0.0
        return sum(freq.get(w, 0) for w in s_words) / len(s_words)

    scored = [(s, _score_sentence(s)) for s in sentences]
    scored.sort(key=lambda x: x[1], reverse=True)
    top = [s for s, _ in scored[:max_sentences]]

    # Preserve original order
    order = {s: i for i, s in enumerate(sentences)}
    top.sort(key=lambda s: order.get(s, 0))
    return " ".join(top)


def save_knowledge(title: str, content: str, tags: list[str] | None = None) -> str:
    """Save a reusable fact/decision to the knowledge base."""
    store = _load_json(STORE_PATH)
    store.setdefault("knowledge", [])
    kid = str(uuid.uuid4())[:8]
    store["knowledge"].insert(0, {
        "id": kid,
        "title": title,
        "content": content,
        "tags": tags or [],
        "created_at": _now_iso(),
    })
    _save_json(STORE_PATH, store)
    return kid


def complete_task(task_id: str, summary: str = "") -> None:
    """Mark a task as completed and save a final checkpoint."""
    store = _load_json(STORE_PATH)
    task = next((t for t in store.get("tasks", []) if t["id"] == task_id), None)
    if task:
        task["status"] = "completed"
        task["updated_at"] = _now_iso()
        if summary:
            task["completion_summary"] = summary
    _save_json(STORE_PATH, store)
    _update_session(task_id=None, agent=None, status="idle")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _update_session(
    task_id: str | None,
    agent: str | None,
    status: str = "in_progress",
) -> None:
    session = _load_json(SESSION_PATH)
    session["active_task_id"] = task_id
    session["active_agent"] = agent
    session["status"] = status
    if task_id and not session.get("session_id"):
        session["session_id"] = str(uuid.uuid4())[:8]
        session["started_at"] = _now_iso()
    _save_json(SESSION_PATH, session)


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

def _run_tests() -> None:
    print("🧪 memory_engine.py — Self Test")
    print("-" * 40)

    # Write task
    tid = write_memory(
        title="Test Task: Memory Engine Validation",
        agent="test_runner",
        description="Verifying read/write/compress/search cycle",
        status="in_progress",
    )
    print(f"✅ write_memory → task_id={tid}")

    # Checkpoint
    cid = save_checkpoint(
        task_id=tid,
        agent="test_runner",
        summary="Step 1 complete",
        context_snapshot="The memory engine stores tasks and checkpoints. It supports any agent. Compression reduces large context to key sentences. Search finds relevant tasks by keyword matching.",
    )
    print(f"✅ save_checkpoint → {cid}")

    # Read
    mem = read_memory("tasks")
    assert any(t["id"] == tid for t in mem["tasks"]), "Task not found in store"
    print("✅ read_memory → task found")

    # Compress
    long_text = " . ".join(["The agent must read memory at session start"] * 20)
    compressed = compress_context(long_text, max_sentences=3)
    assert len(compressed) < len(long_text), "Compression did not reduce size"
    print(f"✅ compress_context → {len(long_text)} → {len(compressed)} chars")

    # Search
    results = search_memory("memory engine validation")
    assert len(results) > 0, "Search returned no results"
    print(f"✅ search_memory → {len(results)} result(s)")

    # Context blob
    blob = get_context_for_agent("gemini", max_tokens=2000)
    assert "<MEMORY_CONTEXT>" in blob
    print(f"✅ get_context_for_agent → {_estimate_tokens(blob)} tokens")

    # Knowledge
    kid = save_knowledge("Dynamic agents", "Any agent name is valid — no hardcoded list")
    print(f"✅ save_knowledge → {kid}")

    # Complete
    complete_task(tid, summary="All engine tests passed")
    store = _load_json(STORE_PATH)
    task = next(t for t in store["tasks"] if t["id"] == tid)
    assert task["status"] == "completed"
    print("✅ complete_task → status=completed")

    print("-" * 40)
    print("🎉 All tests passed!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Memory Engine")
    parser.add_argument("--read", action="store_true", help="Read current memory (pretty print)")
    parser.add_argument("--write", action="store_true", help="Write/update a task")
    parser.add_argument("--checkpoint", action="store_true", help="Save a checkpoint")
    parser.add_argument("--search", metavar="QUERY", help="Search memory")
    parser.add_argument("--context", action="store_true", help="Get context blob for agent")
    parser.add_argument("--complete", action="store_true", help="Mark task as completed")
    parser.add_argument("--know", action="store_true", help="Save a knowledge entry")
    parser.add_argument("--test", action="store_true", help="Run self-tests")
    parser.add_argument("--task-id", default=None)
    parser.add_argument("--task", "--title", default="Untitled Task", dest="title")
    parser.add_argument("--agent", default="unknown")
    parser.add_argument("--status", default="in_progress")
    parser.add_argument("--description", "--desc", default="", dest="description")
    parser.add_argument("--summary", default="")
    parser.add_argument("--content", default="")
    parser.add_argument("--tags", default="", help="Comma-separated tags")
    parser.add_argument("--max-tokens", type=int, default=4000)
    parser.add_argument("--scope", default="all")

    args = parser.parse_args()
    tags = [t.strip() for t in args.tags.split(",") if t.strip()]

    if args.test:
        _run_tests()
    elif args.read:
        print(json.dumps(read_memory(args.scope), indent=2))
    elif args.write:
        tid = write_memory(
            title=args.title,
            agent=args.agent,
            description=args.description,
            status=args.status,
            tags=tags,
            task_id=args.task_id,
        )
        print(f"Task saved: {tid}")
    elif args.checkpoint:
        if not args.task_id:
            print("ERROR: --task-id is required for checkpoints", file=sys.stderr)
            sys.exit(1)
        cid = save_checkpoint(
            task_id=args.task_id,
            agent=args.agent,
            summary=args.summary,
            context_snapshot=args.content,
        )
        print(f"Checkpoint saved: {cid}")
    elif args.search:
        results = search_memory(args.search)
        if not results:
            print("No results found.")
        else:
            for r in results:
                print(f"[{r['type']}] (score={r['score']}) {r.get('title', r.get('summary',''))}")
    elif args.context:
        print(get_context_for_agent(args.agent, max_tokens=args.max_tokens))
    elif args.complete:
        if not args.task_id:
            print("ERROR: --task-id required", file=sys.stderr)
            sys.exit(1)
        complete_task(args.task_id, summary=args.summary)
        print(f"Task {args.task_id} marked as completed.")
    elif args.know:
        kid = save_knowledge(title=args.title, content=args.content, tags=tags)
        print(f"Knowledge saved: {kid}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
