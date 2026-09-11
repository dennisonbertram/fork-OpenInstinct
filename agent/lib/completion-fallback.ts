import { completionReportText } from "@/agent/lib/completion-report-text";
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

export function completionFallbackText(turnId: string): string | undefined {
  const policy = reportPolicyForTurn();
  if (policy.kind !== "must_report") return undefined;
  // A request that may have reached a provider forbids an automatic second
  // message, whatever this one would have said.
  if (hasUnconfirmedProviderAttempt(turnId)) return undefined;

  const records = completionReportText(policy.cohortIds);
  return [
    "I could not prepare a summary of the background work, so this is what the records hold.",
    records,
    "This is not a claim that the work succeeded.",
  ]
    .filter((line) => line !== undefined && line.length > 0)
    .join(" ");
}
