import {
  claimCompletionReportPart,
  markAccepted,
  markProviderAttempted,
  markUnconfirmed,
  type CompletionReportClaim,
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

/** One physical effect of one report. A multi-part report claims each separately. */
type ReportPart = "text" | "attachment" | "media-upload" | "media-send";

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
  readonly part: ReportPart;
}

export type DispatchPermission =
  /** This caller holds the right to dispatch, and has recorded that it will. */
  | { readonly kind: "may_dispatch"; readonly claim: CompletionReportClaim }
  /** Already accepted. Do not dispatch; report what is known. */
  | { readonly kind: "already_accepted"; readonly claim: CompletionReportClaim }
  /**
   * Someone may already have dispatched this, or still holds the right to.
   * Never dispatch and never retry; say the outcome is unknown.
   */
  | { readonly kind: "do_not_dispatch"; readonly claim: CompletionReportClaim };

const defaultLeaseMs = 60_000;

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
  const outcome = await claimCompletionReportPart({
    channel: input.channel,
    contentDigest: input.contentDigest,
    conversationId: input.conversationId,
    // The row id is incidental; identity is the logical key below, so a
    // regenerated model call id cannot address a second row for the same part.
    id: `${input.identity.cohortId}:${String(input.identity.reportRevision)}:${input.identity.part}`,
    key: {
      cohortId: input.identity.cohortId,
      part: input.identity.part,
      reportRevision: input.identity.reportRevision,
      rootSessionId: input.identity.rootSessionId,
      workspaceId: input.identity.workspaceId,
    },
    leaseExpiresAt: new Date(now.getTime() + (input.leaseMs ?? defaultLeaseMs)),
    leaseOwner: input.leaseOwner,
    now,
  });

  if (outcome.kind === "settled") {
    return { claim: outcome.claim, kind: "already_accepted" };
  }
  if (outcome.kind === "uncertain") {
    return { claim: outcome.claim, kind: "do_not_dispatch" };
  }

  const attempted = await markProviderAttempted({
    id: outcome.claim.id,
    leaseOwner: input.leaseOwner,
    now,
    version: outcome.claim.version,
  });
  return attempted === undefined
    ? { claim: outcome.claim, kind: "do_not_dispatch" }
    : { claim: attempted, kind: "may_dispatch" };
}

/** Records that the channel accepted this part. */
export async function reportPartAccepted(input: {
  readonly claim: CompletionReportClaim;
  readonly providerHandle?: string;
}): Promise<boolean> {
  const settled = await markAccepted({
    id: input.claim.id,
    leaseOwner: input.claim.leaseOwner,
    providerHandle: input.providerHandle,
    version: input.claim.version,
  });
  return settled !== undefined;
}

/**
 * Records that the dispatch may have reached the provider without confirmation.
 * Terminal: there is no path from here back to a dispatch.
 */
export async function reportPartUnconfirmed(
  claim: CompletionReportClaim
): Promise<boolean> {
  const settled = await markUnconfirmed({
    id: claim.id,
    leaseOwner: claim.leaseOwner,
    version: claim.version,
  });
  return settled !== undefined;
}
