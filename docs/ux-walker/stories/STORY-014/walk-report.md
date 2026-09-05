# STORY-014 — Stop a response and continue, or recover from a failed turn

Status: **fail for observed recovery; cancellation acceptance uncertain**. Walked 2026-09-05 using `ux-fixed-openinstinct` at `http://localhost:3018`, designated synthetic account. Runtime is the coordinator's isolated local app with the reviewed history/task layout fixes. No application source was read or edited during this walk. Every captured PNG listed below was opened and visually inspected. Development Agentation geometry is excluded when hidden; no production conclusion follows from local checks.

## Observed walk and visual inspection

1. Used the existing owned synthetic conversation verified by STORY-016. Entered one bounded prompt asking for 150 short indoor-hobby ideas with no tools, browsing or external contact, then selected Submit.
2. After a brief wait a fresh snapshot exposed Stop and a disabled Message Jory field. `pending.png` shows the working dots and pending composer. This proves the pending control was available; it does not prove a cancellation request subsequently reached the server.
3. Activated that observed Stop control. `stopped.png` shows the long synthetic user prompt plus **Jory couldn't finish this request / Please try sending your message again.** The composer became editable and Submit returned. It is possible the turn changed state between snapshot and click; no server cancellation acceptance was inspected, so cancellation itself is not reported as passed or definitively broken.
4. Entered one short follow-up asking for a quiet indoor hobby and no tools, then selected Submit. After six seconds, `followup.png` still shows only the prior failed prompt/error; the follow-up text was absent from the conversation and the input was empty. No additional prompt or retry was issued.
5. `mobile-error.png` at 390×844 shows the failure feedback and accessible composer contained in the viewport. The short follow-up recovery goal was not achieved.

## Network, geometry and limits

`snapshots/network-tail.txt` records the initial session POST202 followed by later session POST409s. Only URL/method/status metadata was inspected; request/response bodies and implementation cause were not inferred. The multiple409 requests may include client retries; they do not mean multiple manual follow-ups were sent. `errors.txt` is empty. Mobile geometry is clean after excluding hidden Agentation. Desktop geometry flags 11–12px around the optional Show full trace switch, with no visible collision in the screenshot, so no layout finding is assigned.

## Flow log

The five intended actions were prompt entry, Submit, Stop activation, short follow-up entry and Submit. This matches the count of the ideal but failed the recovery outcome, so it is not a friction pass. The long-prompt wording differs from the catalog but exercises the same bounded harmless cancellation goal. No video was captured before this one allowed prompt; the sequence is supported by fresh snapshots/tool outcomes, screenshots and request metadata. No extra live request was issued merely to reproduce video. Root should investigate the failure without guessing credits or claiming a known race cause.
