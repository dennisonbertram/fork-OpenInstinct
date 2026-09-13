# Plan 018: Connect Gmail — make the existing Google grant reachable end to end

GitHub: not yet filed.

> **Executor instructions:** Gmail is not greenfield. The tools, the per-user
> Vercel Connect grant, the workspace Connect/Disconnect row, the web-chat
> sign-in prompt, and the operator runbook all exist and are unit-tested. What
> is missing is (a) the Google OAuth client and Vercel connector, which only an
> operator can create, and (b) three engineering gaps found by reading the
> code, listed as slices below — Slices 1 and 3 are small, Slice 2 is a
> complete channel-lifecycle change. Do not rebuild Gmail tools, add a second
> Google auth path, change the scope set, or add a Google-specific UI beyond
> what a slice names. Use a topic worktree and a normal PR per slice, wait for
> required CI, and merge when green. Do not edit `plans/README.md`.

> **Drift check (run first):**
> `git diff --stat 7875a08..HEAD -- src/lib/google-workspace.ts agent/lib/google-workspace/client.ts agent/tools/gmail.ts agent/channels/sendblue.ts agent/channels/linq.ts src/trpc/router.ts "src/app/(authenticated)/(workspace)/page.tsx" docs/operations/VERCEL.md README.md`
> STOP a slice if its owning file already contains the behavior it adds, and
> re-run `vercel connect list --all-projects` before assuming the connector is
> still missing.

## Status

- **Priority:** P1 (Jory release 1 is owner-only and lists email as a delivery
  surface; see the `jory-on-openinstinct` memory note)
- **Effort:** S–M. Operator gates: about one hour of console work. Engineering:
  three slices of well under a day each, plus one evidence-recording PR.
- **Risk:** LOW for code. MED for the operator side: a Google OAuth client in
  `Testing` status only works for listed test users and its refresh tokens
  expire after seven days (`docs/operations/VERCEL.md:581-586`).
- **Depends on:** nothing in plans 003–016. Operator gates G1 and G2 gate
  Slice 4 only.
- **Category:** integration, operator, tests, docs
- **Planned at:** commit `7875a08`, 2026-09-12

## Why this matters

A user who says "connect gmail" today gets nothing usable in either surface:

- On the workspace page `/`, the Google Workspace row renders **Admin setup
  needed**, because `readGoogleWorkspaceConnection` in
  `src/app/(authenticated)/(workspace)/page.tsx:174-200` calls
  `getTokenResponse(env.GOOGLE_CONNECTOR_UID, …)`, the UID defaults to
  `google/open-instinct` (`src/env.ts:98`), and that connector does not exist
  (see "Verified live state" below). Any error other than
  `UserAuthorizationRequiredError` / `NoValidTokenError` maps to `unavailable`.
- In chat, the `gmail-connect` tool (`agent/tools/gmail.ts:15-24`) calls
  `ensureGmailConnection` → `withGoogleAuth` → `ctx.getToken(googleWorkspaceAuth)`
  (`agent/lib/google-workspace/client.ts:35-94`). The `@vercel/connect/eve`
  adapter translates only `UserAuthorizationRequiredError` /
  `NoValidTokenError` into a sign-in challenge; a `404 not_found` for a missing
  connector is re-thrown verbatim
  (`node_modules/@vercel/connect/dist/eve/connection-authorization.js`,
  `translate()` and `isMissingConnectorOrProjectLink()`). The user sees a tool
  failure, not a sign-in link, and the email skill's promise that
  `gmail-connect` "immediately starts the Google sign-in flow"
  (`agent/skills/email.md:13-16`) is false on this deployment.

Downstream of a valid connector, the profile check, reversible update wrappers,
approval-gated send, and the authorization path are unit-tested
(`agent/lib/google-workspace/tests/*.test.ts`, `tests/agent/tools/google-workspace.test.ts`,
`tests/agent/instructions.test.ts:65-77`). **`searchGmail` and `readGmailThread`
have no unit coverage at all** — no test in the repository calls either
function. This plan does not add it: Slice 4's live read-only proof is the only
check those two paths get here, and unit coverage for them is a follow-up worth
filing separately. No live Google check has ever been
recorded in this repository; PR #121 (`c10ddda`) added the acceptance
checklist and says explicitly that setup is not evidence.

## Current state

### What exists (files opened and confirmed)

| Concern                       | Owner                                                                                                                                    | Notes                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope set and Connect subject | `src/lib/google-workspace.ts:3-22`                                                                                                       | `googleWorkspaceScopes` = `openid`, `email`, `profile`, `gmail.modify`, `calendar.events`, `calendar.freebusy`, `contacts.readonly`. Subject `{ id: userId, issuer: "openinstinct", type: "user" }`. Pinned by `agent/lib/google-workspace/tests/google-workspace.test.ts:16-35`.                                                                |
| Agent-side auth               | `agent/lib/google-workspace/client.ts`                                                                                                   | `googleWorkspaceAuthOptions` (`connector: env.GOOGLE_CONNECTOR_UID`, `displayName: "Google"`, `validate: true`), `withGoogleAuth` records a `connection_installations` row under enforcement, refuses a revoked row, and calls `ctx.requireAuth` on Google 401.                                                                                  |
| Gmail calls                   | `agent/lib/google-workspace/gmail.ts`                                                                                                    | `ensureGmailConnection` probes `users.getProfile`; send uses a stable `Message-ID` from session+call id.                                                                                                                                                                                                                                         |
| Tools                         | `agent/tools/gmail.ts`                                                                                                                   | `gmail-connect`, `gmail-search`, `gmail-read-thread`, `gmail-update`, `gmail-send` (`approval: always()`); scheduled workers get read-only tools.                                                                                                                                                                                                |
| Skill and role instructions   | `agent/skills/email.md`, `agent/instructions/content/role/interactive.md:37-40`                                                          | "Always call `gmail-connect` before `gmail-send`"; never ask for Google credentials.                                                                                                                                                                                                                                                             |
| Workspace row                 | `src/app/(authenticated)/(workspace)/page.tsx`, `_components/google-workspace-action.tsx`                                                | States `connected` / `disconnected` / `unavailable`; only `?google=unavailable` renders an alert.                                                                                                                                                                                                                                                |
| Connect / disconnect mutation | `src/trpc/router.ts:450-488`, `startGoogleWorkspaceAuthorization` at `:571-581`                                                          | Callback `/?google=connected`, 10-minute authorization window, revokes token and installation on disconnect. **No test covers it** (`src/trpc/router.test.ts` tests only `square.update`).                                                                                                                                                       |
| Web-chat sign-in prompt       | `src/app/(authenticated)/chat/[sessionId]/_components/conversation/message/authorization.tsx`                                            | Renders "Sign in with Google" from the `authorization.required` part.                                                                                                                                                                                                                                                                            |
| Linq sign-in prompt           | `agent/channels/linq.ts:216-230`                                                                                                         | Explicit `authorization.required` handler posting raw text with the URL.                                                                                                                                                                                                                                                                         |
| SendBlue sign-in prompt       | `agent/channels/sendblue.ts:273-540`                                                                                                     | **No `authorization.required` handler.** The chat-sdk default (`node_modules/eve/dist/src/public/channels/chat-sdk/authorization.js`) posts `{ markdown }` straight to `thread.post`, bypassing `postSendblueReply` (`sendblue.ts:788-810`), which is where this channel enforces the provider-message budget and the dispatch/admission record. |
| Env                           | `src/env.ts:98`                                                                                                                          | `GOOGLE_CONNECTOR_UID` defaults to `google/open-instinct`; `.env.example:29`.                                                                                                                                                                                                                                                                    |
| Runbook                       | `docs/operations/VERCEL.md:572-716`, `README.md:116-195`                                                                                 | Google Cloud steps, JSON conversion with `jq`, `vercel connect create google --connection-method oauth`, attach per environment, env var, local development, and a seven-item acceptance checklist.                                                                                                                                              |
| Precedent                     | Square: `agent/lib/square/auth.ts`, `src/lib/square.ts`, `src/trpc/router.ts:489-524`, `docs/SQUARE.md`, memory note `square-connection` | Same Connect pattern; live in production since 2026-09-02 with connector `connect.squareupsandbox.com/square-sandbox`.                                                                                                                                                                                                                           |

### Verified live state (read-only checks run 2026-09-12 from this worktree)

- `vercel connect list --all-projects` for team `dennisons-projects` returns
  exactly two connectors: `connect.squareupsandbox.com/square-sandbox`
  (project `jory`) and `linq/open-instinct-line` (project `partyline-v2`).
  **No Google connector exists.**
- `vercel env ls production` for project `jory` (id
  `prj_GIIYS7WKKuY0400OCVVFntPw1H0r`) lists `SQUARE_CONNECTOR_UID` and
  `SQUARE_ENVIRONMENT` and **no `GOOGLE_CONNECTOR_UID`**, so production resolves
  the default `google/open-instinct`.
- `vercel connect create google --help` documents one method: `oauth`,
  bring-your-own credentials, `--data` with `clientId` (required) and
  `clientSecret`. It does not print the redirect URI.
- GitHub: no open issue tracks Gmail connection. Merged PRs #56, #87, #121 are
  the last Google changes.

### Discrepancies between the pasted Google setup guidance and this repository

1. **Scope spelling.** The guidance lists
   `https://www.googleapis.com/auth/userinfo.email` and
   `https://www.googleapis.com/auth/userinfo.profile`. The repository requests
   the short OpenID Connect aliases `email` and `profile`
   (`src/lib/google-workspace.ts:5-6`), and the runbook lists the same short
   names (`docs/operations/VERCEL.md:589-590`). Google treats the short names
   as aliases of the `userinfo.*` URIs, so the grant is expected to be
   identical; the consent-screen entry must still be confirmed at the operator
   gate rather than assumed. The remaining five scopes match exactly.
2. **Redirect URI.** `https://connect.vercel.com/callback` matches what the
   repository documents (`README.md:130-132`, `docs/operations/VERCEL.md:591-595`,
   `docs/SQUARE.md:74`) and what the working Square connector was registered
   with. It is **not** printed by the Vercel CLI. The repository's own
   instruction stands: confirm it against the redirect URI shown on the new
   connector's Vercel Connect page before the first consent, because a wrong
   URI fails only at consent time.
3. **Connector naming.** The guidance names the Google-side OAuth client
   "Jory Vercel Connect", which is fine and invisible to this code. It says
   nothing about the Vercel connector name, which is what matters: the code's
   default UID is `google/open-instinct`. Either create the connector with
   `--name open-instinct` (no env change needed) or set `GOOGLE_CONNECTOR_UID`
   in every attached environment. The README example uses `open-instinct`;
   the runbook uses a placeholder.
4. **APIs and consent screen.** Gmail API, Google Calendar API, People API,
   External audience, Testing status, and test users all match
   `docs/operations/VERCEL.md:578-586`. No discrepancy.
5. **"download the JSON file and save it outside the repository."** Matches,
   but incomplete: Vercel expects top-level `clientId` / `clientSecret`, not
   Google's nested `web.client_id` / `web.client_secret`; the runbook's `jq`
   step at `docs/operations/VERCEL.md:597-612` does the conversion.

## Operator gates (human only; no engineering slice)

Never paste client ids, secrets, tokens, or the JSON contents into chat, this
plan, an issue, or a commit.

- **G1 — Google Cloud.** Follow `docs/operations/VERCEL.md:576-595`: one
  project, three APIs enabled, External consent screen in Testing with every
  account that will connect listed as a test user, the seven scopes declared,
  a Web application OAuth client with `https://connect.vercel.com/callback` as
  the authorized redirect URI, JSON downloaded outside the repository.
  Exit evidence: the consent screen's scope list matches
  `src/lib/google-workspace.ts` (short `email`/`profile` names or their
  `userinfo.*` equivalents) and the test-user list includes the demo account.
- **G2 — Vercel connector.** Follow `docs/operations/VERCEL.md:597-633` from
  a checkout linked to project `jory`: convert the JSON with the `jq` step,
  `vercel connect create google --connection-method oauth --name open-instinct --data @<tmp>`,
  delete the temp file, attach to `production` **and** `development`
  (`:651-682` explains why local work fails otherwise), set
  `GOOGLE_CONNECTOR_UID` in both environments unless the name is exactly
  `open-instinct`, redeploy. Then open the connector in the Vercel dashboard
  and confirm its redirect URI equals the one registered in G1.
  Exit evidence: `vercel connect list --all-projects` shows the Google
  connector attached to `jory`; the workspace row on
  `https://open-instinct-ashy.vercel.app/` shows **Connect** instead of
  **Admin setup needed** for a signed-in user.

## Commands you will need

| Purpose                  | Command                                                                                                                  | Expected result                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| Google auth unit tests   | `pnpm exec vitest run agent/lib/google-workspace/tests/google-workspace-agent-installations.test.ts`                     | exit 0                                         |
| Scope pin                | `pnpm exec vitest run agent/lib/google-workspace/tests/google-workspace.test.ts`                                         | exit 0; scope set unchanged                    |
| Router coverage          | `pnpm exec vitest run src/trpc/router.test.ts`                                                                           | exit 0                                         |
| SendBlue channel tests   | `pnpm exec vitest run tests/agent/channels/sendblue-channel.test.ts tests/agent/channels/sendblue-authorization.test.ts` | exit 0                                         |
| Workspace row            | `pnpm exec vitest run "src/app/(authenticated)/(workspace)/_tests/connection-setup.test.tsx"`                            | exit 0                                         |
| Instruction pin          | `pnpm exec vitest run tests/agent/instructions.test.ts`                                                                  | exit 0                                         |
| Live connector inventory | `vercel connect list --all-projects`                                                                                     | read-only; lists the Google connector after G2 |
| Handoff                  | `pnpm check && pnpm build && git diff --check`                                                                           | exit 0                                         |

`node_modules` is not installed in this planning worktree; run `pnpm install
--frozen-lockfile` in the implementation worktree first.

## Scope

**In scope**

- `agent/lib/google-workspace/client.ts` and its installation test (Slice 1).
- `agent/channels/sendblue.ts` and a new `tests/agent/channels/sendblue-authorization.test.ts` (Slice 2).
- `src/trpc/router.test.ts` (Slice 3).
- `docs/operations/VERCEL.md` acceptance evidence and, only if a live check
  contradicts it, `README.md` (Slice 4).

**Out of scope**

- Changing `googleWorkspaceScopes`, the connector subject, or the default UID.
- New Google tools, Calendar/Contacts work, Google OAuth verification for
  public distribution, a `?google=connected` banner (the row switches to a
  **Disconnect** button and the optional account label — there is no
  "Connected" badge; see
  `src/app/(authenticated)/(workspace)/_components/google-workspace-action.tsx:28`
  — which is weaker feedback than a banner, so revisit this if the live check
  in Slice 4 finds the result unclear), a `docs/GOOGLE.md`
  (`README.md` and the runbook already own it), or any change under
  `agent/instructions/` (a Square eval run would then be required).

## Steps

### Slice 1 — Say "not configured" instead of a raw Connect error

**Owns:** `agent/lib/google-workspace/client.ts`,
`agent/lib/google-workspace/tests/google-workspace-agent-installations.test.ts`.
**Prerequisites:** none. Lands before or after G2; it matters most before G2
and for every local checkout whose connector is not attached to `development`.

In `withGoogleAuth`, wrap the `ctx.getToken(googleWorkspaceAuth)` call so a
`ConnectError` with `status === 404 && code === "not_found"`, or
`status === 403 && code === "forbidden"` whose message matches
`/connector is not linked to this project/i`, is rethrown as one plain error
naming `GOOGLE_CONNECTOR_UID`, the resolved UID, and the runbook section,
mirroring the Square wording in `agent/lib/square/auth.ts:42-45`. Match the
SDK's own predicate exactly — `isMissingConnectorOrProjectLink` in
`node_modules/@vercel/connect/dist/eve/connection-authorization.js:205-215`
requires `code === "forbidden"` on the 403 arm, not the message alone. Leave
every other error untouched so the sign-in challenge path is unchanged. Import
`ConnectError` from `@vercel/connect`; do not add a helper module.

RED first: the existing test file builds a synthetic `ToolContext` whose
`getToken` is a `vi.fn` each case controls, and it mocks `@vercel/connect/eve`
but not `@vercel/connect`, so the real `ConnectError` class can be thrown
from the mock. Add one case
whose `getToken` rejects with a `ConnectError` carrying `status: 404,
code: "not_found"` and assert the rejection message contains
`GOOGLE_CONNECTOR_UID` and the UID. Add a sibling case for the 403
(`code: "forbidden"`) message, and a negative case for a 403 without that code,
which must pass through untouched.

The suite's three existing cases are revoked-installation, bootstrap, and
enforcement-off (`:68`, `:76`, `:87`) — there is **no** existing
authorization-required case to lean on. Add one: a `getToken` that rejects with
Eve's authorization signal must still propagate unchanged, so the wrapper is
proven not to swallow the sign-in challenge.

**Verify:** `pnpm exec vitest run agent/lib/google-workspace/tests/google-workspace-agent-installations.test.ts`
fails before the change on the new cases and passes after;
`pnpm exec vitest run agent/lib/google-workspace/tests/google-workspace.test.ts`
still passes (scope set untouched).

### Slice 2 — Own the SendBlue authorization lifecycle, required through completed

**Owns:** `agent/channels/sendblue.ts`, new
`tests/agent/channels/sendblue-authorization.test.ts`.
**Prerequisites:** none.

This is a whole-lifecycle change, not a copy of Linq's handler. Three facts
observed in the installed packages at `7875a08` shape it, and each was
confirmed by opening the source:

- `postSendblueReply` (`agent/channels/sendblue.ts:788-810`) returns a
  **boolean** and consumes `thread.post()`'s result inside its `dispatch`
  callback, so there is no posted id to record. Recording one means changing
  that helper's contract while preserving what its existing callers depend on:
  `false` on budget denial, `false` on uncertain delivery, and `true` on an
  already-accepted report.
- `chat-adapter-sendblue`'s `editMessage`
  (`node_modules/chat-adapter-sendblue/dist/index.js:276`) throws a plain
  `Error`, and Eve's fallback test
  (`node_modules/eve/dist/src/public/channels/chat-sdk/notImplemented.js`)
  recognizes only `name === "NotImplementedError"` or `code ===
"NOT_IMPLEMENTED"`. The default `authorization.completed` handler therefore
  throws on SendBlue and posts nothing; the pending entry is never cleared.
  **Do not leave `authorization.completed` to the default.** Deliver the
  completion status as a new post through the budgeted path.
- The authorization scope name is derived per tool and connector by Eve
  (`node_modules/eve/dist/src/execution/tool-auth.js`) — for this connector it
  is `gmail-connect__google_open-instinct`, not `"google"`. Key
  `pendingAuthMessageIds` off `event.name`, exactly as
  `agent/channels/linq.ts:216-230` already does.

Copying Linq also inherits two gaps: it preserves neither the default handler's
duplicate suppression nor a supplied `userCode`. Read the challenge
construction in
`node_modules/@vercel/connect/dist/eve/connection-authorization.js:117` and
render the code when one is present; suppress a repeat prompt for an
authorization already pending.

Correct one claim from the earlier draft of this plan: a three-argument
`postSendblueReply(thread, { raw }, scope)` supplies no report identity, and
`dispatchReportPart` (`agent/lib/report-part-dispatch.ts:49`) then simply
invokes the callback. The slice buys the **budget check and usage recording**,
not a durable dispatch record. Do not promise the latter in the PR.

RED first: in the new test, stand up the channel the way
`tests/agent/channels/sendblue-channel.test.ts` does — noting that suite mocks
away the Chat SDK implementation (`:120`), which is why it never caught the
completion failure, so this test must exercise the real handler. Cover:
one raw post whose text contains the URL; the budget check running for the
scope; `pendingAuthMessageIds[event.name]` set from the real dynamic name; a
duplicate `authorization.required` producing no second post; a supplied
`userCode` appearing in the text; no post when `candidateId` is set or
`context.thread` is absent; a denied budget producing no post and no pending
entry; and `authorization.completed` posting a completion message and clearing
the entry rather than throwing.

**Verify:** `pnpm exec vitest run tests/agent/channels/sendblue-authorization.test.ts tests/agent/channels/sendblue-channel.test.ts`
— new file fails before the handlers exist, both pass after. The existing
SendBlue suite must stay green, proving the changed helper contract did not
break budget denial or already-accepted handling.

### Slice 3 — Cover `googleWorkspace.update` the way `square.update` is covered

**Owns:** `src/trpc/router.test.ts`, and `src/trpc/router.ts` only if a case
demonstrates a defect — say which in the PR title so the slice's ownership is
not ambiguous at review.
**Prerequisites:** none.

`src/trpc/router.test.ts:107-181` already exercises `square.update` connect and
disconnect with mocked `startAuthorization`, `revokeToken`, and installation
services. Add the three parallel cases for `googleWorkspace.update`: disconnect
revokes the token for `googleWorkspaceSubject(scope.userId)` and revokes the
`provider: "google"` installation and returns `/?google=disconnected`;
disconnect still resolves when installation revocation throws; connect deletes
the revoked installation, calls `startAuthorization` with
`env.GOOGLE_CONNECTOR_UID`, `googleWorkspaceTokenParams(scope.userId)`, and a
callback ending in `/?google=connected`. These lock the user path the workspace
page drives. If a case exposes a defect in `src/trpc/router.ts:450-488`, fix it
in this slice and say so in the PR; otherwise the slice is test-only.

The existing environment mock (`src/trpc/router.test.ts:57`) overrides only
Square's UID, so add a synthetic `GOOGLE_CONNECTOR_UID` and assert against it
rather than the default. Also cover enforcement on and off, a remote revocation
failure, and an authorization-start failure, and assert the exact installation
keys, callback URL, and expiry rather than "a callback was passed".

**Verify:** `pnpm exec vitest run src/trpc/router.test.ts` exits 0. These are
characterization tests over code that already exists, so they legitimately pass
on first run — do not fabricate RED by breaking an assertion and reverting it,
which proves only that a wrong expectation fails. Behavioral RED is required
only if a case exposes a defect and the slice fixes it.

### Slice 4 — Run the Google acceptance checks and record the evidence

**Owns:** `docs/operations/VERCEL.md` (a dated "Google verification" note under
"Verified reference deployment" or the acceptance section) and `README.md`
only if a check contradicts it.
**Prerequisites:** G1, G2, and Slices 1–2 merged and deployed (Slice 3 is
independent). Requires the demo Google account, an operator signed in to
`https://open-instinct-ashy.vercel.app/`, and a verified phone on the
configured phone channel.

Execute the existing checklist at `docs/operations/VERCEL.md:684-716`, in
production and locally, and add two checks it lacks:

- **Chat-initiated connect, from the right starting state.** "Disconnected" is
  two different states and only one of them can start consent from chat. With
  enforcement on, `withGoogleAuth` throws on a `revoked` installation
  **before** it ever calls `ctx.getToken`
  (`agent/lib/google-workspace/client.ts:70-72`), so an account that was
  disconnected through `/` cannot re-consent from chat — that is the documented
  contract (`docs/operations/VERCEL.md:639`), and the router deletes the
  revoked row before starting authorization (`src/trpc/router.ts:475`). Record
  each state separately: first connection (no grant, no revoked row) must show
  the sign-in prompt in web chat, complete consent, resume the same turn, and
  return `connected: true`; explicitly revoked must refuse and direct the user
  to `/`; a cancelled or timed-out consent must recover without reporting a
  connection. Chat-initiated reconnect after explicit revocation is a
  behavior change, not something Slices 1–3 deliver — leave it out or file it
  separately.
- **Both phone channels, not whichever is live.** A Linq pass cannot close
  SendBlue acceptance, and Slice 2 is a SendBlue change. Run the sign-in link
  and the completion message on SendBlue with `SENDBLUE_CONVERSATIONS=on`; if
  that cannot be arranged, record SendBlue as **not run** and say the slice's
  acceptance is incomplete.
- **Refresh, not just first use.** An immediately successful call does not
  prove token refresh. Exercise a call after the access token has expired.
- **Isolation.** A second signed-in user must not inherit the first user's
  grant.
- **Read-only proof.** `gmail-search` with a query the demo inbox satisfies
  returns at least one message, and reading the returned thread succeeds. Use
  designated synthetic mail. Note accurately that `gmail.ts:203` redacts
  selected patterns while still returning headers such as sender, recipient,
  and subject — do not record this as "sanitized mail". Do not send email as
  part of the smoke; `gmail-send` must still stop for approval, and a rejected
  approval must result in zero send operations.

Record, without secrets: date, deployment id, connector UID, which Google
account type was used (personal or managed), and each check's pass/fail.
Record the seven-day refresh-token expiry as a standing operational note if
the consent screen remains in Testing.

**Verify:** the checklist items are marked in the doc with the date;
`pnpm check && pnpm build && git diff --check` exits 0. A check that could not
be run is recorded as **not run**, never inferred.

## Test plan and done criteria

- Positive: a signed-in user connects from `/` and from chat on web and on the
  live phone channel; `gmail-connect`, `gmail-search`, and one read-only
  Calendar call succeed in production.
- Negative: with no connector, `gmail-connect` fails with a message naming
  `GOOGLE_CONNECTOR_UID`; with a revoked installation under enforcement, the
  tool refuses until reconnect (already tested); `gmail-send` never completes
  without approval (`evals/agent/safety.eval.ts:147-170`, on demand).
- Disconnect / reconnect from `/` clears the revoked record and Gmail works
  again. Note that a user who connects and disconnects through `/` **without
  ever using a Google tool** has no installation row at all —
  `revokeConnectionInstallation` (`db/services/connection-installations.ts:78`)
  updates existing rows and creates none — so that user can still start consent
  from chat. The revoked-row refusal applies only after a tool has recorded an
  installation.
- [ ] Slices 1–2 merged with RED evidence for their behavior changes (Slice 1's
      pass-through guards and Slice 3's characterization cases are GREEN on
      first run by design; only error conversion and the SendBlue handlers
      require RED).
- [ ] G1 and G2 exit evidence recorded (non-secret) in Slice 4's PR.
- [ ] Slice 4 checklist complete, with any **not run** items named.

## What the plan review changed

Reviewed by `gpt-6-astra` at `7875a08` before filing; every point below was
re-confirmed by opening the cited source.

Applied: Slice 1's 403 predicate needs `code === "forbidden"` to match the
SDK's own `isMissingConnectorOrProjectLink`, and the installation suite has no
existing authorization-required case to lean on (its three are revoked,
bootstrap, enforcement-off). Slice 2 was rewritten as a whole-lifecycle change:
`postSendblueReply` returns a boolean and discards the posted id, SendBlue's
`editMessage` throws a plain `Error` that Eve's `isNotImplemented` does not
catch (so the default `authorization.completed` throws and posts nothing), the
scope name is dynamic rather than `"google"`, and the three-argument call buys
a budget check and usage recording but no durable dispatch record. Slice 3 may
need `router.ts` ownership and must not fabricate RED by breaking an
assertion. Slice 4 now separates first-connection from explicitly-revoked,
because the revoked check throws before `ctx.getToken`, and cannot close
SendBlue acceptance with a Linq result. The Google row has no "Connected"
badge.

Rejected: reordering the plan behind a characterization-first PR. Slices 1 and
3 are already small, independent, and useful before the connector exists;
adding a lifecycle-characterization PR ahead of them buys coverage the revised
Slices 2–3 already require.

Noted but not resolved: the scope-pin test compares requested scopes against
the same imported array, so it would stay green if an eighth scope were added.
Adding a literal expectation is a one-line follow-up, not part of this plan,
which changes no scopes.

## Open questions

1. `plans/` holds 001–016, yet commit `79cf7e6` (#219) is titled "Plan 017".
   No `plans/017-*.md` exists in history. This plan takes 018 as instructed;
   whoever files 017 should confirm the numbers do not collide.
2. Which phone channel is live for the demo user right now (Linq, or native
   SendBlue with `SENDBLUE_CONVERSATIONS=on`)? Slice 2 makes SendBlue correct
   either way, but Slice 4 must exercise **SendBlue specifically** — a Linq pass
   cannot close acceptance for a SendBlue change. If SendBlue cannot be arranged,
   that half of the acceptance is recorded as not run.
3. Is the demo Google account personal or in a managed Google Workspace
   domain? A domain admin can block an unverified client
   (`docs/operations/VERCEL.md:709-716`); this decides whether G1 can succeed
   with the intended account.
4. Should the connector be named `open-instinct` to match the code default, or
   should the default in `src/env.ts:98` change to a Jory name? This plan keeps
   the default and recommends matching it; renaming is a one-line follow-up
   with a test in `src/lib/tests/env.test.ts:224-228`.
5. Whether Google accepts the short `email`/`profile` scope names on the
   consent screen exactly as the code sends them was not verified from Google
   documentation in this session; confirm at G1.

## STOP, rollback, and maintenance

STOP Slice 1 if `@vercel/connect` has stopped exporting `ConnectError` with
`status`/`code`, and STOP Slice 2 if the chat-sdk channel no longer exposes
`pendingAuthMessageIds` on channel state; both are version-pinned facts
observed at `7875a08`. Each slice reverts independently; none changes schema,
scopes, or secrets. If G2 is done under a different name without setting
`GOOGLE_CONNECTOR_UID`, the row stays **Admin setup needed** — that is the
first thing to check, not the code. Recheck the seven-day expiry whenever a
previously working account reports **Connect** again.

## Independently executable prompt

"Implement Plan 018 only. Read `agent/lib/google-workspace/client.ts`,
`agent/channels/linq.ts:216-230`, `agent/channels/sendblue.ts`, and
`src/trpc/router.test.ts:107-181` before writing code. Land Slices 1–3 as
separate PRs with RED-then-GREEN evidence; do not change scopes, the connector
subject, `agent/instructions/`, or the workspace page. Slice 4 runs only after
the operator confirms G1 and G2 and must record what was actually observed,
never inferred. Never print or commit credentials."
