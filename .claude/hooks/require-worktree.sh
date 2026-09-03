#!/usr/bin/env bash
# Claude Code PreToolUse hook: refuse to edit or write in the main checkout.
#
# Two agents share this repository's main checkout. Work belongs in a linked
# worktree (EnterWorktree, or `git worktree add .claude/worktrees/<name>`),
# merged back through a pull request. This hook blocks file edits and
# write-shaped shell commands whose target sits in the main checkout.
#
# Exit 2 blocks the tool call and sends stderr back to the model. Any
# failure inside the hook allows the call (exit 0) so a bug here cannot lock
# a session. Set CLAUDE_ALLOW_MAIN_CHECKOUT=1 for a deliberate exception.
set -u
[ "${CLAUDE_ALLOW_MAIN_CHECKOUT:-}" = "1" ] && exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# The event JSON arrives on stdin; the heredoc below takes python's stdin,
# so hand the event over through the environment.
HOOK_EVENT="$(cat)"
export HOOK_EVENT

python3 - <<'PY'
import json, os, re, subprocess, sys

try:
    event = json.loads(os.environ.get("HOOK_EVENT", ""))
except Exception:
    sys.exit(0)

tool = event.get("tool_name", "")
tool_input = event.get("tool_input") or {}
cwd = event.get("cwd") or os.getcwd()

WRITE_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
# Shell commands that change files or git state. Redirections are checked
# after stripping the harmless "2>&1" and "> /dev/null" forms.
WRITE_SHELL = re.compile(
    r"\bgit\s+(add|commit|merge|rebase|reset|stash|mv|rm|apply|cherry-pick|am)\b"
    r"|\bgit\s+(checkout|switch)\b[^|;&]*\s-[bcB]\b"
    r"|\bsed\s+-i\b|\btee\b|\bmv\b|\brm\b|\bcp\b|\bmkdir\b|\btouch\b|\bln\b"
    r"|\b(pnpm|npm|yarn)\s+(add|remove|rm|install|i|up|update)\b"
    r"|\bpython3?\s+-\s*<<"
    r"|>"
)

if tool in WRITE_TOOLS:
    path = tool_input.get("file_path") or tool_input.get("notebook_path") or ""
    target = os.path.dirname(path) if os.path.isabs(path) else cwd
elif tool == "Bash":
    cmd = tool_input.get("command") or ""
    cleaned = re.sub(r"\d?>&\d|\d?>\s*/dev/null", "", cmd)
    if not WRITE_SHELL.search(cleaned):
        sys.exit(0)
    m = re.match(r"\s*cd\s+(\S+)\s*(?:&&|;)", cmd)
    target = os.path.expanduser(m.group(1).strip("'\"")) if m else cwd
else:
    sys.exit(0)


def git(*args):
    r = subprocess.run(
        ["git", "-C", target, *args], capture_output=True, text=True
    )
    return r.stdout.strip() if r.returncode == 0 else None


if not os.path.isdir(target):
    sys.exit(0)
git_dir = git("rev-parse", "--git-dir")
common = git("rev-parse", "--git-common-dir")
if git_dir is None or common is None:
    sys.exit(0)  # not a git repository: scratchpad, memory, /tmp
if os.path.realpath(os.path.join(target, git_dir)) != os.path.realpath(
    os.path.join(target, common)
):
    sys.exit(0)  # linked worktree: allowed

top = git("rev-parse", "--show-toplevel") or target
sys.stderr.write(
    f"Blocked: {tool} would change the main checkout at {top}.\n"
    "Work in a worktree and merge back through a pull request: call "
    "EnterWorktree, or run `git worktree add .claude/worktrees/<name> -b "
    "<branch>` and cd into it. Read-only commands still work here. For a "
    "deliberate exception set CLAUDE_ALLOW_MAIN_CHECKOUT=1 (see AGENTS.md, "
    '"Work in a worktree").\n'
)
sys.exit(2)
PY
