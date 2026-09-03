# eve Agent App

This project uses the eve framework: an agent is a directory of files under `agent/`, and eve compiles and runs it.

For a content-only change to the root agent's identity, purpose, tone, or response guidelines, edit its existing authored instructions. Fresh projects use `agent/instructions.md`; a project may instead use `agent/instructions.ts` or files under `agent/instructions/`. You do not need to read the framework docs for a content-only instructions change. A fresh project already has its selected model in `agent/agent.ts`; preserve that file unless the user asks to change the model.

## Read the docs before writing code

```sh
ls node_modules/eve/docs
```

Start with `docs/README.md`: it maps each task to the page that covers it. Read that page before authoring tools, connections, channels, skills, subagents, schedules, or deployment. In a workspace or local package install, resolve the installed `eve` package location first. If the package docs are missing, use https://eve.dev/docs.

Use a bounded authoring loop:

1. Read the relevant page and inspect only files you will modify or need to imitate.
2. Stop discovery once the file location, imports, and definition shape are clear. Implement the smallest complete behavior the user requested.
3. Run one narrow verification. Expand investigation only when it fails or the request needs project-specific details.

Follow links or inspect public types only when the routed page leaves the task unanswered. Do not recursively glob `node_modules`, enumerate the entire docs tree, or read unrelated scaffold files when the direct path is known. Package-manager links can hide files from recursive glob tools even though direct reads work.

## Prefer an existing integration

When a task names an external product or service, search the registry before implementing its integration. For a generic capability, author a tool instead.

```sh
eve registry search <query> --json
eve registry view <item>
```

Prefer items whose `implementation` is `native`; use Chat SDK adapters when no native channel fits. `registry view` links the item's documentation.

Install without driving interactive prompts:

```sh
eve add <item> --non-interactive
```

Exit code 0 means setup completed, 1 failed, and 2 needs an answer or a prerequisite. On exit 2, run the `next.command` from the final NDJSON event. For a non-secret question, replace its `<JSON value>` answer placeholder with the answer you collected; string values need JSON quotes. Never pass a secret in `--answer`. See `docs/install-integrations.mdx` for setup prerequisites.

## Use eve for Vercel operations

Use eve to link and deploy Vercel projects:

```sh
eve link --non-interactive --project <name-or-id> [--team <team-id-or-slug>]
eve deploy --non-interactive --yes [--project <name-or-id>]
```

A setup may report `eve link` as a prerequisite; run it, then retry the continuation. When a completed setup event has `deploymentRequired: true`, run the `next` command it reports.

## Validate the change

Run the validation the task requests. When it does not establish the behavior you changed, run the narrowest relevant check.

## Testing tiers

- Colocate upstream-owned unit tests with their source; keep fork-only pure unit suites in `tests/unit/`, except `agent/` and `db/` tests follow their established local layout.
- Keep fork-owned PGlite, migration, service, and database suites in `tests/integration/`.
- Put browser journeys in `tests/e2e/` and run them with `pnpm test:e2e`. Playwright
  boots the app through `scripts/dev.ts`, so it owns Compose, migrations, and
  teardown; it authenticates once through the local phone-auth bypass before the
  authenticated specs run.
- Run `pnpm test:unit`, `pnpm test:integration`, or `pnpm test:coverage`; root Vitest runs both.
- `REAL_PG` unset auto-detects Compose, `0` skips real Postgres, and `1` requires it.

Playwright e2e boots with `WORKSPACE_SCOPE_ENFORCEMENT=enforce`, so its paths
exercise the production tenancy posture. Set `CRON_SECRET` in Vercel to enable
the five-minute webhook drain cron; without it, the route responds with 404.
The admin webhook drain button remains the supported manual drain path.

## Square evals: on demand, not per pull request

The Square eval gym (`pnpm eval:square`, 12 cases, about 1.5 USD and one
minute per run) does not run in CI automatically. Run it before you open a
pull request, and paste its `Results:` line in the PR body, when the change
touches any of:

- `agent/instructions.md`, `agent/agent.ts`, or anything under `agent/skills/`
- `agent/connections/square.ts` or `agent/lib/square/`
- `agent/lib/linq/reply.ts` (the bubble splitter) or `agent/channels/linq.ts`
- `evals/square/` or `scripts/eval-square.ts`
- the model, gateway, or reasoning settings

Run it locally with `pnpm eval:square`, or in GitHub Actions with
`gh workflow run square-evals.yml -R dennisonbertram/fork-OpenInstinct --ref <branch>`
(needs the `AI_GATEWAY_API_KEY` repo secret). A red run is a real defect in
the agent or the case; fix it before merging. The operator steps are in
`docs/operations/VERCEL.md` under "Run the Square evals".

## Agent conversation feedback

`docs/agent-conversation-feedback.md` is a dated log of user feedback on
agent conversations. It is review material for planning; it is not a runtime
instruction file. Save example screenshots under `docs/agent-feedback-assets/`.

## Work in a worktree, merge back through a pull request

More than one agent works in this repository at the same time. The main
checkout (`/Users/dennison/develop/fork-OpenInstinct` on this machine) is
shared and stays on `main`; nobody edits or commits there. Start every task in
a linked worktree:

```sh
git worktree add .claude/worktrees/<name> -b <branch>   # Claude Code: EnterWorktree
cd .claude/worktrees/<name>
```

Commit there, push, open the pull request, and merge it. Then, in the main
checkout, run `git pull` and remove the worktree with `git worktree remove`.
Read-only commands (`git status`, `git log`, `cat`, `grep`, the test runners)
are fine in the main checkout.

Claude Code enforces this with the PreToolUse hook in
`.claude/hooks/require-worktree.sh` (wired in `.claude/settings.json`): it
blocks file edits and write-shaped shell commands whose target is the main
checkout, and allows them in any linked worktree. For a deliberate exception
set `CLAUDE_ALLOW_MAIN_CHECKOUT=1`. Other agents follow the same rule by
convention. Before every commit, read `git diff --staged` and confirm it holds
only your change.

## Repository is the fork, never upstream

All work happens on `dennisonbertram/fork-OpenInstinct`. Never open pull
requests, issues, or pushes against the upstream `Merit-Systems/OpenInstinct`.
Pass `-R dennisonbertram/fork-OpenInstinct` to every `gh` command that targets
a repository, and check the owner in any URL `gh` prints before reporting it.
Upstream is a read-only sync source only (see the sync policy in `docs/`).

## Repository contract

- The repository root owns the single Next.js application, Eve agent, and shared UI contract.
- The workspace manager lives on `/` and the agent chat on `/chat`; browser execution belongs only to the declared worker's flat tool surface under `agent/subagents/worker/tools`.
- Keep each worker browser tool's schema and implementation together. Share the Kernel SDK client through `src/lib/kernel.ts`; do not add a Kernel extension or root browser connection.
- `agent/subagents/worker/lib` is for code genuinely shared by worker tools. Group a shared worker domain in a lower-case folder, such as `trace/domains.ts` or `autofill/provider.ts`; do not use it as a holding area for a tool's one-off logic.
- Validate runtime environment variables through `src/env.ts`. `KERNEL_API_KEY` is required by the worker browser tools.
- Run `pnpm check` and `pnpm build` before handing off changes.

## Code organization

- Treat `src/lib` as a small shared infrastructure and contract boundary, not a default destination for application code. A file belongs there only when it has real cross-feature ownership; put database access in `db/services`, agent behavior under `agent`, and route or section behavior with its route.
- Do not add a generic `src/modules` layer. Give code a concrete owner and colocate it there. A route section owns its section components, forms, and local parsing; split it only when the files have distinct responsibilities.
- Prefer one cohesive call-site file for code used once. Do not add production factories, dependency containers, server wrappers, or files solely to make a unit test easier to mock.
- Mock imported modules at their owning or external boundary in tests. Do not export mutable dependency bags, dependency setters, reset hooks, or other test-only seams from production modules; keep production exports limited to application behavior and real domain contracts.
- Use lower-case file and folder names. When several files share a domain prefix, make that prefix a folder and name files for their role, such as `trace/domains.ts` rather than `trace-domains.ts`. Do not introduce camel-case filenames.
- Avoid catch-all names such as `manager`, `store`, `helpers`, or `utils` for feature ownership. Reuse an existing narrowly named boundary or place the code at the concrete owner instead.

## Design system

Before planning or changing product UI:

- Build from the primitives in `src/components/ui` and the semantic `type-*`
  typography utilities defined in `src/app/styles/brand/typography.css`.
- Preserve the current `components.json` primitive base and local extensions;
  add new primitives with the official shadcn CLI.
- Read [`docs/DESIGN_SYSTEM.md`](docs/DESIGN_SYSTEM.md) for the token values,
  type roles, primitive variants, and page patterns; update it in the same
  pull request when any of those change.

## Plugins

A new feature that can live outside core ships as a plugin: an eve extension
package plus an MCP server, mounted by one file under `agent/extensions/`.
Read [`docs/PLUGINS.md`](docs/PLUGINS.md) before you design one, and run the
ladder in [`docs/PLUGIN_TESTING.md`](docs/PLUGIN_TESTING.md) before you call
it done. Do not add a plugin loader, registry, or tool catalog to core; eve
already provides them.

## Type ownership

- Keep each TypeScript concept anchored to one source of truth.
- Before adding a `type` or `interface`, search for an existing owning export,
  schema-derived type, model inference, or function/value type that can be
  reused or derived.
- Prefer inference for implementation details and contextual callbacks.
- Add a named type only for a real domain concept, public boundary, validation
  source, or meaningfully reused composition.
- Do not mirror schemas, database rows, router inputs or outputs, SDK payloads,
  library exports, or function results with parallel interfaces.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Agent orientation

Read [`docs/AGENT_GUIDE.md`](docs/AGENT_GUIDE.md) for the repository topology,
route map, ownership boundaries, storage rules, change recipes, and verification
gates. The architecture review and operational contracts are linked from that
guide.

[`docs/agent-loop.html`](docs/agent-loop.html) is the diagram of how one user
message becomes one reply (channels, scope, session hooks, turn steps, tool
branches, bubble delivery). It names files and hook events, so it goes stale.
When a change touches `agent/channels/`, `agent/hooks/`, `agent/tools/`,
`agent/skills/`, `agent/connections/`, `agent/subagents/`, `agent/agent.ts`,
or `agent/lib/linq/reply.ts`, update the diagram in the same pull request.
Open it in a browser to check the SVG after editing.

For product work involving configurable agents, managed phone lines, MCP/tool
catalogs, public APIs, webhooks, or shared tenants, read
[`docs/PRODUCT_DIRECTION.md`](docs/PRODUCT_DIRECTION.md) and
[`docs/MULTITENANCY.md`](docs/MULTITENANCY.md) before changing schema or runtime
behavior. They are proposed contracts; preserve the implemented/proposed
distinction in [`docs/README.md`](docs/README.md).
