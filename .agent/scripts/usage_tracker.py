"""
usage_tracker.py — Dynamic LLM Token Usage Tracker
====================================================
Logs token usage per agent (any string identifier) and per model.
Model cost config is loaded from memory/model_costs.json — fully editable.
New models auto-discover pricing from a built-in seed table and persist it.
Only models actually used in this workspace appear in reports.

Usage:
  python usage_tracker.py --log --agent "antigravity" --model "gemini-2.5-pro" --input 1200 --output 800
  python usage_tracker.py --log --agent "terminal" --model "my-custom-llm" --input 500 --output 300
  python usage_tracker.py --report
  python usage_tracker.py --tips
  python usage_tracker.py --models          # list all known models + cost
  python usage_tracker.py --add-model "my-llm" --cost-input 1.5 --cost-output 6.0
  python usage_tracker.py --test
"""

from __future__ import annotations

import argparse
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ---------------------------------------------------------------------------
# Path resolution — works from ANY directory
# ---------------------------------------------------------------------------
def _find_agent_dir() -> Path:
    """Walk from CWD up to find .Agent directory. Falls back to script's parent."""
    # Primary: script-relative (always correct when called via `mem` alias)
    script_based = Path(__file__).resolve().parent.parent
    if (script_based / "memory").is_dir():
        return script_based
    # Fallback: walk CWD upward
    for d in [Path.cwd(), *Path.cwd().parents]:
        candidate = d / ".Agent"
        if candidate.is_dir() and (candidate / "memory").is_dir():
            return candidate
    # Last resort: script-relative anyway
    return script_based

AGENT_DIR  = _find_agent_dir()
MEMORY_DIR = AGENT_DIR / "memory"
USAGE_PATH = MEMORY_DIR / "usage-tracker.json"
COSTS_PATH = MEMORY_DIR / "model_costs.json"

# ---------------------------------------------------------------------------
# Built-in seed pricing (USD per 1M tokens) — only used to bootstrap config
# This is NOT the source of truth; model_costs.json is. Update via:
#   mem log ... --model <name>   (auto-seeds)
#   python usage_tracker.py --add-model "name" --cost-input 1.5 --cost-output 6.0
# ---------------------------------------------------------------------------
_SEED_COSTS: dict[str, dict[str, float]] = {
    "gemini-2.5-pro":         {"input": 1.25,  "output": 10.0},
    "gemini-2.0-flash":       {"input": 0.10,  "output": 0.40},
    "gemini-1.5-pro":         {"input": 1.25,  "output": 5.00},
    "claude-3-7-sonnet":      {"input": 3.00,  "output": 15.0},
    "claude-3-5-sonnet":      {"input": 3.00,  "output": 15.0},
    "claude-3-5-haiku":       {"input": 0.80,  "output": 4.00},
    "claude-3-opus":          {"input": 15.0,  "output": 75.0},
    "gpt-4o":                 {"input": 2.50,  "output": 10.0},
    "gpt-4o-mini":            {"input": 0.15,  "output": 0.60},
    "gpt-4-turbo":            {"input": 10.0,  "output": 30.0},
    "o1":                     {"input": 15.0,  "output": 60.0},
    "o3":                     {"input": 10.0,  "output": 40.0},
    "o3-mini":                {"input": 1.10,  "output": 4.40},
    "codex-davinci":          {"input": 2.00,  "output": 2.00},
    "deepseek-v3":            {"input": 0.27,  "output": 1.10},
    "deepseek-r1":            {"input": 0.55,  "output": 2.19},
    "mistral-large":          {"input": 2.00,  "output": 6.00},
    "llama-3.3-70b":          {"input": 0.59,  "output": 0.79},
    "jetbrains-llm":          {"input": 0.00,  "output": 0.00},
    "default":                {"input": 1.00,  "output": 4.00},
}

# ---------------------------------------------------------------------------
# Model cost store (dynamic) — backed by model_costs.json
# ---------------------------------------------------------------------------

def _load_costs() -> dict[str, dict[str, float]]:
    """Load model costs from config file. Seeds file if missing or incomplete."""
    if not COSTS_PATH.exists():
        _save_costs({"default": _SEED_COSTS["default"]})
    with open(COSTS_PATH, encoding="utf-8") as f:
        raw = json.load(f)
    raw.pop("_comment", None)
    # Always ensure 'default' exists
    if "default" not in raw:
        raw["default"] = _SEED_COSTS["default"]
    return raw


def _save_costs(costs: dict[str, dict[str, float]]) -> None:
    COSTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    out: dict[str, Any] = {
        "_comment": (
            "Model pricing (USD per 1M tokens). "
            "Edit freely or run: mem log --add-model <name> --cost-input X --cost-output Y"
        ),
        **costs,
    }
    with open(COSTS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)


def _ensure_model_cost(model: str) -> None:
    """Auto-seed a new model into model_costs.json from the seed table if not present."""
    costs = _load_costs()
    if model not in costs:
        seed = _SEED_COSTS.get(model, _SEED_COSTS["default"])
        costs[model] = seed
        _save_costs(costs)


def add_model_cost(model: str, cost_input: float, cost_output: float) -> None:
    """Manually register or update pricing for a model."""
    costs = _load_costs()
    costs[model] = {"input": cost_input, "output": cost_output}
    _save_costs(costs)


def get_known_models() -> list[str]:
    """Return all models with known pricing in this workspace."""
    return [k for k in _load_costs().keys() if not k.startswith("_")]


def get_active_models() -> list[str]:
    """Return only models actually logged in this workspace's usage-tracker."""
    data = _load()
    seen = {s.get("model", "") for s in data.get("sessions", [])}
    return sorted(m for m in seen if m)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat()


def _load() -> dict[str, Any]:
    if not USAGE_PATH.exists():
        return {"version": "1.0.0", "sessions": [], "totals": {}}
    with open(USAGE_PATH, encoding="utf-8") as f:
        return json.load(f)


def _save(data: dict[str, Any]) -> None:
    USAGE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(USAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def _cost_usd(model: str, input_tokens: int, output_tokens: int) -> float:
    costs = _load_costs()
    c = costs.get(model) or costs.get("default", {"input": 1.0, "output": 4.0})
    return (input_tokens * c["input"] + output_tokens * c["output"]) / 1_000_000


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def log_usage(
    agent: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    task_id: str | None = None,
    note: str = "",
) -> str:
    """
    Log a usage event. `agent` and `model` are any strings — fully dynamic.
    Auto-seeds model cost if not yet in config.
    Returns the session_entry_id.
    """
    _ensure_model_cost(model)   # auto-register unknown models

    data = _load()
    data.setdefault("sessions", [])
    data.setdefault("totals", {})

    entry_id     = str(uuid.uuid4())[:8]
    now          = _now_iso()
    cost         = _cost_usd(model, input_tokens, output_tokens)
    total_tokens = input_tokens + output_tokens

    entry: dict[str, Any] = {
        "id": entry_id,
        "agent": agent,
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cost_usd": round(cost, 6),
        "task_id": task_id,
        "note": note,
        "logged_at": now,
    }
    data["sessions"].insert(0, entry)

    # Totals — fully dynamic; agent and model keys created on-demand
    totals = data["totals"]
    totals.setdefault(agent, {})
    ag: dict[str, Any] = totals[agent]
    ag.setdefault("input_tokens", 0)
    ag.setdefault("output_tokens", 0)
    ag.setdefault("total_tokens", 0)
    ag.setdefault("cost_usd", 0.0)
    ag.setdefault("session_count", 0)
    ag.setdefault("models_used", [])

    ag["input_tokens"]  += input_tokens
    ag["output_tokens"] += output_tokens
    ag["total_tokens"]  += total_tokens
    ag["cost_usd"]       = round(ag["cost_usd"] + cost, 6)
    ag["session_count"] += 1
    if model not in ag["models_used"]:
        ag["models_used"].append(model)

    _save(data)
    return entry_id


def get_report(agent_filter: str | None = None) -> str:
    data     = _load()
    totals   = data.get("totals", {})
    sessions = data.get("sessions", [])

    if agent_filter:
        totals   = {k: v for k, v in totals.items() if agent_filter.lower() in k.lower()}
        sessions = [s for s in sessions if agent_filter.lower() in s.get("agent", "").lower()]

    lines = [
        "╔══════════════════════════════════════════════════════╗",
        "║        🧠 Unified Agent Token Usage Report           ║",
        "╚══════════════════════════════════════════════════════╝",
        "",
    ]

    if not totals:
        lines.append("  No usage data recorded yet.")
        return "\n".join(lines)

    grand_tokens = 0
    grand_cost   = 0.0

    for agent_name, stats in sorted(totals.items()):
        bar_len = min(40, stats["total_tokens"] // 1000)
        bar     = "█" * bar_len + "░" * (40 - bar_len)
        models  = ", ".join(stats.get("models_used", []))
        lines += [
            f"  Agent: {agent_name}",
            f"  ├─ Input   : {stats['input_tokens']:>10,} tokens",
            f"  ├─ Output  : {stats['output_tokens']:>10,} tokens",
            f"  ├─ Total   : {stats['total_tokens']:>10,} tokens  [{bar}]",
            f"  ├─ Cost    : ${stats['cost_usd']:>10.4f} USD",
            f"  ├─ Sessions: {stats['session_count']}",
            f"  └─ Models  : {models or 'N/A'}",
            "",
        ]
        grand_tokens += stats["total_tokens"]
        grand_cost   += stats["cost_usd"]

    lines += [
        "─" * 54,
        f"  GRAND TOTAL : {grand_tokens:,} tokens",
        f"  GRAND COST  : ${grand_cost:.4f} USD",
        "─" * 54,
        "",
    ]

    # Active models in workspace
    active = get_active_models()
    if active:
        lines.append(f"  Active models in workspace: {', '.join(active)}")

    recent = sessions[:5]
    if recent:
        lines.append("\n  Recent Sessions:")
        for s in recent:
            lines.append(
                f"    [{s['logged_at'][:10]}] {s['agent']} / {s['model']}"
                f" — {s['total_tokens']:,} tokens (${s['cost_usd']:.4f})"
                + (f" — {s['note']}" if s.get("note") else "")
            )

    return "\n".join(lines)


def get_optimization_tips() -> str:
    data     = _load()
    sessions = data.get("sessions", [])
    totals   = data.get("totals", {})

    lines = [
        "╔══════════════════════════════════════════════════════╗",
        "║     ⚡ Token Optimization Recommendations            ║",
        "╚══════════════════════════════════════════════════════╝",
        "",
    ]

    if not sessions:
        lines.append("  No usage data to analyse yet.")
        return "\n".join(lines)

    # Tip 1: High output/input ratio
    for agent_name, stats in totals.items():
        if stats.get("input_tokens", 0) > 0:
            ratio = stats["output_tokens"] / stats["input_tokens"]
            if ratio > 2:
                lines.append(
                    f"  WARNING [{agent_name}] Output/Input ratio is {ratio:.1f}x — "
                    f"use --max-tokens or tighter prompts."
                )

    # Tip 2: Large sessions
    large = [s for s in sessions if s["total_tokens"] > 50_000]
    if large:
        lines.append(
            f"  WARNING {len(large)} session(s) used >50K tokens. "
            f"Use `mem compress` to pre-compress context."
        )

    # Tip 3: Expensive models — inferred from cost config
    costs         = _load_costs()
    active_models = get_active_models()
    expensive     = [m for m in active_models if costs.get(m, {}).get("output", 0) >= 10.0]
    cheaper       = [m for m in get_known_models() if costs.get(m, {}).get("output", 99) < 1.0 and m != "default"]
    if expensive and cheaper:
        lines.append(
            f"  TIP Expensive models in use: {', '.join(expensive)}. "
            f"Cheaper alternatives: {', '.join(cheaper[:3])}."
        )

    # Tip 4: Daily average
    dates     = [s["logged_at"][:10] for s in sessions]
    days      = len(set(dates)) or 1
    daily_avg = sum(s["total_tokens"] for s in sessions) / days
    lines.append(f"  INFO Daily average: {daily_avg:,.0f} tokens/day")

    # Tip 5: Checkpoint advice
    lines.append(
        "  TIP Save checkpoints every ~30K tokens:\n"
        "      mem cp \"Step done. Next: ...\""
    )
    lines.append(
        "  TIP Compress context before large tasks:\n"
        "      mem compress context.txt 4000"
    )

    return "\n".join(lines)


def get_summary_for_dashboard() -> dict[str, Any]:
    """Return structured data for the HTML dashboard — only active workspace data."""
    data          = _load()
    active_models = get_active_models()
    costs         = _load_costs()
    active_costs  = {m: costs[m] for m in active_models if m in costs}

    return {
        "totals":          data.get("totals", {}),
        "recent_sessions": data.get("sessions", [])[:20],
        "active_models":   active_models,
        "model_costs":     active_costs,         # only models used in this workspace
    }


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

def _run_tests() -> None:
    print("🧪 usage_tracker.py — Self Test")
    print("-" * 40)

    agents = ["antigravity", "gemini", "claude", "codex", "terminal", "my_custom_agent"]
    models = ["gemini-2.5-pro", "claude-3-7-sonnet", "gpt-4o", "gemini-2.0-flash", "gpt-4o-mini", "my-brand-new-llm"]

    for i, (ag, mo) in enumerate(zip(agents, models)):
        eid = log_usage(
            agent=ag, model=mo,
            input_tokens=(i + 1) * 1000, output_tokens=(i + 1) * 500,
            task_id=f"test-{i}", note="Self-test",
        )
        print(f"✅ log_usage [{ag} / {mo}] → {eid}")

    # Verify unknown model was auto-seeded into model_costs.json
    costs = _load_costs()
    assert "my-brand-new-llm" in costs, "Unknown model not auto-seeded"
    print("✅ Unknown model 'my-brand-new-llm' auto-seeded into model_costs.json")

    report = get_report()
    assert "GRAND TOTAL" in report
    print("✅ get_report → generated")

    filtered = get_report(agent_filter="gemini")
    assert "gemini" in filtered
    print("✅ get_report (filtered) → generated")

    tips = get_optimization_tips()
    assert "Token Optimization" in tips
    print("✅ get_optimization_tips → generated")

    summary = get_summary_for_dashboard()
    assert "active_models" in summary
    assert "my-brand-new-llm" in summary["active_models"]
    print(f"✅ get_summary_for_dashboard → {len(summary['totals'])} agents, {len(summary['active_models'])} active models")

    active = get_active_models()
    assert "my-brand-new-llm" in active
    print(f"✅ get_active_models → {active}")

    print("-" * 40)
    print("🎉 All tests passed!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Agent Token Usage Tracker")
    sub = parser.add_subparsers(dest="cmd")

    # Legacy flags (backward compat)
    parser.add_argument("--log",           action="store_true")
    parser.add_argument("--report",        action="store_true")
    parser.add_argument("--tips",          action="store_true")
    parser.add_argument("--dashboard-data",action="store_true")
    parser.add_argument("--models",        action="store_true", help="List known models + cost")
    parser.add_argument("--add-model",     metavar="MODEL",     help="Register model pricing")
    parser.add_argument("--cost-input",    type=float, default=1.0)
    parser.add_argument("--cost-output",   type=float, default=4.0)
    parser.add_argument("--test",          action="store_true")
    parser.add_argument("--agent",         default="unknown")
    parser.add_argument("--model",         default="default")
    parser.add_argument("--input",         type=int,   default=0, dest="input_tokens")
    parser.add_argument("--output",        type=int,   default=0, dest="output_tokens")
    parser.add_argument("--task-id",       default=None)
    parser.add_argument("--note",          default="")

    args = parser.parse_args()

    if args.test:
        _run_tests()
    elif args.add_model:
        add_model_cost(args.add_model, args.cost_input, args.cost_output)
        print(f"Model '{args.add_model}' registered: input=${args.cost_input}/M  output=${args.cost_output}/M")
    elif args.models:
        costs  = _load_costs()
        active = set(get_active_models())
        print(f"\n  {'Model':<30} {'Input/1M':>10}  {'Output/1M':>10}  {'In Use'}")
        print(f"  {'-'*30} {'-'*10}  {'-'*10}  {'-'*6}")
        for m, c in sorted(costs.items()):
            if m.startswith("_"):
                continue
            used = "YES" if m in active else "---"
            print(f"  {m:<30} ${c['input']:>9.2f}  ${c['output']:>9.2f}  {used}")
        print()
    elif args.log:
        eid = log_usage(
            agent=args.agent, model=args.model,
            input_tokens=args.input_tokens, output_tokens=args.output_tokens,
            task_id=args.task_id, note=args.note,
        )
        print(f"Usage logged: {eid}")
    elif args.report:
        print(get_report(agent_filter=args.agent if args.agent != "unknown" else None))
    elif args.tips:
        print(get_optimization_tips())
    elif args.dashboard_data:
        print(json.dumps(get_summary_for_dashboard(), indent=2))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
