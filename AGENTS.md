# OpenInstinct fork

This repository owns one Next.js app and an Eve agent under `agent/`.
The workspace manager is `/`; agent chat is `/chat`.
Read [docs/AGENT_GUIDE.md](docs/AGENT_GUIDE.md) for topology, ownership, storage,
and the change recipe relevant to your task. Follow links only as needed.

## Work and delivery

- Work only on `dennisonbertram/fork-OpenInstinct`. Upstream
  `Merit-Systems/OpenInstinct` is read-only: never target it with a push, PR, or
  issue. Pass `-R dennisonbertram/fork-OpenInstinct` to repository-targeting `gh`
  commands and verify the owner in returned URLs.
- The shared main checkout stays on `main`. Make changes in a linked worktree;
  read-only inspection can use the main checkout. Preserve other agents' work.
- Before committing, read `git diff --staged` and confirm it contains only your
  change. Commit, push, open a PR, wait for required checks, and merge when green
  unless the user says otherwise. Do not bypass checks or unresolved reviews.
  Then fast-forward the main checkout and remove your clean worktree.
- Keep discovery bounded: inspect the relevant docs, owning code, and tests;
  implement the smallest complete requested behavior. Expand investigation when
  evidence requires it. Summarize the outcome, verification, and any blockers.

## Development priorities and safety

This project is in active development, not production-ready. Prioritize working
user journeys, correctness, and fast feedback. Do not add speculative production
privacy, retention, or compliance systems unless requested or needed for current
work. Preserve authentication, tenant isolation, approval enforcement, and secret
boundaries; never print or commit credentials or log vault plaintext.

Isolated development/eval traces may capture synthetic or designated test data;
never feed them real-user, production, credential, or vault content, or broaden
capture during unrelated work. Metadata-only production traces, approved
telemetry destinations, retention/access policies, deletion behavior, and
privacy canaries remain production-promotion gates. Classify hardening gaps as
production-readiness work unless they expose protected data, weaken an existing
boundary, or block the requested development workflow.

## Code ownership

- Keep browser execution in `agent/subagents/browser-agent/tools`, with each
  tool's schema and implementation together. Share Kernel through
  `src/lib/kernel.ts`; do not add a root browser connection or Kernel extension.
  Worker `lib/` holds genuinely shared worker code only.
- Colocate behavior with its owner: agent logic in `agent/`, data access in
  `db/services`, page/section behavior with its route. Reserve `src/lib` for real
  cross-feature infrastructure and contracts; do not add a generic `src/modules`.
- Prefer cohesive call-site code over one-use abstractions. Do not add production
  factories, dependency bags, setters, or reset hooks solely for tests; mock at
  the owning/imported boundary.
- Use lower-case, domain-specific file and folder names. Group related files in
  a domain folder; avoid catch-all `manager`, `store`, `helpers`, or `utils` files.
- Reuse owning types or infer from schemas, models, SDKs, and function results.
  Add named types for real shared/public concepts, not parallel representations.
- Validate runtime environment variables in `src/env.ts`; worker browser tools
  require `KERNEL_API_KEY`. Keep root `load_skill` and `connection_search` enabled
  for Square.

## Read the relevant contract

- **Eve changes:** start at the installed `eve/docs/README.md` and read the routed
  page before authoring runtime features. Resolve package links directly; do not
  recursively scan `node_modules`. If package docs are absent, use
  https://eve.dev/docs. For content-only instruction edits, edit the existing
  authored content under `agent/instructions/`; preserve the selected model
  unless asked to change it. Framework docs are unnecessary for prose-only edits.
- **Integrations and deployment:** prefer existing registry integrations, native
  implementations first. Use Eve's non-interactive installation, linking, and
  deployment flows; follow the installed integration/deployment docs and
  [the Vercel runbook](docs/operations/VERCEL.md). Never pass secrets as `--answer`.
- **Product UI:** read [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md). Use
  `src/components/ui` and semantic `type-*` typography. Preserve `components.json`
  and local primitive extensions; add primitives with the official shadcn CLI.
  Update the design-system doc when tokens, type roles, variants, or patterns change.
- **Integrations and optional capabilities:** choose native tools, OpenAPI, or
  MCP for the actual service. Package reusable optional capabilities as Eve
  extensions under `agent/extensions/`; an MCP server is not mandatory. Read
  [PLUGINS.md](docs/PLUGINS.md) and apply the relevant checks in
  [PLUGIN_TESTING.md](docs/PLUGIN_TESTING.md). Customer-supplied servers remain
  future work. Do not build a core plugin loader, registry, or tool catalog.
- **Configurable agents, managed lines, catalogs, public APIs, webhooks, or shared
  tenants:** read [PRODUCT_DIRECTION.md](docs/PRODUCT_DIRECTION.md) and
  [MULTITENANCY.md](docs/MULTITENANCY.md) before schema/runtime changes. Preserve
  their proposed/implemented distinction in [docs/README.md](docs/README.md).
- **Agent flow:** update [agent-loop.html](docs/agent-loop.html) when behavior,
  ownership, file names, or hook events represented there change; inspect the
  edited diagram in a browser. [Conversation feedback](docs/agent-conversation-feedback.md)
  is planning evidence, not runtime instructions; images go in `docs/agent-feedback-assets/`.
- **Upstream syncs:** take selected changes on a topic branch; record take/adapt/skip
  decisions in the PR. A whole-tree merge needs explicit complete-diff review.
  Renumber migrations after the fork's last migration. Every sync runs
  `pnpm eval:contract`; syncs touching `agent/` also run Square evals.

## Verification

During development, run the smallest useful regression check for changed behavior.
Before handoff, run `pnpm check`, `pnpm build`, and `git diff --check`.
Follow [the guide's verification gates](docs/AGENT_GUIDE.md#verification-gates)
for test placement, browser QA, startup, and deployment acceptance. Report failed
or unavailable checks accurately; local checks do not prove production readiness.

`./init.sh` is the canonical complete local startup. Changes to prerequisites,
environment, credentials, ports, health, scripts, startup order, signals, or
teardown must follow the guide's startup recipe and keep all owning docs/tests
synchronized. Do not introduce an undocumented second startup path.

## Square evals: on demand

Before opening a PR, run `pnpm eval:square --max-cost-usd <USD> --estimated-cost-usd <USD>` and include its `Results:` line when
changing agent instructions (`agent/instructions.md` or `agent/instructions/`),
`agent/agent.ts`, `agent/skills/`, `agent/connections/square.ts`, `agent/lib/square/`,
`agent/lib/linq/reply.ts`, `agent/channels/linq.ts`, `evals/square/`,
`scripts/eval-square.ts`, or model/gateway/reasoning settings. Fix red runs before
merging. These evals do not run automatically in PR CI; operator steps are in
[the runbook](docs/operations/VERCEL.md#run-the-square-evals).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
