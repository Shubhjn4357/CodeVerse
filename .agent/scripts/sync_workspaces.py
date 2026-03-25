"""
sync_workspaces.py - Provision shared agent-memory integrations across workspaces.

This script writes or updates the editor/chat bootstrap files that agents
actually read:
  - AGENTS.md
  - CLAUDE.md
  - .cursorrules
  - .github/copilot-instructions.md
  - .gemini/GEMINI.md or .agent/rules/GEMINI.md
  - .vscode/tasks.json
  - .zed/settings.json

It targets the workspace root that contains this central .Agent directory and
any descendant folders that look like projects/workspaces.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from agent_registry import get_bootstrap_agents


THIS_DIR = Path(__file__).resolve().parent
AGENT_DIR = THIS_DIR.parent
DEFAULT_ROOT = AGENT_DIR.parent

BEGIN_MARKER = "<!-- BEGIN: AgentMemoryBootstrap -->"
END_MARKER = "<!-- END: AgentMemoryBootstrap -->"

EDITOR_MARKERS = (
    ".git",
    ".vscode",
    ".idea",
    ".zed",
    ".agent",
    ".gemini",
    "AGENTS.md",
    "CLAUDE.md",
    ".cursorrules",
)

PROJECT_MARKERS = (
    ".git",
    "pnpm-workspace.yaml",
    "package.json",
    "turbo.json",
    "pyproject.toml",
    "requirements.txt",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "composer.json",
    "Gemfile",
    "mix.exs",
    "CMakeLists.txt",
    "Makefile",
    "manage.py",
)

IGNORE_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".Agent",
    ".agent",
    ".venv",
    "venv",
    "node_modules",
    "dist",
    "build",
    "out",
    "coverage",
    ".next",
    ".nuxt",
    ".turbo",
    ".cache",
    "__pycache__",
    "vendor",
    "target",
    "bin",
    "obj",
}
IGNORE_DIRS_LOWER = {entry.lower() for entry in IGNORE_DIRS}

AGENT_CHOICES = get_bootstrap_agents()


def to_posix(path: Path) -> str:
    return path.as_posix()


def rel_agent_dir(workspace: Path) -> str:
    return to_posix(Path(os.path.relpath(AGENT_DIR, workspace)))


def has_solution_file(path: Path) -> bool:
    try:
        return any(path.glob("*.sln"))
    except OSError:
        return False


def should_ignore_dir(name: str) -> bool:
    lowered = name.lower()
    return (
        lowered in IGNORE_DIRS_LOWER
        or lowered.startswith("venv")
        or lowered.startswith(".venv")
        or lowered in {"site-packages", "dist-packages", "lib64", "deriveddata", "pods"}
    )


def looks_like_workspace(path: Path, depth: int) -> bool:
    if not path.is_dir():
        return False
    if path == AGENT_DIR:
        return False
    for marker in EDITOR_MARKERS:
        if (path / marker).exists():
            return True
    if depth <= 2:
        for marker in PROJECT_MARKERS:
            if (path / marker).exists():
                return True
        if has_solution_file(path):
            return True
    return False


def discover_workspaces(root: Path) -> list[Path]:
    found: set[Path] = set()
    if root.exists():
        found.add(root.resolve())

    for current, dirs, _files in os.walk(root):
        current_path = Path(current).resolve()

        dirs[:] = [
            name
            for name in dirs
            if not should_ignore_dir(name) and not name.startswith(".git")
        ]

        if current_path == AGENT_DIR:
            dirs[:] = []
            continue

        depth = len(current_path.relative_to(root).parts)
        if current_path != root and looks_like_workspace(current_path, depth):
            found.add(current_path)

    return sorted(found, key=lambda path: (len(path.parts), str(path).lower()))


def find_frontmatter_end(text: str) -> int | None:
    if not text.startswith("---\n"):
        return None
    cursor = len("---\n")
    end = text.find("\n---\n", cursor)
    if end == -1:
        return None
    return end + len("\n---\n")


def upsert_managed_block(path: Path, block: str, dry_run: bool) -> str:
    existing = path.read_text(encoding="utf-8") if path.exists() else ""

    if BEGIN_MARKER in existing and END_MARKER in existing:
        start = existing.index(BEGIN_MARKER)
        end = existing.index(END_MARKER) + len(END_MARKER)
        updated = existing[:start].rstrip() + "\n\n" + block.strip() + existing[end:]
        updated = updated.strip() + "\n"
        changed = updated != existing
    else:
        insert_at = find_frontmatter_end(existing)
        if insert_at is None:
            updated = (block.strip() + "\n\n" + existing.lstrip()).strip() + "\n"
        else:
            prefix = existing[:insert_at].rstrip()
            suffix = existing[insert_at:].lstrip("\r\n")
            updated = prefix + "\n\n" + block.strip() + "\n\n" + suffix
            updated = updated.strip() + "\n"
        changed = updated != existing

    if changed and not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(updated, encoding="utf-8")

    if changed:
        return "updated" if existing else "created"
    return "unchanged"


def read_json(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def write_json(path: Path, data: dict, dry_run: bool) -> str:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    rendered = json.dumps(data, indent=2) + "\n"
    if rendered == current:
        return "unchanged"
    if not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(rendered, encoding="utf-8")
    return "updated" if current else "created"


def make_block(agent_name: str, command_path: str, doc_path: str, title: str) -> str:
    return f"""{BEGIN_MARKER}
## {title}

When this workspace is loaded, initialize the shared memory context before
continuing:

1. Run `python {command_path} ctx --agent {agent_name} --max-tokens 4000`.
2. Load the returned `<MEMORY_CONTEXT>` into working context before proceeding.
3. If there is an active in-progress task, continue it unless the user redirects.
4. Save checkpoints with `python {command_path} cp "what was done. next step" --agent {agent_name}`.
5. Finish with `python {command_path} done "summary"` and `python {command_path} log <input> <output> --agent {agent_name} --model <model>` when token counts are available.

Reference: `{doc_path}`
{END_MARKER}"""


def sync_text_files(workspace: Path, dry_run: bool) -> list[tuple[str, str]]:
    rel_dir = rel_agent_dir(workspace)
    mem_path = f"{rel_dir}/scripts/mem.py"
    doc_path = f"{rel_dir}/AGENT_MEMORY.md"

    results: list[tuple[str, str]] = []
    targets = [
        (workspace / "AGENTS.md", make_block("codex", mem_path, doc_path, "Codex Memory Bootstrap")),
        (workspace / "CLAUDE.md", make_block("claude", mem_path, doc_path, "Claude Memory Bootstrap")),
        (workspace / ".cursorrules", make_block("cursor", mem_path, doc_path, "Cursor Memory Bootstrap")),
        (
            workspace / ".github" / "copilot-instructions.md",
            make_block("copilot", mem_path, doc_path, "Copilot Memory Bootstrap"),
        ),
    ]

    gemini_path = workspace / ".agent" / "rules" / "GEMINI.md"
    if gemini_path.exists():
        targets.append(
            (gemini_path, make_block("antigravity", mem_path, doc_path, "Antigravity Memory Bootstrap"))
        )
    else:
        targets.append(
            (
                workspace / ".gemini" / "GEMINI.md",
                make_block("antigravity", mem_path, doc_path, "Antigravity Memory Bootstrap"),
            )
        )

    for path, block in targets:
        status = upsert_managed_block(path, block, dry_run=dry_run)
        results.append((str(path), status))

    return results


def build_vscode_tasks(mem_path: str) -> tuple[list[dict], list[dict]]:
    tasks = [
        {
            "label": "Mem: Init Session",
            "type": "shell",
            "command": "python",
            "args": [mem_path, "init"],
            "presentation": {"reveal": "silent", "panel": "shared", "clear": True},
            "runOptions": {"runOn": "folderOpen", "instanceLimit": 1},
        },
        {
            "label": "Mem: Load Context",
            "type": "shell",
            "command": "python",
            "args": [mem_path, "ctx", "--agent", "${input:memAgent}"],
            "presentation": {"reveal": "always", "panel": "shared", "clear": True},
        },
        {
            "label": "Mem: Status",
            "type": "shell",
            "command": "python",
            "args": [mem_path, "status"],
            "presentation": {"reveal": "always", "panel": "shared", "clear": True},
        },
    ]
    inputs = [
        {
            "id": "memAgent",
            "type": "pickString",
            "description": "Which agent context should be loaded?",
            "options": AGENT_CHOICES,
            "default": "codex",
        }
    ]
    return tasks, inputs


def sync_vscode(workspace: Path, dry_run: bool) -> tuple[str, str]:
    rel_dir = rel_agent_dir(workspace)
    mem_path = f"{rel_dir}/scripts/mem.py"
    target = workspace / ".vscode" / "tasks.json"

    data = read_json(target)
    data["version"] = "2.0.0"

    existing_tasks = data.get("tasks", [])
    existing_inputs = data.get("inputs", [])
    if not isinstance(existing_tasks, list):
        existing_tasks = []
    if not isinstance(existing_inputs, list):
        existing_inputs = []

    task_map = {task.get("label"): task for task in existing_tasks if isinstance(task, dict)}
    input_map = {entry.get("id"): entry for entry in existing_inputs if isinstance(entry, dict)}

    desired_tasks, desired_inputs = build_vscode_tasks(mem_path)
    for task in desired_tasks:
        task_map[task["label"]] = task
    for entry in desired_inputs:
        input_map[entry["id"]] = entry

    data["tasks"] = list(task_map.values())
    data["inputs"] = list(input_map.values())
    status = write_json(target, data, dry_run=dry_run)
    return (str(target), status)


def sync_zed(workspace: Path, dry_run: bool) -> tuple[str, str]:
    rel_dir = rel_agent_dir(workspace)
    mem_path = f"{rel_dir}/scripts/mem.py"
    target = workspace / ".zed" / "settings.json"

    data = read_json(target)
    tasks = data.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = []

    task_map = {task.get("label"): task for task in tasks if isinstance(task, dict)}
    task_map["Mem: Status"] = {"label": "Mem: Status", "command": f"python {mem_path} status"}
    task_map["Mem: Load Context"] = {
        "label": "Mem: Load Context",
        "command": f"python {mem_path} ctx --agent codex",
    }
    task_map["Mem: Init Session"] = {
        "label": "Mem: Init Session",
        "command": f"python {mem_path} init",
    }

    data["tasks"] = list(task_map.values())
    status = write_json(target, data, dry_run=dry_run)
    return (str(target), status)


def sync_workspace(workspace: Path, dry_run: bool) -> list[tuple[str, str]]:
    results = sync_text_files(workspace, dry_run=dry_run)
    results.append(sync_vscode(workspace, dry_run=dry_run))
    results.append(sync_zed(workspace, dry_run=dry_run))
    return results


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync shared .Agent integrations into child workspaces")
    parser.add_argument("--root", default=str(DEFAULT_ROOT), help="Workspace root that contains the central .Agent folder")
    parser.add_argument("--workspace", action="append", default=[], help="Explicit workspace to sync. Can be passed multiple times.")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing files.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        print(f"ERROR: root does not exist: {root}", file=sys.stderr)
        return 1

    workspaces = [Path(item).resolve() for item in args.workspace] if args.workspace else discover_workspaces(root)
    if not workspaces:
        print("No workspaces found.")
        return 0

    print(f"Central .Agent: {AGENT_DIR}")
    print(f"Root          : {root}")
    print(f"Workspaces    : {len(workspaces)}")

    for workspace in workspaces:
        print(f"\n[{workspace}]")
        for path, status in sync_workspace(workspace, dry_run=args.dry_run):
            print(f"  {status:9} {path}")

    if args.dry_run:
        print("\nDry run only. No files were written.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
