import {
  claimCompletionReportBundle,
  markBundleAccepted,
  markBundleProviderAttempted,
  markBundleUnconfirmed,
  type CompletionReportClaim,
  type CompletionReportBundleMember,
} from "@/db/services/completion-report-attempts";

/**
 * Turns a completion obligation into the durable claim a dispatch needs, and
 * enforces the order those two must happen in.
 *
 * The service under this owns the compare-and-swap. What this adds is the
 * ordering rule a caller can otherwise get wrong: a part must be claimed, then
 * recorded as attempted, and only then dispatched. Skipping the middle step is
 * what leaves a send that may have happened with nothing saying so.
 *
 * It is deliberately not a retry helper. Nothing here re-dispatches, and a part
 * that comes back uncertain stays uncertain.
 */

/**
 * One physical effect of one report. A multi-part report claims each
 * separately. A report can carry several media items, so each upload and each
 * send carries its own ordinal -- otherwise a second image would collide with
 * the first image's claim, and one accepted upload would look like both were.
 */
export type ReportPart =
  | "text"
  | "attachment"
  | `media-upload:${number}`
  | `media-send:${number}`;

export interface ReportPartIdentity {
  readonly workspaceId: string;
  readonly rootSessionId: string;
  readonly cohortId: string;
  /**
   * Which report for this cohort. The obligation records do not count reports,
   * so the caller supplies this from the turn that owes it: a later turn asking
   * again is a new revision, not a retry of the old one.
   */
  readonly reportRevision: number;
  /**
   * The complete ordered roster covered by this one physical report. New
   * callers must provide it; the representative fields remain for old,
   * single-cohort callers while channel consumers are migrated.
   */
  readonly cohorts?: readonly CompletionReportBundleMember[];
  readonly part: ReportPart;
}

export type DispatchPermission =
  /** This caller holds the right to dispatch, and has recorded that it will. */
  | {
      readonly kind: "may_dispatch";
      readonly claim: CompletionReportClaim;
      readonly claims: readonly CompletionReportClaim[];
    }
  /** Already accepted. Do not dispatch; report what is known. */
  | {
      readonly kind: "already_accepted";
      readonly claim: CompletionReportClaim;
      readonly claims: readonly CompletionReportClaim[];
    }
  /**
   * Someone may already have dispatched this, or still holds the right to.
   * Never dispatch and never retry; say the outcome is unknown.
   */
  | {
      readonly kind: "do_not_dispatch";
      readonly claim: CompletionReportClaim;
      readonly claims: readonly CompletionReportClaim[];
    };

const defaultLeaseMs = 60_000;

function membersFor(identity: ReportPartIdentity) {
  const supplied = identity.cohorts ?? [
    { cohortId: identity.cohortId, reportRevision: identity.reportRevision },
  ];
  const sorted = supplied.toSorted(
    (left, right) =>
      left.cohortId.localeCompare(right.cohortId) ||
      left.reportRevision - right.reportRevision
  );
  for (const [index, member] of supplied.entries()) {
    const canonical = sorted.at(index);
    if (
      !canonical ||
      member.cohortId !== canonical.cohortId ||
      member.reportRevision !== canonical.reportRevision
    )
      throw new Error("Completion report cohorts must be in canonical order.");
  }
  if (
    sorted.some(
      (member, index) =>
        index > 0 &&
        member.cohortId === sorted[index - 1]?.cohortId &&
        member.reportRevision === sorted[index - 1]?.reportRevision
    )
  )
    throw new Error("Completion report cohorts must be unique.");
  return sorted;
}

function firstClaim(claims: readonly CompletionReportClaim[]) {
  const claim = claims.at(0);
  if (!claim) throw new Error("Completion report bundle had no claims.");
  return claim;
}

/**
 * Claims one report part and records the intent to dispatch, in that order.
 *
 * Returns `may_dispatch` only after the durable compare-and-swap to `attempted`
 * has succeeded. Holding a claim is not permission: if another owner wins that
 * swap first, this caller must not call the provider, because the other one may
 * already be doing so.
 */
export async function permitReportDispatch(input: {
  readonly identity: ReportPartIdentity;
  readonly channel: string;
  readonly conversationId: string;
  readonly contentDigest: string;
  readonly leaseOwner: string;
  readonly leaseMs?: number;
  readonly now?: Date;
}): Promise<DispatchPermission> {
  const now = input.now ?? new Date();
  const members = membersFor(input.identity);
  const outcome = await claimCompletionReportBundle({
    channel: input.channel,
    contentDigest: input.contentDigest,
    conversationId: input.conversationId,
    members,
    physicalPart: input.identity.part,
    rootSessionId: input.identity.rootSessionId,
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? defaultLeaseMs)),
    leaseOwner: input.leaseOwner,
    now,
    workspaceId: input.identity.workspaceId,
  });

  if (outcome.kind === "settled") {
    return {
      claim: firstClaim(outcome.claims),
      claims: outcome.claims,
      kind: "already_accepted",
    };
  }
  if (outcome.kind === "uncertain") {
    return {
      claim: firstClaim(outcome.claims),
      claims: outcome.claims,
      kind: "do_not_dispatch",
    };
  }

  const attempted = await markBundleProviderAttempted(outcome.claims);
  return attempted === undefined
    ? {
        claim: firstClaim(outcome.claims),
        claims: outcome.claims,
        kind: "do_not_dispatch",
      }
    : { claim: firstClaim(attempted), claims: attempted, kind: "may_dispatch" };
}

/** Records that the channel accepted this part. */
export async function reportPartAccepted(input: {
  readonly claim?: CompletionReportClaim;
  readonly claims?: readonly CompletionReportClaim[];
  readonly providerHandle?: string;
}): Promise<boolean> {
  const claims = input.claims ?? (input.claim ? [input.claim] : []);
  const settled = await markBundleAccepted({
    claims,
    providerHandle: input.providerHandle,
  });
  return settled !== undefined;
}

/**
 * Records that the dispatch may have reached the provider without confirmation.
 * Terminal: there is no path from here back to a dispatch.
 */
export async function reportPartUnconfirmed(
  claim: CompletionReportClaim | readonly CompletionReportClaim[]
): Promise<boolean> {
  const settled = await markBundleUnconfirmed(
    Array.isArray(claim) ? claim : [claim]
  );
  return settled !== undefined;
}
