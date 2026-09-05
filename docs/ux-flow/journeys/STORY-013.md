# STORY-013: Get a reply, continue, and reload

Evidence: ../../ux-walker/preflight/root-followup.md. Screenshots actually viewed: ../../ux-walker/preflight/chat-result.png, ../../ux-walker/preflight/chat-followup.png. Initial local evidence is from 2026-09-05, localhost:3000 at f11a3a1; post-fix acceptance is separate.

## Friction Scorecard

- **Verdict:** ungraded: failed first-send outcome, recovered follow-up.
- **Actual / ideal actions:** 5 recorded actions in first attempt/recovery subset (first input+submit, reload, follow-up input+submit) / ideal 5. Same count does not mean same goal achieved.
- **Decisions, re-entry, confirmations, dead ends, hesitation:** First turn settled without assistant, progress, or error; reload preserved that state. A second prompt produced Hi! after Stop appeared while pending. There is one observed recovery prompt, but it is not evidence that all conversations require this detour. Cause unknown.
- Timing, user-success rates, and population-wide frequency were not measured.

## Take-away Pass

Keep the conversation/composer. Treat the developer Activity card and token totals as diagnostics rather than the answer or proof of completion. Do not “simplify” by hiding failure; the needed next action should be explicit when a turn cannot produce an answer.

## The Simpler Version

1. Send a prompt and receive a visible answer, or a clear failure state with a recovery action.
2. Send follow-up and retain both turns after reload.

This is an outcome/feedback requirement, not a new screen or speculative automatic retry. Diagnose the silent first turn before selecting a fix.

## Clarity Issues

The failed screen shows usage and No tasks yet but gives no explanation for a missing reply. An ordinary user cannot infer whether the agent finished, is still working, or needs another message. Synthetic E2E later passed normal and explicit-error cases; it does not erase this live observation.
