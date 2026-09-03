@AGENTS.md

Work only on the fork `dennisonbertram/fork-OpenInstinct`. Never target the upstream `Merit-Systems/OpenInstinct` with a PR, issue, or push. See "Repository is the fork, never upstream" in AGENTS.md.

Keep `docs/agent-loop.html` current: any change under `agent/` that adds,
removes, or renames a channel, hook, tool, skill, connection, subagent, or
the reply splitter must update the diagram in the same PR (see "Agent
orientation" in AGENTS.md).

Square evals run on demand only. Before opening a PR that touches agent
instructions, skills, the Square connection, the Linq reply splitter, or
`evals/square/`, run `pnpm eval:square` and put its `Results:` line in the
PR body (see "Square evals" in AGENTS.md).

Start every task in a worktree (EnterWorktree) and merge back through a pull
request; never edit or commit in the main checkout. A PreToolUse hook in
`.claude/hooks/require-worktree.sh` blocks edits there. Before every commit,
read `git diff --staged`: another agent may be editing the same files, so never
stage a file by name without reading the diff you are about to commit. See
"Work in a worktree" in AGENTS.md.
