"""
context_optimizer.py — Token Budget Advisor & Context Pruner
=============================================================
Analyses context text, estimates token count, detects redundancy,
and prunes/compresses to fit within a token budget.

Usage:
  python context_optimizer.py --analyze --input context.txt
  python context_optimizer.py --compress --input context.txt --budget 4000 --output compressed.txt
  python context_optimizer.py --suggest --input context.txt --budget 4000
  python context_optimizer.py --auto-checkpoint --task-id <id> --agent <name> --threshold 80000
  python context_optimizer.py --test
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

# Internal imports from same package
_SCRIPTS_DIR = Path(__file__).parent
sys.path.insert(0, str(_SCRIPTS_DIR))
from memory_engine import (
    STORE_PATH,
    compress_context,
    save_checkpoint,
    _load_json,
    _estimate_tokens,
    _now_iso,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
REDUNDANCY_THRESHOLD = 0.3   # >30% repeated phrases = high redundancy
HIGH_TOKEN_WARNING   = 50_000
CRITICAL_TOKEN_LIMIT = 80_000

# Model context windows (tokens)
MODEL_CONTEXT_LIMITS: dict[str, int] = {
    "gemini-2.5-pro":    1_000_000,
    "gemini-2.0-flash":     1_000_000,
    "claude-3-7-sonnet": 200_000,
    "claude-3-5-haiku":  200_000,
    "gpt-4o":            128_000,
    "gpt-4o-mini":       128_000,
    "o3":                200_000,
    "codex-davinci":      8_000,
    "default":           100_000,
}

# ---------------------------------------------------------------------------
# Analysis
# ---------------------------------------------------------------------------

def analyze_context(text: str, model: str = "default") -> dict[str, Any]:
    """
    Analyse a context string and return a detailed report.
    """
    if not text.strip():
        return {"error": "Empty context"}

    token_count = _estimate_tokens(text)
    char_count = len(text)
    limit = MODEL_CONTEXT_LIMITS.get(model, MODEL_CONTEXT_LIMITS["default"])
    usage_pct = (token_count / limit) * 100

    sentences = re.split(r"(?<=[.!?\n])\s+", text.strip())
    sentence_count = len(sentences)

    # Redundancy: measure repeated n-grams
    words = re.findall(r"\w+", text.lower())
    bigrams: dict[str, int] = {}
    for i in range(len(words) - 1):
        bg = f"{words[i]} {words[i+1]}"
        bigrams[bg] = bigrams.get(bg, 0) + 1
    repeated_bigrams = sum(1 for c in bigrams.values() if c > 2)
    redundancy_score = min(1.0, repeated_bigrams / max(len(bigrams), 1))

    # Compression estimate (based on redundancy)
    compression_ratio = 1.0 - (redundancy_score * 0.5)   # 0.5x–1.0x
    compressed_estimate = int(token_count * compression_ratio)
    tokens_saved = token_count - compressed_estimate

    status = "✅ OK"
    if usage_pct > 90:
        status = "🔴 CRITICAL — near context limit"
    elif usage_pct > 70:
        status = "🟠 HIGH — consider compressing"
    elif usage_pct > 40:
        status = "🟡 MODERATE"

    return {
        "token_count": token_count,
        "char_count": char_count,
        "sentence_count": sentence_count,
        "model": model,
        "context_limit": limit,
        "usage_pct": round(usage_pct, 2),
        "status": status,
        "redundancy_score": round(redundancy_score, 3),
        "compressed_token_estimate": compressed_estimate,
        "tokens_saved_estimate": tokens_saved,
        "compression_ratio": round(compression_ratio, 3),
    }


def suggest_pruning(text: str, budget: int) -> list[str]:
    """
    Return actionable suggestions to reduce context to the given token budget.
    """
    current = _estimate_tokens(text)
    suggestions: list[str] = []

    if current <= budget:
        suggestions.append(f"✅ Context ({current} tokens) is within budget ({budget} tokens). No action needed.")
        return suggestions

    deficit = current - budget
    suggestions.append(f"⚠️  Context is {current} tokens — {deficit} over the {budget}-token budget.")
    suggestions.append("")

    # Suggestion 1: Compress
    analysis = analyze_context(text)
    est_after_compress = analysis["compressed_token_estimate"]
    if est_after_compress <= budget:
        suggestions.append(f"  1️⃣  Run extractive compression → estimated {est_after_compress} tokens (saves ~{current - est_after_compress}).")
    else:
        suggestions.append(f"  1️⃣  Compression yields ~{est_after_compress} tokens — still {est_after_compress - budget} over budget.")

    # Suggestion 2: Drop old history
    suggestions.append(f"  2️⃣  Remove conversation turns older than the last 3 exchanges.")

    # Suggestion 3: Checkpoint first
    suggestions.append(f"  3️⃣  Save a checkpoint NOW, then start a new conversation with only the compressed context.")

    # Suggestion 4: Split task
    if current > CRITICAL_TOKEN_LIMIT:
        suggestions.append(f"  4️⃣  Consider splitting this task into two sub-tasks (context is very large: {current} tokens).")

    # Suggestion 5: Use smaller excerpts from docs
    suggestions.append(f"  5️⃣  Replace full file contents with concise summaries or targeted excerpts.")

    return suggestions


def compress_to_budget(text: str, budget: int) -> str:
    """
    Iteratively compress text to fit within the token budget.
    Returns compressed string.
    """
    result = text
    max_sentences = 20

    while _estimate_tokens(result) > budget and max_sentences > 2:
        result = compress_context(result, max_sentences=max_sentences)
        max_sentences = max(2, max_sentences - 3)

    return result


def auto_checkpoint(
    task_id: str,
    agent: str,
    context_text: str,
    threshold: int = CRITICAL_TOKEN_LIMIT,
) -> dict[str, Any]:
    """
    Automatically saves a compressed checkpoint if context exceeds threshold.
    Returns a dict with action taken and checkpoint_id if saved.
    """
    token_count = _estimate_tokens(context_text)

    if token_count < threshold:
        return {
            "action": "noop",
            "token_count": token_count,
            "threshold": threshold,
            "message": f"Context ({token_count} tokens) is below threshold ({threshold}). No checkpoint needed.",
        }

    compressed = compress_to_budget(context_text, budget=4000)
    summary = f"Auto-checkpoint at {_now_iso()} — original {token_count} tokens, compressed to {_estimate_tokens(compressed)}"

    cid = save_checkpoint(
        task_id=task_id,
        agent=agent,
        summary=summary,
        context_snapshot=compressed,
    )

    return {
        "action": "checkpoint_saved",
        "checkpoint_id": cid,
        "original_tokens": token_count,
        "compressed_tokens": _estimate_tokens(compressed),
        "reduction_pct": round((1 - _estimate_tokens(compressed) / token_count) * 100, 1),
        "message": f"Checkpoint {cid} saved. Reduced {token_count} → {_estimate_tokens(compressed)} tokens.",
    }


# ---------------------------------------------------------------------------
# Self-test
# ---------------------------------------------------------------------------

def _run_tests() -> None:
    print("🧪 context_optimizer.py — Self Test")
    print("-" * 40)

    sample = (
        "The agent memory system stores tasks and checkpoints locally. "
        "Each agent reads the shared memory store at session start. "
        "The agent memory system stores tasks and checkpoints locally. "
        "Token usage is tracked per agent (any string identifier). "
        "The context optimizer compresses large contexts to save tokens. "
        "Agents should save checkpoints before hitting context limits. "
        "The agent memory system stores tasks and checkpoints locally. "
        "The dashboard shows live usage stats and optimization hints. "
    ) * 5

    # Analyze
    report = analyze_context(sample, model="gpt-4o")
    assert report["token_count"] > 0
    print(f"✅ analyze_context → {report['token_count']} tokens, redundancy={report['redundancy_score']}")

    # Suggest
    suggestions = suggest_pruning(sample, budget=50)
    assert len(suggestions) > 0
    print(f"✅ suggest_pruning → {len(suggestions)} suggestions")

    # Compress to budget
    compressed = compress_to_budget(sample, budget=100)
    assert _estimate_tokens(compressed) <= 150  # allow 50 token tolerance
    print(f"✅ compress_to_budget → {_estimate_tokens(compressed)} tokens (budget=100)")

    # Auto-checkpoint (threshold low so it fires)
    from memory_engine import write_memory
    tid = write_memory(title="Optimizer Test Task", agent="test_runner")
    result = auto_checkpoint(
        task_id=tid,
        agent="test_runner",
        context_text=sample * 20,    # large enough to trigger
        threshold=100,
    )
    assert result["action"] == "checkpoint_saved"
    print(f"✅ auto_checkpoint → {result['checkpoint_id']} ({result['reduction_pct']}% reduction)")

    print("-" * 40)
    print("🎉 All tests passed!")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Context Optimizer & Token Budget Advisor")
    parser.add_argument("--analyze", action="store_true", help="Analyze context file or stdin")
    parser.add_argument("--compress", action="store_true", help="Compress context to budget")
    parser.add_argument("--suggest", action="store_true", help="Get pruning suggestions")
    parser.add_argument("--auto-checkpoint", action="store_true", help="Auto-save checkpoint if over threshold")
    parser.add_argument("--test", action="store_true", help="Run self-tests")
    parser.add_argument("--input", default=None, metavar="FILE", help="Input context file (uses stdin if not provided)")
    parser.add_argument("--output", default=None, metavar="FILE", help="Output file for compressed context")
    parser.add_argument("--budget", type=int, default=4000, help="Token budget")
    parser.add_argument("--model", default="default", help="Target model for limit check")
    parser.add_argument("--task-id", default=None)
    parser.add_argument("--agent", default="unknown")
    parser.add_argument("--threshold", type=int, default=CRITICAL_TOKEN_LIMIT)

    args = parser.parse_args()

    if args.test:
        _run_tests()
        return

    # Load text
    text = ""
    if args.input:
        p = Path(args.input)
        if not p.exists():
            print(f"ERROR: File not found: {args.input}", file=sys.stderr)
            sys.exit(1)
        text = p.read_text(encoding="utf-8")
    elif not sys.stdin.isatty():
        text = sys.stdin.read()

    if args.analyze:
        report = analyze_context(text, model=args.model)
        for k, v in report.items():
            print(f"  {k}: {v}")

    elif args.compress:
        if not text:
            print("ERROR: Provide --input file or pipe text via stdin", file=sys.stderr)
            sys.exit(1)
        result = compress_to_budget(text, budget=args.budget)
        if args.output:
            Path(args.output).write_text(result, encoding="utf-8")
            print(f"Compressed context written to {args.output}")
        else:
            print(result)

    elif args.suggest:
        if not text:
            print("ERROR: Provide --input file or pipe text via stdin", file=sys.stderr)
            sys.exit(1)
        for line in suggest_pruning(text, budget=args.budget):
            print(line)

    elif args.auto_checkpoint:
        if not args.task_id:
            print("ERROR: --task-id required for auto-checkpoint", file=sys.stderr)
            sys.exit(1)
        if not text:
            print("ERROR: Provide --input file or pipe text via stdin", file=sys.stderr)
            sys.exit(1)
        result = auto_checkpoint(
            task_id=args.task_id,
            agent=args.agent,
            context_text=text,
            threshold=args.threshold,
        )
        print(json.dumps(result, indent=2))

    else:
        parser.print_help()


if __name__ == "__main__":
    main()
