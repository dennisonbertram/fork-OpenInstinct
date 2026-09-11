import { defineState } from "eve/context";
import { taskRecords, type BoundedFact } from "@/agent/lib/completion-obligations";
import { reportPolicyForTurn } from "@/agent/lib/completion-report-policy";
import { hasUnconfirmedProviderAttempt } from "@/agent/lib/message-delivery";

/**
 * The one truthful thing to say when a completion summary could not be written.
 *
 * A composition can fail before anything is sent: the model errors, or produces
 * nothing usable. Saying nothing at all leaves settled work unreported, and
 * retrying the composition is how one failure becomes a loop. So there is
 * exactly one bounded message, assembled from the records rather than written
 * by a model, and it does not claim the work succeeded.
 *
 * Two refusals matter more than the text. There is no fallback once a request
 * may have reached a provider, because the user may already have a message and
 * nothing here can tell. And there is exactly one per obligation, because a
 * second bounded fallback is a second message about the same failure.
 *
 * This composes; it does not send. Delivery, and the decision to deliver, stay
 * with the messaging tool and the channel that own them.
 */

/** Which obligations have already spent their single fallback. */
const spent = defineState<readonly string[]>(
  "completion.fallback-spent",
  () => []
);

/** The most claim text one fallback will carry for a single fact. */
const maximumClaimLength = 120;
/** The most facts one fallback will name. */
const maximumClaims = 3;

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

function bound(claim: string) {
  return claim.length <= maximumClaimLength
    ? claim
    : `${claim.slice(0, maximumClaimLength)}…`;
}

export function completionFallbackText(_turnId: string): string | undefined {
  void spent;
  void maximumClaims;
  void maximumClaimLength;
  void corroborated;
  void bound;
  void taskRecords;
  void reportPolicyForTurn;
  void hasUnconfirmedProviderAttempt;
  throw new Error("not implemented");
}
