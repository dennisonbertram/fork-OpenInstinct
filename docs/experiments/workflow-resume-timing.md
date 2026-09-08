# Workflow resume timing diagnostic

Status: implemented locally; no deployed or live collection proof.

`WORKFLOW_RESUME_TIMING` defaults to `off`. When set to `on`,
`agent/instrumentation/workflow-resume-timing.ts` registers one Eve public-API
`otelIntegration` processor. It accepts only the framework-owned
`step.execute turnStep` span when all seven phase durations and
`workflow.resume.total_ms` are finite nonnegative numbers and
`workflow.resume.trigger` is the installed Workflow enum value `hook`.

For a qualifying span it writes one JSON `console.info` record with a constant
`workflow.resume.timing` event name and those nine allowlisted fields. The
processor does not read, retain, or serialize IDs, span/resource/link/event or
status attributes, messages, tool/model/token data, or any other attributes.

This is a global metadata-only operational log while the flag is enabled. It
cannot prove that a record belongs to one exact synthetic session. The enabled
branch disables Eve's seeded Vercel Agent Runs destination; it does not use the
Agent Runs UI or CLI as a retrieval path. Existing evlog and Linq runtime
context stay in place.

Focused synthetic tests prove the processor contract. They do not prove a
hosted Workflow resume has emitted a record, log retention, or production
behavior.
