# Dashboard browser baseline

Date: 2026-09-05. Target: http://localhost:3000. Session: `ux-walker-openinstinct`. Read-only traversal in designated synthetic local account; no chat sent, model changed, profile saved, service connected, or vault content opened. Runtime/source revision supplied by coordinator: f11a3a1. Browser returned to Workspace at 1280×800 with dialogs closed.

## Screens inspected

All listed PNGs were opened and visually inspected. Paths are relative to this directory. Matching geometry audits are in `geometry/` with the same basename.

| Route/state               | Desktop 1280×800                        | Mobile 390×844                         | Observation                                                                                                                                                                        |
| ------------------------- | --------------------------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` Workspace             | `screenshots/workspace-desktop.png`     | `screenshots/workspace-mobile.png`     | Consistent sections/cards; mobile wraps admin setup prose narrowly next to badges. No confirmed product geometry defect. Google/Square show admin setup needed, iMessage disabled. |
| `/chat` welcome           | `screenshots/chat-desktop.png`          | `screenshots/chat-mobile.png`          | Composer and welcoming hierarchy clear; starter chips reflow cleanly. Desktop chip widths differ intentionally with label lengths, not a defect.                                   |
| `/chat/history` All chats | `screenshots/all-chats-desktop.png`     | `screenshots/all-chats-mobile.png`     | Desktop intact; mobile history card exceeds content width and title loses priority to usage/date. Only synthetic design-test title visible; conversation not opened.               |
| `/tasks` empty            | `screenshots/tasks-desktop.png`         | `screenshots/tasks-mobile.png`         | Desktop legible; mobile table headings overlap, Started and empty guidance clip. Sidebar says Tasks, page says Browser traces.                                                     |
| `/personal-info` empty    | `screenshots/personal-info-desktop.png` | `screenshots/personal-info-mobile.png` | Label/input alignment clean, controls stack correctly; Save below initial viewport. Scroll verification unresolved (see below). No values entered/saved.                           |
| `/vault` empty            | `screenshots/vault-desktop.png`         | `screenshots/vault-mobile.png`         | Four consistent category cards, all explicitly empty.                                                                                                                              |
| Vault > Logins dialog     | —                                       | `screenshots/vault-logins-mobile.png`  | Empty bottom-sheet with Close, Bulk import and Add login. Development Agentation button overlaps Add login visually. Closed without opening a credential form.                     |

## Confirmed findings

1. **Medium / layout: All chats card overflows mobile content and buries the conversation title.** At 390px viewport, history section is x=16, width=358, right=374; its card is width=379.5, right=395.5 (21.5px beyond section, 5.5px beyond viewport). Geometry reports 6px spill; whole-page overflow is zero because surrounding clipping masks it. Title renders as “Reply with ex...” while token/cost/date metadata remain visible. Evidence: `screenshots/all-chats-mobile.png`, `geometry/all-chats-mobile-detail.json`. Suggest stack/de-emphasize metadata and allow title its own usable row.
2. **Medium / layout: Tasks table overlaps and clips at mobile width.** Table width=358px, scrollWidth=414px, measured 56px spill. Status cell width=32.22px with scrollWidth=48px; Duration width=28.63px with scrollWidth=61px. The visible headings collide; empty-state text is cut off to the right. Evidence: `screenshots/tasks-mobile.png`, `geometry/tasks-mobile-detail.json`. Suggest mobile list/cards or explicit overflow container/minimum table width; let empty-state guidance wrap independently of table columns.
3. **Low / happy-path clarity: Tasks navigation opens Browser traces.** The destination is browser-execution history, not a general task list, and no traces exist in this account. Both mobile header (“Tasks”) and page title (“Browser traces”) are visible together. Evidence: `screenshots/tasks-mobile.png`. Align naming or explain the scope in navigation.

## Follow-up observations, not confirmed defects

- Personal info has 11 visible form fields across identity/contact and mailing address, with Save below the initial viewport. `scroll down 740` and `scrollintoview` commands both returned success but immediately captured screenshots still showed the top. `screenshots/personal-info-mobile-bottom.png` and `screenshots/personal-info-mobile-save.png` show that unchanged view. A later walker should verify actual scrolling and Save reachability after settled rendering before diagnosing this as a blocked workflow.
- Workspace mixes end-user connections with deployment infrastructure/model controls and admin-only setup instructions. This is a flow/design question, not a proven functional failure.
- Address/contact entities appear both in Personal info and Vault. No populated state or ownership relation tested.
- Mobile Toggle Sidebar measured 28×28px. This is below the rubric's 44px touch target; broader target-size assessment left for story walks.
- Development-only Next.js and Agentation floating controls cover small bottom areas on several screens. Invisible Agentation geometry reports were excluded. Chat chip and dialog footer unequal widths are intentional label-fit differences, not consistency findings.

## Errors and network

`agent-browser errors` returned no page errors. Console showed only React DevTools info and HMR connected. Requests inspected by URL/method/status only, without reading bodies; no failed requests were listed, completed requests were HTTP 200 or 304. A few redirect initiators had no terminal status entry of their own. No backend mutation journey or network-failure recovery tested.

## Flow log

Each destination was reached directly from its sidebar link. One extra click opened the empty Logins category dialog and one closed it. Mobile navigation menu not exercised in this baseline; viewports switched after desktop navigation. No forms completed, no external services connected, no synthetic messages sent. Desktop initial page layouts passed visual inspection; the two confirmed mobile defects require focused regression walks.
