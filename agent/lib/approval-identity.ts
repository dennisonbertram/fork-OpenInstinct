import { createHash } from "node:crypto";
import { z } from "zod";
import { defineState } from "eve/context";

/**
 * Binds a parked native approval to the exact thing it authorised.
 *
 * An approval can be answered long after it was asked: a structured response
 * may resume a request after other turns have happened. What must not happen is
 * an old answer authorising a *different* action than the one a person saw. So
 * the authorised material terms are reduced to a fingerprint at the moment the
 * approval is requested, and a resume is only honoured when the terms still
 * hash to the same value.
 *
 * The fingerprint is compared, never displayed, and never stored alongside the
 * values it summarises. Payment and vault fields are excluded deliberately: a
 * person authorises the action and its terms, and secret material must not
 * reach this record even as a hash input.
 */

/**
 * A material term's value. The authored commit terms are flat records of
 * strings and counts, so nothing here needs to walk nested structures.
 */
type MaterialTermValue = string | number;

/** The already-authorised fields of a browser commit that define its identity. */
export interface MaterialActionTerms {
  readonly action: string;
  readonly origin: string;
  readonly target_ref: string;
  readonly target_token?: string;
  readonly terms: Readonly<Record<string, MaterialTermValue>>;
}

/**
 * Canonical form: the outer fields and the terms as sorted key/value pairs,
 * serialised as JSON.
 *
 * JSON rather than a delimiter-joined string, deliberately. A term value is
 * free text — a message body, a merchant name — so any separator character
 * could appear inside a value and forge a field boundary, making two different
 * actions hash alike. Quoting removes that whole class of ambiguity. It also
 * keeps a count distinct from the same digits as text, and it escapes lone
 * surrogates rather than letting UTF-8 fold them onto the replacement
 * character, which would collide two genuinely different values.
 *
 * An absent target token encodes as null, which no supplied token can produce,
 * so absence is not the same as an empty one.
 */
/**
 * What may be hashed, parsed rather than assumed.
 *
 * Numbers must be finite, which `z.number()` already requires: JSON encodes
 * NaN, Infinity and -Infinity all as null, so three different terms would share
 * one digest. Fingerprint equality is the whole basis for deciding an action is
 * unchanged, so a digest that cannot tell them apart must not be produced at
 * all.
 *
 * Parsing here also drops anything beyond the declared outer fields, which is
 * what makes "a caller cannot widen the hash" true at runtime and not only in
 * the type.
 */
const hashableTermsSchema = z.object({
  action: z.string(),
  origin: z.string(),
  target_ref: z.string(),
  target_token: z.string().optional(),
  terms: z.record(z.string(), z.union([z.string(), z.number()])),
});

function canonicalForm(input: MaterialActionTerms): string {
  const parsed = hashableTermsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      "A material term must be a string or a finite number, and the action, origin and target must be strings."
    );
  }
  return JSON.stringify([
    parsed.data.action,
    parsed.data.origin,
    parsed.data.target_ref,
    parsed.data.target_token ?? null,
    Object.entries(parsed.data.terms).toSorted(([left], [right]) =>
      left < right ? -1 : 1
    ),
  ]);
}

/**
 * Fingerprints exactly what a person authorised.
 *
 * Derived only from the action, its material terms, the origin, and the
 * snapshot-scoped target. Payment and vault references are not declared fields,
 * so a caller passing them as extra top-level properties cannot widen the hash.
 *
 * That is the limit of what this enforces, and the distinction matters. Every
 * entry inside `terms` is hashed, so keeping secret material out of `terms` is
 * the caller's precondition, not a guarantee made here. `commit_browser_action`
 * is where the allowed term fields are decided.
 */
export function materialTermsFingerprint(input: MaterialActionTerms): string {
  return createHash("sha256").update(canonicalForm(input)).digest("hex");
}

export interface PendingApproval {
  readonly requestId: string;
  readonly taskId: string;
  readonly cohortId: string;
  readonly objectiveRevision: string;
  readonly fingerprint: string;
}

export type ApprovalResumeOutcome =
  /** The answer matches the request and the terms are unchanged. */
  | { readonly kind: "authorized"; readonly approval: PendingApproval }
  /** No such parked request; a plain new turn must not consume an approval. */
  | { readonly kind: "unknown" }
  /** The answer is for this request but the action changed underneath it. */
  | { readonly kind: "terms_changed" }
  /** The answer arrived for a different task than the one that parked. */
  | { readonly kind: "wrong_task" };

/**
 * Decides whether a structured approval answer authorises the action now in
 * hand. A changed fingerprint needs a fresh native approval: prose confirmation
 * is never a substitute, and nothing here may widen what can be approved.
 */
export function resolveApprovalResume(
  pending: PendingApproval | undefined,
  answer: {
    readonly requestId: string;
    readonly taskId: string;
    readonly fingerprint: string;
  }
): ApprovalResumeOutcome {
  if (pending === undefined || pending.requestId !== answer.requestId) {
    return { kind: "unknown" };
  }
  if (pending.taskId !== answer.taskId) return { kind: "wrong_task" };
  if (pending.fingerprint !== answer.fingerprint) {
    return { kind: "terms_changed" };
  }
  return { approval: pending, kind: "authorized" };
}

/**
 * How many native approvals this session will hold parked at once.
 *
 * A parked request is a question a person was actually asked, so the limit
 * refuses a new one rather than evicting an old one: losing that record
 * silently is worse than declining to park another.
 */
export const approvalCapacity = { parked: 8 } as const;

const parked = defineState<readonly PendingApproval[]>(
  "completion.parked-approvals",
  () => []
);

/** Every request this session is waiting on an answer for. */
export function parkedApprovals(): readonly PendingApproval[] {
  return parked.get();
}

/** The request the given task is waiting on, if it is waiting on one. */
export function parkedApprovalFor(taskId: string): PendingApproval | undefined {
  return parked.get().find((candidate) => candidate.taskId === taskId);
}

/**
 * Records that this task is waiting on a native approval.
 *
 * Returns false when it could not be parked: the task already has a request
 * outstanding, or the session is holding as many as it will.
 */
export function parkApproval(pending: PendingApproval): boolean {
  // Copied field by field rather than kept by reference. `readonly` is a
  // compile-time promise about this parameter's type, not a runtime one about
  // the caller's object, so keeping the reference would let a caller change
  // which action is authorised after a person was asked about a different one.
  // Rebuilding it also drops any extra properties, which a TypeScript interface
  // does not strip at runtime -- an object carrying a secret alongside the
  // declared fields would otherwise put it into session state.
  const record: PendingApproval = {
    cohortId: pending.cohortId,
    fingerprint: pending.fingerprint,
    objectiveRevision: pending.objectiveRevision,
    requestId: pending.requestId,
    taskId: pending.taskId,
  };
  let didPark = false;
  parked.update((current) => {
    // One outstanding request per task, and one task per request id. Either
    // duplicate makes an answer ambiguous about which question it answers.
    if (
      current.some(
        (candidate) =>
          candidate.taskId === record.taskId ||
          candidate.requestId === record.requestId
      )
    ) {
      return current;
    }
    if (current.length >= approvalCapacity.parked) return current;
    didPark = true;
    return [...current, record];
  });
  return didPark;
}

/**
 * Decides whether a structured answer authorises the request it names, and
 * retires that request when it does.
 *
 * Only an authorised answer retires it. A changed action leaves the request
 * parked, because the person did authorise something, and the changed action
 * needs its own approval rather than inheriting this one's absence.
 */
export function resumeParkedApproval(answer: {
  readonly requestId: string;
  readonly taskId: string;
  readonly fingerprint: string;
}): ApprovalResumeOutcome {
  const pending = parked
    .get()
    .find((candidate) => candidate.requestId === answer.requestId);
  const outcome = resolveApprovalResume(pending, answer);
  if (outcome.kind === "authorized") {
    // Retired on use, so one approval cannot authorise a second attempt. Matched
    // on both halves of the identity so retirement cannot reach past the record
    // that was actually resolved.
    parked.update((current) =>
      current.filter(
        (candidate) =>
          candidate.requestId !== answer.requestId ||
          candidate.taskId !== answer.taskId
      )
    );
  }
  return outcome;
}

/** Removes a request without authorising it, for a cancelled or abandoned task. */
export function clearParkedApproval(requestId: string): boolean {
  let didClear = false;
  parked.update((current) => {
    if (!current.some((candidate) => candidate.requestId === requestId)) {
      return current;
    }
    didClear = true;
    return current.filter((candidate) => candidate.requestId !== requestId);
  });
  return didClear;
}
