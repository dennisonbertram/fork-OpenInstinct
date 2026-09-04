# End-to-end tests

`pnpm test:e2e` starts `scripts/dev.ts` through Playwright's `webServer`.
That supervisor starts the isolated Compose Postgres project, runs migrations,
starts Next on `localhost:3000`, and tears the database down when Playwright
stops it. `localhost` avoids Next 16 dev-origin protection blocking `_next`
chunks for `127.0.0.1`. The config supplies synthetic `KERNEL_API_KEY`, Better Auth secrets,
and a fresh valid base64 encryption key; no external Kernel, Blob, or Linq
service is exercised.

The supervisor receives `EVAL_CONTRACT_FIXTURE=1`, which the application rejects
outside local development. Chat tests use this scripted model through the real
authenticated Eve routes: they assert delivery, persisted history after reload,
follow-up delivery without duplicate replies, and actionable turn-failure recovery.
They do not intercept the chat API or call a paid model. Playwright never reuses
an existing server, so an unrelated app cannot silently replace this fixture
environment. Choose an unused `PLAYWRIGHT_PORT` when another app is running.

The fixture owns turn-scoped tool-call IDs. Eve's mock request includes the whole
conversation's tool results; a completed delivery from an earlier turn must not
terminate a new turn. The single-turn fixture tests and real browser follow-up
journey protect both sides of that boundary.

The `setup` project signs in once at `/sign-in` using the local phone bypass
and saves the cookie state to `playwright/.auth/user.json`. The Chromium project
depends on that setup project and loads the saved state. Specs that cover
anonymous behavior explicitly create a browser context with empty storage state.

Run the whole suite with `pnpm test:e2e`, or a single spec with:

```sh
pnpm playwright test tests/e2e/api.spec.ts
```

If another app already owns port 3000, choose an isolated port without
reusing that server:

```sh
PLAYWRIGHT_PORT=3100 pnpm test:e2e
```

Failures retain a trace in `test-results/`; open it with
`pnpm playwright show-trace test-results/<test-result>/trace.zip`. The HTML
report is written to `playwright-report/` and can be viewed with
`pnpm playwright show-report`.

CI retains the HTML report through an always-run artifact step, including on
failure or cancellation when a report was produced. The stable `E2E` check is
separate from `Checks`, `Build`, `Real Postgres`, and `Contract evals`; a passing
build or model-free contract suite is not a substitute for these browser paths.
New specs are picked up by the existing `pnpm test:e2e` entry point.
