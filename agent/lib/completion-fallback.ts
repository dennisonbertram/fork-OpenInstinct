import {
  taskRecords,
  type BoundedFact,
} from "@/agent/lib/completion-obligations";
import { reportPolicyForTurn } from "@/agent/lib/completion-report-policy";
import { hasUnconfirmedProviderAttempt } from "@/agent/lib/message-delivery";

/**
 * The one truthful thing to say when a completion summary could not be written.
 *
 * A composition can fail before anything is sent: the model errors, or produces
 * nothing usable. Saying nothing at all leaves settled work unreported, and
 * retrying the composition is how one failure becomes a loop. So there is one
 * bounded message, assembled from the records rather than written by a model,
 * and it does not claim the work succeeded.
 *
 * Composing is not sending, and this function only composes. It is idempotent:
 * asking twice gives the same text and consumes nothing. What stops a second
 * message is the obligation itself — delivering this text settles the cohort
 * through the ordinary path, and a settled cohort owes nothing. An earlier
 * version kept a separate counter and spent it at composition, which meant a
 * caller that composed and then abandoned delivery left settled work with no
 * report and no way to produce one.
 *
 * There is no fallback once a request may have reached a provider, because the
 * user may already have a message and nothing here can tell.
 *
 * Delivery, and the decision to deliver, stay with the messaging tool and the
 * channel that own them.
 */

/** The most claim text one fallback will carry for a single fact. */
const maximumClaimLength = 120;
/** The most facts one fallback will name, across the whole message. */
const maximumClaims = 3;

function corroborated(fact: BoundedFact) {
  return fact.evidence === "observed" || fact.evidence === "executor_receipt";
}

function bound(claim: string) {
  return claim.length <= maximumClaimLength
    ? claim
    : `${claim.slice(0, maximumClaimLength)}…`;
}

function list(facts: readonly BoundedFact[]) {
  return facts.map((fact) => bound(fact.claim)).join("; ");
}

export function completionFallbackText(turnId: string): string | undefined {
  const policy = reportPolicyForTurn();
  if (policy.kind !== "must_report") return undefined;
  // A request that may have reached a provider forbids an automatic second
  // message, whatever this one would have said.
  if (hasUnconfirmedProviderAttempt(turnId)) return undefined;

  const facts = taskRecords(policy.cohortId).flatMap(
    (task) => task.terminal?.facts ?? []
  );
  // One budget for the message, not one per section. Corroborated facts are the
  // most useful, so they are taken first.
  const confirmed = facts
    .filter((fact) => corroborated(fact))
    .slice(0, maximumClaims);
  const remaining = maximumClaims - confirmed.length;
  const asserted = facts
    .filter((fact) => fact.evidence === "worker_assertion")
    .slice(0, remaining);
  const unattributed = facts
    .filter((fact) => fact.evidence === "unknown")
    .slice(0, remaining - asserted.length);

  const lines = [
    "I could not prepare a summary of the background work, so this is what the records hold.",
  ];
  if (confirmed.length > 0) lines.push(`Confirmed: ${list(confirmed)}.`);
  if (asserted.length > 0) {
    // Attributed, never stated flatly. A worker's own word reported as a
    // finding is how an unverified claim becomes something the user believes.
    lines.push(`Reported by the worker but not confirmed: ${list(asserted)}.`);
  }
  if (unattributed.length > 0) {
    // Separate from the worker's claims on purpose. Unknown provenance does not
    // establish who said it, and naming a source this does not know would
    // invent one — the same mistake as inventing a fact.
    lines.push(`Recorded with no stated source: ${list(unattributed)}.`);
  }
  if (facts.length === 0) {
    lines.push("There is no recorded evidence of what the work achieved.");
  }
  // Only what the records establish. An earlier version added "I have not tried
  // again", which asserts a retry history nothing here inspects.
  lines.push("This is not a claim that the work succeeded.");
  return lines.join(" ");
}
