# UX Path Catalog: Jory / OpenInstinct dashboard

Generated: 2026-09-05. Source snapshot: `f11a3a1` in the isolated audit checkout.

30 stories across six topics: 17 medium, 13 short. These are authored expected paths. Authored coverage is not browser verification, a passing test, or deployment evidence.

## Summary

| Type   | Count |
| ------ | ----: |
| Short  |    13 |
| Medium |    17 |
| Long   |     0 |

No 15–40-step long scenario was added solely to meet a length target. Multi-feature work is represented by linked stories and dependencies.

## Coverage inventory

The following 40 explicit inventory rows separate primary stories from conditional branches. Every row has a source-backed catalog reference, but several branches remain fixture-dependent or incompletely exercised by the proposed primary path. No exhaustive-app percentage or browser pass rate is inferred. Source owners are recorded in [discovery](discovery.md) and each linked topic.

| ID  | Capability or state                                            | Stories              | Authored coverage / limitation                     |
| --- | -------------------------------------------------------------- | -------------------- | -------------------------------------------------- |
| F01 | Phone code sign-in, callback and restored session              | STORY-001            | primary                                            |
| F02 | Rejected code and number-entry recovery                        | STORY-002            | primary                                            |
| F03 | Desktop route/brand/active-navigation orientation              | STORY-003, STORY-007 | primary                                            |
| F04 | Mobile sidebar navigation and keyboard access                  | STORY-004            | primary                                            |
| F05 | Sign-out and protected-page access                             | STORY-005            | primary                                            |
| F06 | Workspace readiness and unavailable service explanation        | STORY-006            | primary                                            |
| F07 | Workspace WebChat entry                                        | STORY-007            | primary                                            |
| F08 | Model catalog search, no-results and dismissal                 | STORY-008            | primary                                            |
| F09 | Actual model-setting persistence                               | STORY-008            | conditional variation                              |
| F10 | Connector state and unavailable-return banners                 | STORY-009            | primary                                            |
| F11 | Actual Google/Square connect-disconnect OAuth lifecycle        | STORY-009            | conditional variation                              |
| F12 | iMessage disabled state and configured native handoff          | STORY-010            | mixed primary/conditional                          |
| F13 | Starter draft editing and replacement                          | STORY-011            | primary                                            |
| F14 | Draft file attach/remove and keyboard editing                  | STORY-012            | primary                                            |
| F15 | First chat send, follow-up, reload and saved-history link      | STORY-013            | primary; runtime prerequisite                      |
| F16 | Stop generation and failure recovery                           | STORY-014            | primary; runtime prerequisite                      |
| F17 | Structured question response and duplicate-response state      | STORY-015            | primary; fixture blocked                           |
| F18 | Approval/authorization prompts and terminal states             | STORY-015            | conditional variation                              |
| F19 | Saved chat listing, row metadata and reopen/reload             | STORY-016            | primary                                            |
| F20 | Empty chat history and New chat                                | STORY-017            | primary/empty variation                            |
| F21 | Empty trace list, refresh and Open chat                        | STORY-018            | primary                                            |
| F22 | Missing owned trace and usable return                          | STORY-019            | primary                                            |
| F23 | Populated trace list, older pages and summary counters         | STORY-020            | primary; fixture blocked                           |
| F24 | Trace detail events, timings and refresh                       | STORY-020            | primary; fixture blocked                           |
| F25 | Older messages and optional developer activity                 | STORY-020            | conditional variation                              |
| F26 | Personal-profile save, validation and reload                   | STORY-021            | primary; disposable profile required               |
| F27 | Passwordless login creation and metadata search                | STORY-022            | primary; disposable vault required                 |
| F28 | Category forms, blank validation, back and dismissal           | STORY-023            | primary                                            |
| F29 | Actual card/address/contact creation and persistence           | STORY-023            | conditional or unexecuted variation                |
| F30 | Import preparation, direct import URL and invalid CSV          | STORY-024            | primary                                            |
| F31 | Successful CSV import and partial-row results                  | STORY-024            | conditional variation                              |
| F32 | Vault removal, category counts and empty recovery              | STORY-025            | primary; fixture blocked                           |
| F33 | Vault large-list pagination, setup links and Other metadata    | STORY-022, STORY-025 | conditional variation; Other lacks dedicated story |
| F34 | Non-admin navigation exclusion and protected admin routes      | STORY-026            | primary                                            |
| F35 | Admin overview counts, recent activity and usage detail        | STORY-027            | primary; role blocked                              |
| F36 | Workspace list/pagination and lifecycle confirmation dismissal | STORY-028            | primary; role blocked                              |
| F37 | Actual lifecycle transition and failure handling               | STORY-028            | conditional variation                              |
| F38 | Audit log filter, empty results and older pages                | STORY-029            | primary; role blocked                              |
| F39 | Webhook attempts, statuses and overview relation               | STORY-030            | primary; role blocked                              |
| F40 | Actual webhook drain outcome and failure feedback              | STORY-030            | conditional variation                              |

## All stories and provisional ID mapping

The complete steps, ideal paths, alternate paths, variations, edge cases, and source pointers remain in topic files. This index uses stable explicit anchors and does not duplicate the full text.

| Story                                                | Provisional ID | Topic               | Type   | Goal/title                                                       |
| ---------------------------------------------------- | -------------- | ------------------- | ------ | ---------------------------------------------------------------- |
| [STORY-001](topics/access-navigation.md#story-001)   | ACCESS-01      | access-navigation   | medium | Sign in and resume a saved dashboard destination                 |
| [STORY-002](topics/access-navigation.md#story-002)   | ACCESS-02      | access-navigation   | medium | Recover from an incorrect verification code                      |
| [STORY-003](topics/access-navigation.md#story-003)   | ACCESS-03      | access-navigation   | short  | Find chat from the workspace and return home                     |
| [STORY-004](topics/access-navigation.md#story-004)   | ACCESS-04      | access-navigation   | medium | Navigate the dashboard on a narrow screen                        |
| [STORY-005](topics/access-navigation.md#story-005)   | ACCESS-05      | access-navigation   | short  | Sign out and confirm the dashboard requires authentication       |
| [STORY-006](topics/workspace-setup.md#story-006)     | WORKSPACE-01   | workspace-setup     | short  | Find what is available in a new workspace                        |
| [STORY-007](topics/workspace-setup.md#story-007)     | WORKSPACE-02   | workspace-setup     | short  | Start a web conversation from Workspace                          |
| [STORY-008](topics/workspace-setup.md#story-008)     | WORKSPACE-03   | workspace-setup     | medium | Search the model catalog and leave the current model unchanged   |
| [STORY-009](topics/workspace-setup.md#story-009)     | WORKSPACE-04   | workspace-setup     | medium | Inspect connector actions and recover from an unavailable return |
| [STORY-010](topics/workspace-setup.md#story-010)     | WORKSPACE-05   | workspace-setup     | short  | Understand the iMessage handoff without sending a message        |
| [STORY-011](topics/chat-conversation.md#story-011)   | CHAT-01        | chat-conversation   | short  | Turn a starter into a specific draft                             |
| [STORY-012](topics/chat-conversation.md#story-012)   | CHAT-02        | chat-conversation   | short  | Attach a synthetic file and remove it before sending             |
| [STORY-013](topics/chat-conversation.md#story-013)   | CHAT-03        | chat-conversation   | medium | Start a conversation, continue it, and reload                    |
| [STORY-014](topics/chat-conversation.md#story-014)   | CHAT-04        | chat-conversation   | medium | Stop a response and continue, or recover from a failed turn      |
| [STORY-015](topics/chat-conversation.md#story-015)   | CHAT-05        | chat-conversation   | medium | Answer a question or review a conditional action request         |
| [STORY-016](topics/history-tasks.md#story-016)       | HISTORY-01     | history-tasks       | medium | Find and reopen a saved conversation                             |
| [STORY-017](topics/history-tasks.md#story-017)       | HISTORY-02     | history-tasks       | short  | Leave history for a new chat without sending                     |
| [STORY-018](topics/history-tasks.md#story-018)       | HISTORY-03     | history-tasks       | short  | Understand an empty browser-task history and refresh it          |
| [STORY-019](topics/history-tasks.md#story-019)       | HISTORY-04     | history-tasks       | short  | Recover from a missing browser trace                             |
| [STORY-020](topics/history-tasks.md#story-020)       | HISTORY-05     | history-tasks       | medium | Review a completed assignment and its conversation context       |
| [STORY-021](topics/vault-personal-info.md#story-021) | VAULT-01       | vault-personal-info | medium | Save personal information and recover from validation feedback   |
| [STORY-022](topics/vault-personal-info.md#story-022) | VAULT-02       | vault-personal-info | medium | Add a passwordless synthetic login and find its metadata         |
| [STORY-023](topics/vault-personal-info.md#story-023) | VAULT-03       | vault-personal-info | medium | Inspect category forms, validation, and safe cancellation        |
| [STORY-024](topics/vault-personal-info.md#story-024) | VAULT-04       | vault-personal-info | medium | Review bulk-import preparation and recover from an invalid file  |
| [STORY-025](topics/vault-personal-info.md#story-025) | VAULT-05       | vault-personal-info | short  | Remove only an isolated synthetic saved item                     |
| [STORY-026](topics/admin-oversight.md#story-026)     | ADMIN-01       | admin-oversight     | short  | Keep administration unavailable to a regular member              |
| [STORY-027](topics/admin-oversight.md#story-027)     | ADMIN-02       | admin-oversight     | medium | Read the system overview and compare usage scopes                |
| [STORY-028](topics/admin-oversight.md#story-028)     | ADMIN-03       | admin-oversight     | medium | Inspect a workspace lifecycle confirmation and dismiss it        |
| [STORY-029](topics/admin-oversight.md#story-029)     | ADMIN-04       | admin-oversight     | medium | Filter audit records for a designated workspace                  |
| [STORY-030](topics/admin-oversight.md#story-030)     | ADMIN-05       | admin-oversight     | short  | Inspect webhook delivery outcomes without dispatching work       |

## Story dependency graph

```text
STORY-001 sign-in / callback
├── STORY-003/004 shell orientation
│   └── STORY-006..010 workspace capabilities
├── STORY-011/012 safe composer drafts
│   └── STORY-013 successful conversation
│       ├── STORY-014 stop / continue
│       ├── STORY-016 saved history (or existing owned fixture)
│       └── STORY-015 pending structured request (additional fixture)
├── STORY-017 new chat from history
├── STORY-018/019 empty and missing trace routes
│   └── STORY-020 populated trace + parent chat (additional fixture)
├── STORY-023/024 blank forms and invalid import
│   ├── STORY-021 disposable profile save
│   ├── STORY-022 disposable passwordless login
│   └── STORY-025 exact disposable contact removal (additional fixture)
└── STORY-026 non-admin exclusion
    └── STORY-027..030 require separately existing admin fixture

STORY-002 incorrect-code recovery uses an unauthenticated isolated session.
STORY-005 sign-out runs after all runnable authenticated checks.
Blocked stories do not prevent sign-out cleanup.
```

## Redundancy candidates

### Duplicate paths and labels

- `/chat` is reached through Workspace WebChat, sidebar Chat, All chats New chat, and Tasks Open chat. STORY-003, 007, 017, and 018 preserve distinct starting-context assertions; their identical destination needs only one shared rendered-composer baseline.
- Jory brand and Workspace return to `/`; STORY-003 compares the two.
- Admin destinations are repeated in the global sidebar and AdminShell header; STORY-027..030 compare those routes when a role fixture exists.
- Vault bulk import has a category route and `/vault?import=chrome`; setup parameters may also deep-link category forms.
- Send via Enter versus Submit and attachment removal via chip versus Backspace are alternate controls for the same draft action.

### Repeated information

- Workspace and per-chat usage on All chats, optional developer chat activity, and admin usage/overview have different scopes; compare meaning before removing surfaces.
- Browser task/status/result/timing are repeated in chat activity, trace list, and trace detail; list scanning and event-level diagnosis have distinct purposes.
- Vault counts appear on category surfaces and within dialogs; consistency after mutation is useful repetition.
- Audit/webhook summaries in Admin overview repeat subsets of detailed pages.

### Overlapping capabilities

- Personal info and Vault Contact info/Addresses share concepts but differ in direct agent access and handling. The distinction needs clear copy, not a silent record merge.
- Manual login entry and bulk import both create login records but support different input formats and passwordless versus password-based cases.
- Chat authorization prompts and dashboard account connection buttons may target different grants; equivalence is unproven.

## Consolidation decisions

No full story was removed: shared navigation steps were retained only where the starting page, empty-state context, return route, or information goal differs. The index groups these overlaps explicitly so walkers can reuse evidence without claiming an unwalked goal passed. Provisional IDs remain in every topic and in this mapping.

## Gaps and conditional branches

- Current local preflight reports unavailable Google/Square connectors and disabled iMessage. Live OAuth grant/disconnect and native iMessage handoff need designated fixtures; no real grants/messages are required.
- Actual model selection is deliberately outside the chooser-dismiss primary path.
- Runtime send/cancel needs a functioning model; structured question, approval and authorization rendering needs a real pending synthetic fixture. A plain text question does not cover it.
- Populated traces, older-page pagination, optional developer activity and trace-parent context need suitable synthetic records.
- Profile/login mutation requires disposable scope; card/address/contact persistence, valid password CSV import, removal, Other metadata and setup-link variations are not proven by blank form inspection. Other metadata has no dedicated primary story.
- Admin read journeys need an existing administrator account and isolated records. Lifecycle mutation and webhook dispatch are conditional variants, not required audit actions.
- External API client flows, deployment setup, agent-internal tools, production message delivery, real credentials, billing/team-management UI that does not exist, and invented task creation/export controls are excluded.
- Network-failure, accessibility, mobile, and large-data variations are explicitly proposed; only a recorded walk can establish their result.

## Walk planning

[walk-plan.json](../ux-walker/walk-plan.json) lists all 30 IDs, exact prerequisites, dependencies and blocked branches. Initial plan: 23 stories scheduled for a safe primary-path walk (some require a precondition check) and 7 blocked by missing role or record fixtures. Zero stories are marked passed. No prior run-history file existed at consolidation. The walker must replace planning status with actual evidence, and preserve branch-level limitations even where the primary path succeeds.
