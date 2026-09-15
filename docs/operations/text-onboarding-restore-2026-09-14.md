# Text onboarding migration backup and restore check — 2026-09-14

## Result

The September 10 snapshot was deleted with explicit owner approval after a
fresh snapshot attempt was rejected for reaching the manual-snapshot limit. A
single replacement snapshot was then created from the confirmed production root:

- Snapshot: `snap-plain-dew-avttytlk`
- Name: `text-onboarding-pre-merge-2026-09-14`
- Source branch: `br-weathered-voice-avgu28zw`
- Created: `2026-09-14T23:36:12Z`
- Manual: `true`

No restore, new branch, new endpoint, environment-variable, migration, or
deployment action occurred. The owner waived the restore rehearsal for this
unused development database; this note is snapshot evidence, not a recovery
test claim.

## Confirmed production target before and after snapshot replacement

- Neon project: `fancy-fog-76354652` (`open-instinct-db`)
- Root branch: `br-weathered-voice-avgu28zw` (`main`), primary and default,
  state `ready`
- Production endpoint: `ep-quiet-bird-av3ngf0l`, still bound to
  `br-weathered-voice-avgu28zw`
- Endpoint settings unchanged: read-write; minimum 0.25 CU; maximum 2 CU;
  suspend timeout 0 seconds

## Replaced snapshot

The approved deletion permanently removed this former recovery point:

- Snapshot: `snap-dry-paper-av3bk41c`
- Source branch: `br-weathered-voice-avgu28zw`
- Created: `2026-09-10T01:32:10Z`
- Reported full size: 37,453,824 bytes

The root branch has no automatic snapshot schedule. The replacement snapshot is
retained. This evidence does not establish retention or encryption ownership.

## Scope boundary

Do not delete or modify `snap-plain-dew-avttytlk` without explicit approval.
The owner waived the isolated restore rehearsal for this unused development
database. That waiver does not remove the independent preview-isolation,
budget, candidate-line capability, fresh-phone acceptance, PR review, merge,
or off-by-default activation gates.
