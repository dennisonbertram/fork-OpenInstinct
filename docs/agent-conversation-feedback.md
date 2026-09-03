# Agent Conversation Feedback Log

## Working mode: feedback collection only

These notes are for review and planning; they are not yet committed to runtime agent instruction files.

## 2026-09-03

- Email drafting should be represented as a message sequence, not one monolithic draft:
  - Recipient first (`To`)
  - Subject second (`Subject`)
  - Body in a single message (not split line-by-line or fragmented as separate messages)
  - Send as a separate final step
- Add explicit attachment handling in draft flow:
  - Ask for attachment intent/approval before sending
  - Support image attachments for preview
  - Support PDF attachments as visual previews (rendered images of pages)
  - Show attachments alongside draft fields so users can review as a grouped proposal before approving.

- Screenshot/visual example:
  - Reference image file: not yet captured in repository due temporary path access restrictions.
  - Intended: save to `docs/agent-feedback-assets/` and attach in this note for future reference.

- Gmail setup and send-flow performance:
  - Current multi-step Gmail compose flow feels too slow and can time out.
  - Prefer reducing friction by using a dedicated Gmail composition action/tool (if available), or a more direct native composition path instead of repeatedly breaking the message into many manual tool turns.
  - Consider an initial onboarding/setup step that lets the user connect all required integrations in one pass from the website, rather than repeatedly prompting through setup during task execution.
  - Keep the “To / Subject / Body / Send” preview structure, but optimize the underlying interaction latency.
  - Pending visual example source: `/var/folders/q1/08nrgkzd05x1wlqtrqx0hjpw0000gn/T/TemporaryItems/NSIRD_screencaptureui_NhQzKU/Screenshot 2026-09-03 at 3.24.39 PM.png` (not importable in this environment due temp path permission limits).

- Approval UX simplification:
  - After composing `To`, `Subject`, and full `Body`, approvals should not expose internal tool-call naming/choices to the user.
  - Replace flows like “approved / option approved, cancel” and “approve the tool call” with a single human-facing step:
    - “Reply”
    - “Send to approve”
  - The approval interaction should be collapsed to one action, not two-stage tool-specific chatter.

- Gmail OAuth sandbox-to-production research (as of 2026-09-03):
  - The slow/blocked Gmail sign-on behavior is commonly caused by OAuth app state, not the agent prompt alone.
  - In Google terms, being in **Testing** mode means:
    - Only up to 100 test users can be authorized.
    - Authorizations in testing expire quickly (7 days for test users; short-lived refresh behavior also applies with `offline` + unverified flows).
    - Unverified/sensitive-scope warnings are expected until verification is complete.
  - To get out of this sandbox state:
    1. In Google Cloud Console → APIs & Services → OAuth consent screen, publish the app from **Testing** to **In production**.
    2. Keep scopes minimal and accurate (Gmail/Calendar/People only as required).
    3. Complete/submit verification if sensitive or restricted scopes are used (usually required for Gmail production usage).
    4. Ensure OAuth metadata is complete: app name/domain/authorized domains/privacy policy/ToS/dev contacts.
    5. In Google Workspace org environments, admin API controls can still block/limit access even after publication; you may need admin approval/trust configuration.
  - For this repo’s integration path, after publishing/verification, use the existing Vercel Connect Google connector and re-run the connect flow so each user re-authorizes under the new app state.

- LINQ clarification (as of 2026-09-03):
  - This issue path is LINQ, not Google consent setup.
  - Treat Google consent as a separate item; LINQ sign-on is likely where the user-facing bottleneck is.
