# Text onboarding migration backup and restore check — 2026-09-14

## Result

Blocked before restore. Neon rejected creation of the approved fresh snapshot
with `snapshots limit exceeded`. No existing snapshot, branch, endpoint,
environment variable, migration, or deployment was changed. No restore was
attempted because a fresh snapshot of the confirmed production root could not
be created.

## Confirmed production target before and after the rejected request

- Neon project: `fancy-fog-76354652` (`open-instinct-db`)
- Root branch: `br-weathered-voice-avgu28zw` (`main`), primary and default,
  state `ready`
- Production endpoint: `ep-quiet-bird-av3ngf0l`, still bound to
  `br-weathered-voice-avgu28zw`
- Endpoint settings unchanged: read-write; minimum 0.25 CU; maximum 2 CU;
  suspend timeout 0 seconds

## Existing snapshot preserved

The only listed manual snapshot remains unchanged:

- Snapshot: `snap-dry-paper-av3bk41c`
- Source branch: `br-weathered-voice-avgu28zw`
- Created: `2026-09-10T01:32:10Z`
- Reported full size: 37,453,824 bytes

The root branch has no automatic snapshot schedule. This evidence does not
establish retention or encryption ownership.

## Required next decision

Do not delete or modify the September snapshot without explicit approval. To
perform the approved fresh backup and isolated restore rehearsal, an operator
must first make manual snapshot capacity available or obtain an approved limit
change. After a fresh snapshot exists, restore it only as a new branch with
`finalize:false` and no `target_branch_id`, wait for all provider operations to
finish, and then perform metadata-only connectivity and migration-journal
checks. Retain the resulting snapshot and restored branch until separately
approved for deletion.
