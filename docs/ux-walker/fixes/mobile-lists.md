# Two mobile list fixes

Implemented in the isolated UX audit worktree only, after the coordinator and baseline walker inspected the failing 390×844 screenshots. No commit or app startup performed by this agent.

- `src/app/(authenticated)/chat/history/page.tsx`: constrain the history grid/card, place title beside the icon and metadata below it on mobile, retain the horizontal desktop layout. Navigation, title text, usage calculation and badge rules unchanged.
- `src/app/(authenticated)/tasks/(overview)/_components/trace-history.tsx`: constrain the grid; give populated tables a 60rem minimum width inside the existing Table horizontal-scroll container. Empty/loading guidance now wraps in a separate paragraph without meaningless empty table columns. Refresh, query state and row navigation unchanged.
- `docs/DESIGN_SYSTEM.md`: document these route-specific responsive patterns.
- Existing Playwright chat journey now checks that its generated conversation card fits the mobile history container; shell spec checks that empty Tasks guidance does not overflow at 390px.

Checks completed: focused Oxlint passed for both changed sources and both tests; Oxfmt applied to changed TSX/tests; Playwright `--list` successfully discovers the affected tests; `git diff --check` passed. Playwright browser execution, full `pnpm check`, build and rendered verification are pending coordinator execution. No passing runtime claim yet. The coordinator owns the browser, so no competing browser/app process was started.

Original evidence and measurements: `../preflight/baseline.md`, `../preflight/screenshots/all-chats-mobile.png`, `../preflight/screenshots/tasks-mobile.png`. The first card was 379.5px in a 358px container; Tasks content spilled 56px beyond its 358px table.

## Automated verification completed

- `pnpm build` with the exact synthetic build environment from `.github/workflows/checks.yml`: passed (11.947s).
- `PLAYWRIGHT_PORT=3017 pnpm exec playwright test tests/e2e/chat.spec.ts tests/e2e/shell.spec.ts --reporter=line`: **5 passed (49.4s)**, including authenticated setup, real synthetic chat/reload/follow-up and failure recovery, mobile history card containment, and wrapping empty Tasks guidance. The fixture's deliberate unsupported-command error appeared during the passing recovery case.
- The Playwright-owned Compose container and network were removed; no listener remained on 3017. This did not use or stop the user's localhost:3000 instance.
- Initial `pnpm check` stopped at formatting of four in-progress audit Markdown files and canceled other parallel gates. My baseline report was formatted; coordinator formatted the three topic documents. Final full `pnpm check` is deferred to the coordinator after all incoming audit documents settle.
- Automated evidence logs for this local run: `/tmp/openinstinct-ux-build.log`, `/tmp/openinstinct-ux-e2e.log`, `/tmp/openinstinct-ux-check.log`. These are temporary local logs, not committed evidence artifacts.

Rendered post-fix review remains with the coordinator. Populated Tasks horizontal-table behavior was not exercised by these empty-state E2E fixtures.

## Populated Tasks presentation proof

A standalone Playwright browser used the already-running isolated audit app on `localhost:3018`, with a fresh browser context and designated local synthetic authentication. It intercepted only `traces.list` on Refresh and supplied one synthetic `BrowserTracePage`; no worker ran and no trace was persisted. This is UI presentation proof using mocked list data, not runtime task-execution proof.

At 390×844, assertions passed: all column-header content fits its cell without overlap; the existing table container has horizontal overflow and scrolls to show Started; the document has no horizontal viewport overflow. Screenshots `screenshots/tasks-populated-mobile-start.png` and `screenshots/tasks-populated-mobile-after.png` were captured and VIEWED. The first shows Task and Status separated, with the next column naturally beyond the scroll viewport; the second shows the right end including Started. Clipping of a partly scrolled column at the container edge is expected; headings no longer overlap each other.

A durable version was added to `tests/e2e/shell.spec.ts`, named “scrolls populated browser task columns on mobile with a synthetic list”. The same test body passed in the standalone script against 3018; the configured isolated E2E suite needs a final rerun after the audit server is stopped. Focused Oxlint and `git diff --check` passed. No application source changed in this follow-up.
