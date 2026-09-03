#!/usr/bin/env bash
# Self-check for require-worktree.sh with synthetic PreToolUse events.
# Run it from inside a linked worktree: bash .claude/hooks/require-worktree.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
H="$HERE/require-worktree.sh"
M="$(cd "$(git -C "$HERE" rev-parse --git-common-dir)/.." && pwd)"
W="$(git -C "$HERE" rev-parse --show-toplevel)"
if [ "$W" = "$M" ]; then
  echo "run this from a linked worktree, not the main checkout ($M)"
  exit 1
fi
fail=0
t() { # name expected-exit event-json
  printf '%s' "$3" | "$H" 2>/dev/null
  code=$?
  if [ "$code" = "$2" ]; then echo "ok   $1"; else echo "FAIL $1 (exit $code, want $2)"; fail=1; fi
}
ev() { # tool cwd file-or-command
  case "$1" in
    Bash) printf '{"tool_name":"Bash","cwd":"%s","tool_input":{"command":"%s"}}' "$2" "$3" ;;
    *)    printf '{"tool_name":"%s","cwd":"%s","tool_input":{"file_path":"%s"}}' "$1" "$2" "$3" ;;
  esac
}
t edit-main            2 "$(ev Edit "$M" "$M/AGENTS.md")"
t edit-worktree        0 "$(ev Edit "$W" "$W/AGENTS.md")"
t write-outside-repo   0 "$(ev Write "$M" "/tmp/require-worktree-test/x.html")"
t bash-read-main       0 "$(ev Bash "$M" "git status --short 2>&1 | head; pnpm check > /dev/null")"
t bash-commit-main     2 "$(ev Bash "$M" "git add -A && git commit -m x")"
t bash-redirect-main   2 "$(ev Bash "$M" "echo hi > notes.txt")"
t bash-heredoc-main    2 "$(ev Bash "$M" "python3 - <<EOF")"
t bash-branch-main     2 "$(ev Bash "$M" "git checkout -q -b feat/x")"
t bash-pull-main       0 "$(ev Bash "$M" "git pull && git worktree remove foo")"
t bash-commit-worktree 0 "$(ev Bash "$W" "git commit -m x")"
t bash-cd-worktree     0 "$(ev Bash "$M" "cd $W && git commit -m x")"
t bash-cd-main         2 "$(ev Bash "$W" "cd $M && git commit -m x")"
t bad-json             0 "not json"
CLAUDE_ALLOW_MAIN_CHECKOUT=1 t escape-hatch 0 "$(ev Edit "$M" "$M/AGENTS.md")"
exit $fail
