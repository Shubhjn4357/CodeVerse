"""
agent_registry.py - Shared definitions for known agent ids and aliases.

The memory layer accepts any agent string, but these names are surfaced in
bootstrap files, completions, and IDE prompts. Keeping them in one place avoids
drift across scripts.
"""

from __future__ import annotations

import re

CORE_AGENT_NAMES = [
    "antigravity",
    "gemini",
    "claude",
    "codex",
    "cursor",
    "copilot",
    "jetbrains-ai",
    "zed-ai",
    "sublime",
    "terminal",
    "warp",
    "claude-code",
    "vscode-copilot",
    "openai",
    "my_script",
    "my_custom_agent",
]

TINY_AGENT_NAMES = [
    "claw",
    "tiny-claw",
    "pico-claw",
    "micro-claw",
    "nano-claw",
    "rtiny-claw",
]

KNOWN_AGENT_NAMES = CORE_AGENT_NAMES + TINY_AGENT_NAMES
KNOWN_AGENT_SET = {name.lower() for name in KNOWN_AGENT_NAMES}
BOOTSTRAP_AGENT_NAMES = [
    "codex",
    "copilot",
    "cursor",
    "claude",
    "antigravity",
    *TINY_AGENT_NAMES,
]

AGENT_ALIASES = {
    "github-copilot": "copilot",
    "vs-code-copilot": "vscode-copilot",
    "vscode-copilot": "vscode-copilot",
    "claudecode": "claude-code",
    "claude-code": "claude-code",
    "claude code": "claude-code",
    "tiny-claude": "tiny-claw",
    "tiny claude": "tiny-claw",
    "tinyclaw": "tiny-claw",
    "tiny claw": "tiny-claw",
    "pico-claude": "pico-claw",
    "pico claude": "pico-claw",
    "picoclaw": "pico-claw",
    "pico claw": "pico-claw",
    "micro-claude": "micro-claw",
    "micro claude": "micro-claw",
    "microclaw": "micro-claw",
    "micro claw": "micro-claw",
    "nano-claude": "nano-claw",
    "nano claude": "nano-claw",
    "nanoclaw": "nano-claw",
    "nano claw": "nano-claw",
    "rtiny-claude": "rtiny-claw",
    "rtiny claude": "rtiny-claw",
    "rtinyclaw": "rtiny-claw",
    "rtiny claw": "rtiny-claw",
}


def _lookup_key(value: str) -> str:
    key = value.strip().lower()
    key = re.sub(r"[_\s]+", "-", key)
    key = re.sub(r"-+", "-", key).strip("-")
    return key


def normalize_agent_name(value: str | None) -> str:
    if value is None:
        return ""
    raw = value.strip()
    if not raw:
        return ""

    key = _lookup_key(raw)
    if key in AGENT_ALIASES:
        return AGENT_ALIASES[key]
    if key in KNOWN_AGENT_SET:
        return key
    return raw


def merge_agent_names(*groups: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for group in groups:
        for name in group:
            canonical = normalize_agent_name(name)
            lowered = canonical.lower()
            if not canonical or lowered in seen:
                continue
            merged.append(canonical)
            seen.add(lowered)
    return merged


def get_known_agents() -> list[str]:
    return merge_agent_names(CORE_AGENT_NAMES, TINY_AGENT_NAMES)


def get_bootstrap_agents() -> list[str]:
    return merge_agent_names(BOOTSTRAP_AGENT_NAMES)
