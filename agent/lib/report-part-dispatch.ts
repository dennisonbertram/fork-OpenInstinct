import {
  permitReportDispatch,
  reportPartAccepted,
  reportPartUnconfirmed,
  type ReportPartIdentity,
} from "@/agent/lib/completion-report-attempts";

/**
 * Wraps one physical effect of a completion report in its durable claim.
 *
 * This exists so a channel has one thing to call rather than an ordering to
 * remember. The ordering -- claim, record the attempt, then dispatch -- lives
 * here and is tested here, instead of being repeated at every provider call in
 * every channel, where one branch forgetting it would be invisible.
 *
 * An undefined identity means this send answers no completion obligation, which
 * is the ordinary case. Then this does nothing but call the dispatch, so a
 * channel behaves exactly as it did before the seam existed.
 *
 * Nothing here retries. A dispatch that throws after the attempt was recorded
 * has reached the provider as far as anyone can tell, so it is recorded as
 * unconfirmed and the error is passed on unchanged.
 */

export type ReportPartDispatch<T> =
  /** The dispatch ran. For a claimed part, acceptance has been recorded. */
  | { readonly kind: "sent"; readonly value: T }
  /**
   * The dispatch did not run, and must not be attempted again. Either the part
   * was already accepted, or its outcome is unknown and resending could repeat
   * an effect the user has already seen.
   */
  | {
      readonly kind: "not_dispatched";
      readonly reason: "already_accepted" | "uncertain";
    };

export async function dispatchReportPart<T>(input: {
  /** Absent for any message that is not answering a completion obligation. */
  readonly identity?: ReportPartIdentity;
  readonly channel: string;
  readonly conversationId: string;
  readonly contentDigest: string;
  readonly leaseOwner: string;
  readonly dispatch: () => Promise<T>;
  /** Reads the provider's own reference out of the result, when it returns one. */
  readonly providerHandle?: (value: T) => string | undefined;
}): Promise<ReportPartDispatch<T>> {
  const { identity } = input;
  if (identity === undefined) {
    return { kind: "sent", value: await input.dispatch() };
  }

  const permission = await permitReportDispatch({
    channel: input.channel,
    contentDigest: input.contentDigest,
    conversationId: input.conversationId,
    identity,
    leaseOwner: input.leaseOwner,
  });
  if (permission.kind === "already_accepted") {
    return { kind: "not_dispatched", reason: "already_accepted" };
  }
  if (permission.kind === "do_not_dispatch") {
    return { kind: "not_dispatched", reason: "uncertain" };
  }

  let value: T;
  try {
    value = await input.dispatch();
  } catch (error) {
    // The attempt is already recorded, so this request may have reached the
    // provider. Unknown, not failed, and never resent.
    await reportPartUnconfirmed(permission.claim);
    throw error;
  }
  await reportPartAccepted({
    claim: permission.claim,
    providerHandle: input.providerHandle?.(value),
  });
  return { kind: "sent", value };
}
